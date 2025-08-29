import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import fetch from 'node-fetch';
import sharp from 'sharp';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import {
  processNftMedia,
  createTempFileForGemini,
  selectGeminiModel,
  generateEnhancedPrompt,
  clearMediaCache,
  getCacheStats
} from './advancedMediaProcessor.js';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Production'da debug logging'i kapat
const isProduction = process.env.NODE_ENV === 'production';

// Environment validation
if (!process.env.GEMINI_API_KEY || !process.env.ALCHEMY_API_KEY) {
  console.error('❌ Missing required environment variables');
  console.error('Required: GEMINI_API_KEY, ALCHEMY_API_KEY');
  process.exit(1);
}

// Debug logging sadece development'ta
if (!isProduction) {
  console.log('🔍 Environment check:');
  console.log('GEMINI_API_KEY exists:', !!process.env.GEMINI_API_KEY);
  console.log('ALCHEMY_API_KEY exists:', !!process.env.ALCHEMY_API_KEY);
  console.log('PORT:', process.env.PORT || 'default (3001)');
}

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:", "ipfs://"],
      connectSrc: ["'self'", "https://eth-mainnet.g.alchemy.com", "https://generativelanguage.googleapis.com"],
    },
  },
}));

// CORS configuration for production
const corsOptions = {
  origin: isProduction 
    ? [process.env.FRONTEND_URL || 'https://your-vercel-domain.vercel.app']
    : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Rate limiting for all routes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests. Please try again in a moment.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Specific rate limiting for Gemini API
const geminiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per minute
  message: 'Too many requests. Please try again in a moment.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Body parsing middleware with size limits
app.use(express.json({ limit: '10mb' })); // Reduced from 50mb for security
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const textModelName = 'gemini-2.5-flash-lite';

// Input validation helper
function validateContractAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function validateTokenId(tokenId) {
  return /^\d+$/.test(tokenId) && parseInt(tokenId) >= 0;
}

function validateImageUrl(url) {
  try {
    const urlObj = new URL(url);
    return ['http:', 'https:', 'ipfs:', 'data:'].includes(urlObj.protocol);
  } catch {
    return false;
  }
}

// Media cache management endpoints
app.get('/api/cache/stats', (req, res) => {
  if (isProduction) {
    return res.status(404).json({ error: 'Endpoint not available in production' });
  }
  
  const stats = getCacheStats();
  res.json({
    message: 'Media cache statistics',
    ...stats
  });
});

app.post('/api/cache/clear', (req, res) => {
  if (isProduction) {
    return res.status(404).json({ error: 'Endpoint not available in production' });
  }
  
  clearMediaCache();
  res.json({
    message: 'Media cache cleared successfully'
  });
});

// Advanced Gemini API endpoint with multi-format support
app.post('/api/gemini/stream-nft-description', geminiLimiter, async (req, res) => {
  
  try {
    const { nft } = req.body;
    
    // Input validation
    if (!nft || typeof nft !== 'object') {
      return res.status(400).json({ error: 'Invalid NFT data format' });
    }
    
    if (!nft.image || !validateImageUrl(nft.image)) {
      return res.status(400).json({ error: 'This NFT has no image available.' });
    }
    
    if (!nft.name || typeof nft.name !== 'string') {
      return res.status(400).json({ error: 'NFT name is required' });
    }
    
    if (!nft.tokenId || !validateTokenId(nft.tokenId)) {
      return res.status(400).json({ error: 'Valid token ID is required' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    if (!isProduction) {
      console.log(`🎨 Processing NFT: ${nft.name} (${nft.tokenId})`);
    }

    // Process media with advanced system
    const processedMedia = await processNftMedia(nft);
    
    if (!isProduction) {
      console.log(`✅ Media processed: ${processedMedia.processingType}`);
    }

    // Generate enhanced prompt based on processing type
    const enhancedPrompt = generateEnhancedPrompt(nft, processedMedia);
    
    // Select appropriate model
    const modelName = selectGeminiModel({ category: processedMedia.processingType });
    
    // Use inline data (more compatible than File API)
    const base64Data = processedMedia.buffer.toString('base64');
    const parts = [
      {
        inlineData: {
          mimeType: processedMedia.mimeType,
          data: base64Data
        }
      },
      { text: enhancedPrompt }
    ];

    const response = await ai.models.generateContentStream({
      model: modelName,
      contents: { parts: parts },
      config: {
        // Use default thinking for higher quality creative text.
      },
    });

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Response streaming starts

    // Stream the response
    for await (const chunk of response) {
      if (chunk.text) {
        res.write(chunk.text);
      }
    }

    res.end();
    
  } catch (error) {
    console.error('Error in advanced Gemini API endpoint:', error);
    
    // Handle specific Gemini API errors
    if (error.status === 429) {
      return res.status(429).json({ 
        error: 'Too many requests. Please try again in a moment.'
      });
    }
    
    // Media processing specific errors
    if (error.message.includes('Failed to process media')) {
      return res.status(422).json({ 
        error: 'This NFT format is not supported yet. Please try another one.',
        details: isProduction ? undefined : error.message
      });
    }
    
    // Don't expose internal error details in production
    const errorMessage = isProduction ? 'Something went wrong. Please try again.' : error.message;
    res.status(500).json({ error: errorMessage });
  }
});

// Alchemy API endpoints with validation
app.get('/api/alchemy/contract-metadata/:contractAddress', async (req, res) => {
  try {
    const { contractAddress } = req.params;
    
    // Input validation
    if (!validateContractAddress(contractAddress)) {
      return res.status(400).json({ error: 'Please enter a valid contract address.' });
    }
    
    if (!process.env.ALCHEMY_API_KEY) {
      return res.status(500).json({ error: 'Alchemy API key not configured' });
    }

    const url = `https://eth-mainnet.g.alchemy.com/nft/v2/${process.env.ALCHEMY_API_KEY}/getContractMetadata?contractAddress=${contractAddress}`;
    
    const response = await fetch(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'ChainGallery/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Alchemy API request failed with status ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching contract metadata:', error);
    const errorMessage = isProduction ? 'Collection information not available.' : error.message;
    res.status(500).json({ error: errorMessage });
  }
});

app.get('/api/alchemy/nft-metadata/:contractAddress/:tokenId', async (req, res) => {
  try {
    const { contractAddress, tokenId } = req.params;
    
    // Input validation
    if (!validateContractAddress(contractAddress)) {
      return res.status(400).json({ error: 'Please enter a valid contract address.' });
    }
    
    if (!validateTokenId(tokenId)) {
      return res.status(400).json({ error: 'Please enter a valid token ID.' });
    }
    
    if (!process.env.ALCHEMY_API_KEY) {
      return res.status(500).json({ error: 'Alchemy API key not configured' });
    }

    const url = `https://eth-mainnet.g.alchemy.com/nft/v2/${process.env.ALCHEMY_API_KEY}/getNFTMetadata?contractAddress=${contractAddress}&tokenId=${tokenId}`;
    
    const response = await fetch(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'ChainGallery/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Alchemy API request failed with status ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching NFT metadata:', error);
    const errorMessage = isProduction ? 'NFT information not available.' : error.message;
    res.status(500).json({ error: errorMessage });
  }
});

app.get('/api/alchemy/collection-nfts/:contractAddress', async (req, res) => {
  try {
    const { contractAddress } = req.params;
    const { pageKey, limit = 100 } = req.query;
    
    // Input validation
    if (!validateContractAddress(contractAddress)) {
      return res.status(400).json({ error: 'Please enter a valid contract address.' });
    }
    
    // Validate limit parameter
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({ error: 'Please use a limit between 1 and 100.' });
    }
    
    if (!process.env.ALCHEMY_API_KEY) {
      return res.status(500).json({ error: 'Alchemy API key not configured' });
    }

    let url = `https://eth-mainnet.g.alchemy.com/nft/v2/${process.env.ALCHEMY_API_KEY}/getNFTsForCollection?contractAddress=${contractAddress}&withMetadata=true&limit=${limitNum}`;
    if (pageKey && typeof pageKey === 'string') {
      url += `&startToken=${pageKey}`;
    }
    
    const response = await fetch(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'ChainGallery/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Alchemy API request failed with status ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching collection NFTs:', error);
    const errorMessage = isProduction ? 'Collection NFTs not available.' : error.message;
    res.status(500).json({ error: errorMessage });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'ChainGallery Backend is running',
    timestamp: new Date().toISOString(),
    environment: isProduction ? 'production' : 'development'
  });
});

// 404 handler for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  const errorMessage = isProduction ? 'Internal server error' : error.message;
  res.status(500).json({ error: errorMessage });
});

app.listen(PORT, () => {
  if (!isProduction) {
    console.log(`🚀 ChainGallery Backend running on port ${PORT}`);
    console.log(`📡 Gemini API endpoint: http://localhost:${PORT}/api/gemini/stream-nft-description`);
  } else {
    console.log(`ChainGallery Backend started on port ${PORT}`);
  }
});
