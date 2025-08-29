module.exports = async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { contractAddress } = req.query;
    
    // Input validation
    if (!contractAddress || !/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
      return res.status(400).json({ error: 'Invalid contract address format' });
    }
    
    if (!process.env.ALCHEMY_API_KEY) {
      return res.status(500).json({ error: 'Alchemy API key not configured' });
    }

    const url = `https://eth-mainnet.g.alchemy.com/nft/v2/${process.env.ALCHEMY_API_KEY}/getContractMetadata?contractAddress=${contractAddress}`;
    
    const response = await fetch(url, {
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
    res.status(500).json({ error: 'Failed to fetch contract metadata' });
  }
}
