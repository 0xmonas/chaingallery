const { GoogleGenAI } = require('@google/genai');
const sharp = require('sharp');

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const textModelName = 'gemini-2.5-flash-lite';

/**
 * Converts IPFS URLs to HTTP gateway URLs for compatibility.
 */
function convertIpfsToHttp(url) {
  if (url.startsWith('ipfs://')) {
    const ipfsHash = url.replace('ipfs://', '');
    // Use multiple IPFS gateways for redundancy
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
 * Fetches media from a URL and converts it into a Gemini-compatible image Part.
 */
async function getGeminiReadyImagePart(url) {
  try {
    const httpUrl = convertIpfsToHttp(url);
    
    const response = await fetch(httpUrl, {
      headers: {
        'User-Agent': 'ChainGallery/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch media from URL: ${httpUrl}. Status: ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    
    // Check file size (max 5MB for security)
    if (buffer.byteLength > 5 * 1024 * 1024) {
      throw new Error('Image file too large. Maximum size is 5MB.');
    }
    
    // Convert all images to PNG using sharp
    let pngBuffer;
    try {
      pngBuffer = await sharp(Buffer.from(buffer))
        .png()
        .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
        .toBuffer();
    } catch (sharpError) {
      console.warn('Sharp conversion failed, using original buffer:', sharpError.message);
      pngBuffer = Buffer.from(buffer);
    }
    
    const base64Data = pngBuffer.toString('base64');
    
    return {
      inlineData: { 
        mimeType: 'image/png', 
        data: base64Data 
      },
    };
  } catch (error) {
    console.error('Error processing image:', error);
    throw error;
  }
}

module.exports = async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { nft } = req.body;
    
    // Input validation
    if (!nft || typeof nft !== 'object') {
      return res.status(400).json({ error: 'Invalid NFT data format' });
    }
    
    if (!nft.image || !nft.image.startsWith('http')) {
      return res.status(400).json({ error: 'Valid image URL is required' });
    }
    
    if (!nft.name || typeof nft.name !== 'string') {
      return res.status(400).json({ error: 'NFT name is required' });
    }
    
    if (!nft.tokenId || !/^\d+$/.test(nft.tokenId)) {
      return res.status(400).json({ error: 'Valid token ID is required' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    const imagePart = await getGeminiReadyImagePart(nft.image);
    
    let traitsString = '';
    if (nft.attributes && Array.isArray(nft.attributes) && nft.attributes.length > 0) {
        const traitsList = nft.attributes
          .filter(attr => attr && typeof attr === 'object' && attr.key && attr.value)
          .map(attr => `- ${attr.key}: ${attr.value}`)
          .join('\n');
        traitsString = `\n\nThis NFT has the following traits:\n${traitsList}`;
    }
    
    const textPrompt = `Analyze the attached image of the 1/1 NFT.
The NFT is named "${nft.name}" and has the Token ID "${nft.tokenId}".
Its original description is: "${nft.description || 'No description provided'}".${traitsString}

Based on the VISUALS in the image, its traits, and the text info, write a new, short, evocative, and artistic paragraph that captures the mood, theme, and aesthetic of this specific piece. Focus on what you SEE and the provided traits. Do not repeat the original description or list the traits. Be imaginative. Do not use markdown, titles, or any special formatting. Respond with only the text of the description itself.`;
    
    const parts = [imagePart, { text: textPrompt }];

    const response = await ai.models.generateContentStream({
      model: textModelName,
      contents: { parts: parts },
    });

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Stream the response
    for await (const chunk of response) {
      if (chunk.text) {
        res.write(chunk.text);
      }
    }

    res.end();
  } catch (error) {
    console.error('Error in Gemini API endpoint:', error);
    
    // Handle specific Gemini API errors
    if (error.status === 429) {
      return res.status(429).json({ 
        error: 'Gemini API rate limit exceeded. Please try again later.',
        retryAfter: 60
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
}
