import {
  detectMediaType,
  convertIpfsToHttp,
  downloadMedia,
  extractGifFrame,
  extractVideoFrame,
  rasterizeSvg,
  generateSpectrogram
} from './mediaUtils.js';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache for processed media
const mediaCache = new Map();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

/**
 * Processes NFT media for optimal Gemini consumption
 */
export async function processNftMedia(nft) {
  const mediaUrl = nft.image;
  if (!mediaUrl) {
    throw new Error('No media URL provided');
  }
  
  // Check cache first
  const cacheKey = `${mediaUrl}_optimized`;
  if (mediaCache.has(cacheKey)) {
    const cached = mediaCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
    mediaCache.delete(cacheKey);
  }
  
  try {
    const httpUrl = convertIpfsToHttp(mediaUrl);
    const mediaInfo = await detectMediaType(httpUrl);
    
    // Media processing starts
    
    let processedMedia;
    
    switch (mediaInfo.category) {
      case 'static_image':
        processedMedia = await processStaticImage(httpUrl, mediaInfo);
        break;
        
      case 'animated_image':
        processedMedia = await processAnimatedImage(httpUrl, mediaInfo);
        break;
        
      case 'vector_image':
        processedMedia = await processVectorImage(httpUrl, mediaInfo);
        break;
        
      case 'video':
        processedMedia = await processVideo(httpUrl, mediaInfo);
        break;
        
      case 'audio':
        processedMedia = await processAudio(httpUrl, mediaInfo);
        break;
        
      default:
        throw new Error(`Unsupported media type: ${mediaInfo.mimeType}`);
    }
    
    // Cache the result
    mediaCache.set(cacheKey, {
      data: processedMedia,
      timestamp: Date.now()
    });
    
    return processedMedia;
    
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Media processing failed:', error);
    }
    throw new Error(`Failed to process media: ${error.message}`);
  }
}

/**
 * Processes static images with optimization
 */
async function processStaticImage(url, mediaInfo) {
  const download = await downloadMedia(url);
  
  try {
    // Optimize for Gemini: 256x256, JPEG, quality 80
    const optimizedBuffer = await sharp(download.buffer)
      .resize(256, 256, { 
        fit: 'inside', 
        withoutEnlargement: true,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .jpeg({ quality: 80 })
      .toBuffer();
    
    return {
      buffer: optimizedBuffer,
      mimeType: 'image/jpeg',
      size: optimizedBuffer.length,
      dimensions: { width: 256, height: 256 },
      originalType: mediaInfo.mimeType,
      processingType: 'optimized_static'
    };
    
  } finally {
    await download.cleanup();
  }
}

/**
 * Processes animated images (GIFs) by extracting first frame
 */
async function processAnimatedImage(url, mediaInfo) {
  const download = await downloadMedia(url);
  
  try {
    let frameBuffer;
    
    if (mediaInfo.mimeType === 'image/gif') {
      frameBuffer = await extractGifFrame(download.path);
    } else {
      // Fallback for other animated formats
      frameBuffer = await sharp(download.buffer).png().toBuffer();
    }
    
    // Optimize the extracted frame
    const optimizedBuffer = await sharp(frameBuffer)
      .resize(256, 256, { 
        fit: 'inside', 
        withoutEnlargement: true,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .jpeg({ quality: 80 })
      .toBuffer();
    
    return {
      buffer: optimizedBuffer,
      mimeType: 'image/jpeg',
      size: optimizedBuffer.length,
      dimensions: { width: 256, height: 256 },
      originalType: mediaInfo.mimeType,
      processingType: 'extracted_frame'
    };
    
  } finally {
    await download.cleanup();
  }
}

/**
 * Processes vector images (SVGs) by rasterizing
 */
async function processVectorImage(url, mediaInfo) {
  const download = await downloadMedia(url);
  
  try {
    // Rasterize SVG to PNG first
    const rasterizedBuffer = await rasterizeSvg(download.buffer, 512, 512);
    
    // Then optimize for Gemini
    const optimizedBuffer = await sharp(rasterizedBuffer)
      .resize(256, 256, { 
        fit: 'inside', 
        withoutEnlargement: true,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .jpeg({ quality: 80 })
      .toBuffer();
    
    return {
      buffer: optimizedBuffer,
      mimeType: 'image/jpeg',
      size: optimizedBuffer.length,
      dimensions: { width: 256, height: 256 },
      originalType: mediaInfo.mimeType,
      processingType: 'rasterized_vector'
    };
    
  } finally {
    await download.cleanup();
  }
}

/**
 * Processes video files by extracting a representative frame
 */
async function processVideo(url, mediaInfo) {
  const download = await downloadMedia(url);
  
  try {
    // Extract frame at 1 second (or 10% of duration if shorter)
    const frameBuffer = await extractVideoFrame(download.path, 1);
    
    // Optimize the extracted frame
    const optimizedBuffer = await sharp(frameBuffer)
      .resize(256, 256, { 
        fit: 'inside', 
        withoutEnlargement: true,
        background: { r: 0, g: 0, b: 0, alpha: 1 } // Black background for videos
      })
      .jpeg({ quality: 80 })
      .toBuffer();
    
    return {
      buffer: optimizedBuffer,
      mimeType: 'image/jpeg',
      size: optimizedBuffer.length,
      dimensions: { width: 256, height: 256 },
      originalType: mediaInfo.mimeType,
      processingType: 'video_frame'
    };
    
  } finally {
    await download.cleanup();
  }
}

/**
 * Processes audio files by generating spectrogram
 */
async function processAudio(url, mediaInfo) {
  const download = await downloadMedia(url);
  
  try {
    // Generate spectrogram visualization
    const spectrogramBuffer = await generateSpectrogram(download.path, 512, 512);
    
    // Optimize the spectrogram
    const optimizedBuffer = await sharp(spectrogramBuffer)
      .resize(256, 256, { 
        fit: 'inside', 
        withoutEnlargement: true,
        background: { r: 0, g: 0, b: 0, alpha: 1 }
      })
      .jpeg({ quality: 80 })
      .toBuffer();
    
    return {
      buffer: optimizedBuffer,
      mimeType: 'image/jpeg',
      size: optimizedBuffer.length,
      dimensions: { width: 256, height: 256 },
      originalType: mediaInfo.mimeType,
      processingType: 'audio_spectrogram'
    };
    
  } finally {
    await download.cleanup();
  }
}

/**
 * Creates a temporary file and returns its path for Gemini File API
 */
export async function createTempFileForGemini(processedMedia) {
  const tempId = uuidv4();
  const tempPath = path.join(__dirname, 'temp', `${tempId}.jpg`);
  
  await fs.writeFile(tempPath, processedMedia.buffer);
  
  return {
    path: tempPath,
    mimeType: processedMedia.mimeType,
    size: processedMedia.size,
    cleanup: () => fs.unlink(tempPath).catch(() => {}),
    metadata: {
      originalType: processedMedia.originalType,
      processingType: processedMedia.processingType,
      dimensions: processedMedia.dimensions
    }
  };
}

/**
 * Determines the appropriate Gemini model based on media type
 */
export function selectGeminiModel(mediaInfo) {
  // For now, we'll use Flash Lite for all since we're converting everything to static images
  // In the future, when Gemini 2.5 Pro supports video in streaming, we could use it for videos
  return 'gemini-2.5-flash-lite';
  
  // Future implementation:
  // if (mediaInfo.category === 'video' || mediaInfo.category === 'animated_image') {
  //   return 'gemini-2.5-pro'; // When video support is available
  // }
  // return 'gemini-2.5-flash-lite';
}

/**
 * Generates enhanced prompt based on media processing type
 */
export function generateEnhancedPrompt(nft, processedMedia) {
  let basePrompt = `Analyze the attached image of the NFT.
The NFT is named "${nft.name}" and has the Token ID "${nft.tokenId}".
Its original description is: "${nft.description || 'No description provided'}".`;

  // Add traits information
  let traitsString = '';
  if (nft.attributes && Array.isArray(nft.attributes) && nft.attributes.length > 0) {
    const traitsList = nft.attributes
      .filter(attr => attr && typeof attr === 'object' && attr.key && attr.value)
      .map(attr => `- ${attr.key}: ${attr.value}`)
      .join('\n');
    traitsString = `\n\nThis NFT has the following traits:\n${traitsList}`;
  }

  // Add processing-specific context
  let processingContext = '';
  switch (processedMedia.processingType) {
    case 'extracted_frame':
      processingContext = '\n\nNote: This image shows a single frame extracted from an animated NFT (GIF). The original was animated, but you are seeing a representative static frame.';
      break;
    case 'video_frame':
      processingContext = '\n\nNote: This image shows a frame extracted from a video NFT. The original was a video file, but you are seeing a representative still frame.';
      break;
    case 'rasterized_vector':
      processingContext = '\n\nNote: This image is a rasterized version of an original SVG vector graphic. The original had scalable vector properties.';
      break;
    case 'audio_spectrogram':
      processingContext = '\n\nNote: This image shows a visual spectrogram representation of an audio NFT. The colors and patterns represent the frequency content and intensity of the original audio.';
      break;
    case 'optimized_static':
      processingContext = '\n\nNote: This is a static image NFT, optimized for analysis.';
      break;
  }

  const fullPrompt = `${basePrompt}${traitsString}${processingContext}

Based on the VISUALS in the image, its traits, and the context provided, write a new, short, evocative, and artistic paragraph that captures the mood, theme, and aesthetic of this specific piece. Focus on what you SEE and the provided traits. Do not repeat the original description or list the traits. Be imaginative and consider the original format when relevant. Do not use markdown, titles, or any special formatting. Respond with only the text of the description itself.`;

  return fullPrompt;
}

/**
 * Clears the media cache
 */
export function clearMediaCache() {
  mediaCache.clear();
}

/**
 * Gets cache statistics
 */
export function getCacheStats() {
  return {
    size: mediaCache.size,
    entries: Array.from(mediaCache.keys())
  };
}
