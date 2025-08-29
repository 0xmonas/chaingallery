# ChainGallery

AI-powered NFT gallery with Gemini integration for creative descriptions. Browse NFT collections, get AI-generated descriptions, and explore with lazy loading for optimal performance.

## Features

- **Lazy Loading**: Load only one random NFT initially, fetch on-demand
- **AI-Generated Descriptions**: Creative NFT descriptions using Gemini 2.5 Flash Lite
- **Smart Search**: Search by Token ID for specific NFTs
- **Random Exploration**: Discover random NFTs from collections
- **Screenshot Functionality**: Download gallery content as PNG
- **Collection Management**: Add and switch between NFT collections
- **Secure Architecture**: API keys never exposed to client-side

## Prerequisites

- Node.js 18+
- Gemini API key (Google AI Studio)
- Alchemy API key (NFT data)

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
Create `.env.local` file in the root directory:
```bash
# Backend Environment Variables
GEMINI_API_KEY=your_gemini_api_key_here
ALCHEMY_API_KEY=your_alchemy_api_key_here
PORT=3001
NODE_ENV=development

# Frontend Environment Variables
VITE_BACKEND_URL=http://localhost:3001
```

### 3. Start Backend Server
```bash
npm run server
```

### 4. Start Frontend (in another terminal)
```bash
npm run dev
```

### 5. Or Start Both Together
```bash
npm run dev:full
```

## Architecture

### **Security-First Design**
- **Frontend**: React + TypeScript + Vite
- **Backend**: Express.js server with secure API proxy
- **API Keys**: Server-side only, never exposed to client
- **CORS**: Enabled for secure frontend-backend communication

### **Data Flow**
1. **Frontend** requests NFT data via backend endpoints
2. **Backend** securely calls Alchemy API with server-side keys
3. **Backend** processes images and calls Gemini API
4. **Frontend** receives processed data without API key exposure

### **Lazy Loading Strategy**
- **Initial Load**: Single random NFT for fast startup
- **Random Button**: Fetch new random NFT on-demand
- **Search**: Fetch specific NFT by Token ID
- **No Bulk Loading**: Performance optimized for large collections

## API Endpoints

### **Gemini AI Integration**
- `POST /api/gemini/stream-nft-description` - Generate creative NFT descriptions

### **Alchemy NFT Data (Secure)**
- `GET /api/alchemy/contract-metadata/:contractAddress` - Get collection metadata
- `GET /api/alchemy/nft-metadata/:contractAddress/:tokenId` - Get specific NFT data
- `GET /api/alchemy/collection-nfts/:contractAddress` - Get collection NFTs with pagination

### **System**
- `GET /api/health` - Health check

## Development

- **Backend**: Port 3001 (Express.js)
- **Frontend**: Port 5173 (Vite default)
- **Hot Reload**: Both frontend and backend support live reloading
- **Debug Logging**: Development-only logging for troubleshooting

## Production Deployment

### **Vercel (Recommended)**
1. Connect GitHub repository
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push

### **Manual Deployment**
```bash
# Build frontend
npm run build

# Start production backend
npm run start
```

### **Environment Variables for Production**
```bash
# Required
GEMINI_API_KEY=your_production_gemini_key
ALCHEMY_API_KEY=your_production_alchemy_key
NODE_ENV=production

# Optional
PORT=3001
VITE_BACKEND_URL=https://your-domain.com
```

## Security Features

- ✅ **API Key Protection**: All sensitive keys server-side only
- ✅ **CORS Configuration**: Secure cross-origin requests
- ✅ **Rate Limiting**: Built-in protection against abuse
- ✅ **Input Validation**: Sanitized NFT data processing
- ✅ **Error Handling**: Secure error messages without data leakage

## Performance Features

- 🚀 **Lazy Loading**: Only load what's needed
- 🚀 **Image Optimization**: Automatic PNG conversion for Gemini compatibility
- 🚀 **IPFS Support**: Automatic gateway conversion for decentralized images
- 🚀 **Streaming Responses**: Real-time AI content generation
- 🚀 **Pagination**: Efficient handling of large collections

## Troubleshooting

### **Common Issues**
1. **Backend Connection**: Ensure `npm run server` is running
2. **API Keys**: Verify `.env.local` has correct keys
3. **Port Conflicts**: Check if port 3001 is available
4. **Image Processing**: Some NFT images may fail Gemini processing

### **Debug Mode**
Set `NODE_ENV=development` in `.env.local` for detailed logging.

## License

MIT - Open source and free to use, modify, and distribute.
