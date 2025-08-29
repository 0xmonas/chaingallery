import fetch from 'node-fetch';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
// Canvas removed due to installation issues on macOS
// gif-frames removed due to security vulnerabilities
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Production check
const isProduction = process.env.NODE_ENV === 'production';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Temporary directory for media processing
const TEMP_DIR = path.join(__dirname, 'temp');

// Ensure temp directory exists
await fs.mkdir(TEMP_DIR, { recursive: true }).catch(() => {});

/**
 * Detects media type and properties from URL
 */
export async function detectMediaType(url) {
  // Handle data URLs (like CryptoPunks SVGs)
  if (url.startsWith('data:')) {
    try {
      const [header] = url.split(',');
      const mimeType = header.split(';')[0].replace('data:', '') || 'application/octet-stream';
      
      // Estimate size (data URLs are typically small)
      const estimatedSize = url.length * 0.75; // Base64 is ~33% larger than binary
      
      return analyzeMediaInfo(mimeType, estimatedSize, url);
    } catch (error) {
      if (!isProduction) {
        console.warn('Data URL parsing failed:', error.message);
      }
      return analyzeMediaInfo('application/octet-stream', 0, url);
    }
  }
  
  try {
    const response = await fetch(url, { 
      method: 'HEAD',
      timeout: 5000,
      headers: {
        'User-Agent': 'ChainGallery/1.0'
      }
    });
    
    if (!response.ok) {
      // If HEAD fails, try GET with range
      const getResponse = await fetch(url, {
        headers: {
          'Range': 'bytes=0-1023', // First 1KB
          'User-Agent': 'ChainGallery/1.0'
        },
        timeout: 5000
      });
      
      const contentType = getResponse.headers.get('content-type') || 'application/octet-stream';
      const contentLength = getResponse.headers.get('content-length') || 
                           getResponse.headers.get('content-range')?.split('/')[1] || '0';
      
      return analyzeMediaInfo(contentType, parseInt(contentLength), url);
    }
    
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentLength = parseInt(response.headers.get('content-length') || '0');
    
    return analyzeMediaInfo(contentType, contentLength, url);
    
  } catch (error) {
    if (!isProduction) {
      console.warn('Media type detection failed:', error.message);
    }
    // Fallback to URL extension analysis
    return analyzeFromUrl(url);
  }
}

/**
 * Analyzes media info from content type and size
 */
function analyzeMediaInfo(contentType, size, url) {
  const mimeType = contentType.toLowerCase().split(';')[0].trim();
  
  return {
    mimeType,
    size,
    url,
    isImage: mimeType.startsWith('image/'),
    isVideo: mimeType.startsWith('video/'),
    isAudio: mimeType.startsWith('audio/'),
    isAnimated: mimeType === 'image/gif' || mimeType.startsWith('video/'),
    isVector: mimeType === 'image/svg+xml',
    isSupported: isNativeSupported(mimeType),
    needsConversion: !isNativeSupported(mimeType),
    category: categorizeMedia(mimeType)
  };
}

/**
 * Fallback analysis from URL extension
 */
function analyzeFromUrl(url) {
  try {
    const urlPath = new URL(url).pathname;
    const extension = urlPath.split('.').pop()?.toLowerCase() || '';
    const mimeTypeMap = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'webp': 'image/webp',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'mov': 'video/quicktime',
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav'
    };
    
    const mimeType = mimeTypeMap[extension] || 'application/octet-stream';
    return analyzeMediaInfo(mimeType, 0, url);
  } catch (error) {
    // If URL parsing fails, return unknown
    return analyzeMediaInfo('application/octet-stream', 0, url);
  }
}

/**
 * Checks if media type is natively supported by Gemini
 */
function isNativeSupported(mimeType) {
  const supportedTypes = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic',
    'image/heif'
  ]);
  
  return supportedTypes.has(mimeType);
}

/**
 * Categorizes media for processing strategy
 */
function categorizeMedia(mimeType) {
  if (mimeType.startsWith('image/')) {
    if (mimeType === 'image/gif') return 'animated_image';
    if (mimeType === 'image/svg+xml') return 'vector_image';
    return 'static_image';
  }
  
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  
  return 'unknown';
}

/**
 * Converts IPFS URLs to HTTP gateway URLs
 */
export function convertIpfsToHttp(url) {
  if (url.startsWith('ipfs://')) {
    const ipfsHash = url.replace('ipfs://', '');
    const gateways = [
      `https://ipfs.io/ipfs/${ipfsHash}`,
      `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
      `https://cloudflare-ipfs.com/ipfs/${ipfsHash}`,
      `https://dweb.link/ipfs/${ipfsHash}`
    ];
    return gateways[0];
  }
  return url;
}

/**
 * Downloads media file to temporary location
 */
export async function downloadMedia(url) {
  let buffer;
  
  // Handle data URLs (like CryptoPunks SVGs)
  if (url.startsWith('data:')) {
    try {
      // Extract base64 data from data URL
      const [header, data] = url.split(',');
      if (!data) {
        throw new Error('Invalid data URL format');
      }
      
      // Check if it's base64 encoded
      if (header.includes('base64')) {
        buffer = Buffer.from(data, 'base64').buffer;
      } else {
        // URL-encoded data
        buffer = Buffer.from(decodeURIComponent(data), 'utf8').buffer;
      }
    } catch (error) {
      throw new Error(`Failed to process data URL: ${error.message}`);
    }
  } else {
    // Handle regular URLs
    const httpUrl = convertIpfsToHttp(url);
    const response = await fetch(httpUrl, {
      timeout: 30000,
      headers: {
        'User-Agent': 'ChainGallery/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to download media: ${response.status}`);
    }
    
    buffer = await response.arrayBuffer();
  }
  
  // Security check - max 20MB
  if (buffer.byteLength > 20 * 1024 * 1024) {
    throw new Error('Media file too large. Maximum size is 20MB.');
  }
  
  const tempId = uuidv4();
  // Extract extension more safely
  let extension = 'bin';
  
  if (url.startsWith('data:')) {
    // For data URLs, extract extension from mime type
    const [header] = url.split(',');
    const mimeType = header.split(';')[0].replace('data:', '');
    const extensionMap = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/svg+xml': 'svg',
      'image/gif': 'gif',
      'image/webp': 'webp'
    };
    extension = extensionMap[mimeType] || 'bin';
  } else {
    // For regular URLs
    const httpUrl = convertIpfsToHttp(url);
    const urlPath = new URL(httpUrl).pathname;
    extension = urlPath.split('.').pop()?.toLowerCase() || 'bin';
  }
  
  // Sanitize extension (only allow alphanumeric)
  const safeExtension = extension.replace(/[^a-z0-9]/gi, '') || 'bin';
  const tempPath = path.join(TEMP_DIR, `${tempId}.${safeExtension}`);
  
  await fs.writeFile(tempPath, Buffer.from(buffer));
  
  return {
    path: tempPath,
    buffer: Buffer.from(buffer),
    size: buffer.byteLength,
    cleanup: () => fs.unlink(tempPath).catch(() => {})
  };
}

/**
 * Extracts first frame from GIF using Sharp
 */
export async function extractGifFrame(filePath) {
  try {
    // Sharp can extract the first frame of animated GIFs
    return await sharp(filePath)
      .png() // Convert to PNG
      .toBuffer();
  } catch (error) {
    if (!isProduction) {
      console.warn('Sharp GIF frame extraction failed:', error.message);
    }
    
    // Create a placeholder if GIF processing fails
    const placeholderSvg = `
      <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f0f0f0"/>
        <text x="50%" y="45%" text-anchor="middle" dy="0.35em" font-family="Arial" font-size="24" fill="#666">
          GIF Content
        </text>
        <text x="50%" y="55%" text-anchor="middle" dy="0.35em" font-family="Arial" font-size="14" fill="#999">
          (Animated GIF)
        </text>
      </svg>
    `;
    
    return await sharp(Buffer.from(placeholderSvg))
      .png()
      .toBuffer();
  }
}

/**
 * Extracts frame from video file
 */
export async function extractVideoFrame(filePath, timeOffset = 1) {
  return new Promise((resolve, reject) => {
    const tempId = uuidv4();
    const outputPath = path.join(TEMP_DIR, `${tempId}_frame.png`);
    
    ffmpeg(filePath)
      .seekInput(timeOffset) // Seek to 1 second
      .frames(1)
      .output(outputPath)
      .on('end', async () => {
        try {
          const buffer = await fs.readFile(outputPath);
          await fs.unlink(outputPath).catch(() => {});
          resolve(buffer);
        } catch (error) {
          reject(error);
        }
      })
      .on('error', (error) => {
        reject(new Error(`Video frame extraction failed: ${error.message}`));
      })
      .run();
  });
}

/**
 * Rasterizes SVG to PNG using Sharp (simplified version)
 */
export async function rasterizeSvg(svgBuffer, width = 512, height = 512) {
  try {
    // Sharp can handle basic SVGs
    return await sharp(svgBuffer)
      .resize(width, height, { fit: 'inside', withoutEnlargement: false })
      .png()
      .toBuffer();
  } catch (error) {
    if (!isProduction) {
      console.warn('Sharp SVG processing failed:', error.message);
    }
    
    // Create a simple placeholder image for complex SVGs
    const placeholderSvg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f0f0f0"/>
        <text x="50%" y="50%" text-anchor="middle" dy="0.35em" font-family="Arial" font-size="24" fill="#666">
          SVG Content
        </text>
        <text x="50%" y="60%" text-anchor="middle" dy="0.35em" font-family="Arial" font-size="14" fill="#999">
          (Complex SVG)
        </text>
      </svg>
    `;
    
    return await sharp(Buffer.from(placeholderSvg))
      .png()
      .toBuffer();
  }
}

/**
 * Generates spectrogram visualization for audio files
 */
export async function generateSpectrogram(filePath, width = 512, height = 512) {
  return new Promise((resolve, reject) => {
    const tempId = uuidv4();
    const outputPath = path.join(TEMP_DIR, `${tempId}_spectrogram.png`);
    
    ffmpeg(filePath)
      .complexFilter([
        `[0:a]showspectrumpic=s=${width}x${height}:mode=separate:color=intensity:scale=cbrt[spec]`
      ])
      .outputOptions(['-map', '[spec]'])
      .output(outputPath)
      .on('end', async () => {
        try {
          const buffer = await fs.readFile(outputPath);
          await fs.unlink(outputPath).catch(() => {});
          resolve(buffer);
        } catch (error) {
          reject(error);
        }
      })
      .on('error', (error) => {
        reject(new Error(`Spectrogram generation failed: ${error.message}`));
      })
      .run();
  });
}

/**
 * Cleans up temporary files older than 1 hour
 */
export async function cleanupTempFiles() {
  try {
    const files = await fs.readdir(TEMP_DIR);
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      const stats = await fs.stat(filePath);
      
      if (now - stats.mtime.getTime() > oneHour) {
        await fs.unlink(filePath).catch(() => {});
      }
    }
  } catch (error) {
    if (!isProduction) {
      console.warn('Temp cleanup failed:', error.message);
    }
  }
}

// Schedule cleanup every hour
setInterval(cleanupTempFiles, 60 * 60 * 1000);
