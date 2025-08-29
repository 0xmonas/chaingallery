export interface Attribute {
  key: string;
  value: string;
}

export interface Nft {
  tokenId: string;
  name: string;
  image: string;
  description: string;
  attributes: Attribute[];
}

export interface AlchemyNft {
  contract: {
    address: string;
  };
  tokenId: string; // Direct tokenId (legacy)
  tokenType: string;
  name: string;
  description: string;
  id: {
    tokenId: string;
    tokenMetadata: any;
  };
  title: string;
  image: {
    cachedUrl: string;
    thumbnailUrl: string;
    pngUrl: string;
    contentType: string;
    size: number;
  };
  media: Array<{
    gateway: string;
    thumbnail: string;
    raw: string;
  }>;
  metadata: {
    name: string;
    description: string;
    image: string;
    attributes?: Array<{
      trait_type: string;
      value: string;
    }>;
  };
}

// Helper function to convert hex token ID to decimal
function convertHexToDecimal(hexTokenId: string): string {
  return hexTokenId.startsWith('0x') ? parseInt(hexTokenId, 16).toString() : hexTokenId;
}

// Helper function to convert IPFS URLs to HTTP gateways
function convertIpfsToHttp(url: string): string {
  if (url.startsWith('ipfs://')) {
    const ipfsHash = url.replace('ipfs://', '');
    return `https://ipfs.io/ipfs/${ipfsHash}`;
  }
  return url;
}

// Helper function to map Alchemy NFT to our Nft interface
function mapAlchemyNftToNft(nft: AlchemyNft): Nft {
  const hexTokenId = nft.id?.tokenId || nft.tokenId || '0';
  const decimalTokenId = convertHexToDecimal(hexTokenId);
  
  // Prioritize gateway/thumbnail URLs over raw data URLs for better frontend performance
  const rawImageUrl = nft.image?.cachedUrl || nft.image?.pngUrl || nft.image?.thumbnailUrl || nft.media?.[0]?.gateway || nft.media?.[0]?.thumbnail || nft.metadata?.image || nft.media?.[0]?.raw || '';
  const httpImageUrl = convertIpfsToHttp(rawImageUrl);
  
  return {
    tokenId: decimalTokenId,
    name: nft.title || nft.metadata?.name || nft.name || `Token #${decimalTokenId}`,
    image: httpImageUrl,
    description: nft.metadata?.description || nft.description || '',
    attributes: nft.metadata?.attributes?.map(attr => ({
      key: attr.trait_type,
      value: attr.value
    })) || [],
  };
}

// Get a single random NFT from collection
export async function getRandomNft(collectionAddress: string): Promise<Nft | null> {
  if (!collectionAddress) {
    if (import.meta.env.DEV) {
      console.warn("getRandomNft called with no collection address.");
    }
    return null;
  }

    try {
    // Get total supply first
    const totalSupply = await getCollectionTotalSupply(collectionAddress);
    
    if (!totalSupply) {
      // Some collections don't expose total supply, use fallback method
      if (import.meta.env.DEV) {
        console.warn('Collection total supply not available, using fallback pagination method');
      }
      
      // Fallback: try to get first few NFTs and pick random
      const fallbackNfts = await getCollectionNfts(collectionAddress);
      if (fallbackNfts.length > 0) {
        const randomIndex = Math.floor(Math.random() * fallbackNfts.length);
        return fallbackNfts[randomIndex];
      }
      return null;
    }
    

    
        // Generate random token ID
    const randomTokenId = Math.floor(Math.random() * totalSupply);

    // Fetch single NFT
    const nft = await getNftByTokenId(collectionAddress, randomTokenId.toString());
    return nft;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Failed to fetch random NFT:", error);
    }
    // Fallback to old method
    try {
      const fallbackNfts = await getCollectionNfts(collectionAddress);
      if (fallbackNfts.length > 0) {
        const randomIndex = Math.floor(Math.random() * fallbackNfts.length);
        return fallbackNfts[randomIndex];
      }
    } catch (fallbackError) {
      if (import.meta.env.DEV) {
        console.error("Fallback also failed:", fallbackError);
      }
    }
    return null;
  }
}

// Get NFT by specific token ID
export async function getNftByTokenId(collectionAddress: string, tokenId: string): Promise<Nft | null> {
  if (!collectionAddress || !tokenId) {
    if (import.meta.env.DEV) {
      console.warn("getNftByTokenId called with invalid parameters.");
    }
    return null;
  }

  try {
    // Use local backend for development, production backend for production
    const BACKEND_URL = import.meta.env.DEV ? 'http://localhost:3001' : '';
    const response = await fetch(`${BACKEND_URL}/api/alchemy/nft-metadata/${collectionAddress}/${tokenId}`);
    if (!response.ok) {
      throw new Error(`Backend API request failed with status ${response.status}`);
    }

    const nft: AlchemyNft = await response.json();
    return mapAlchemyNftToNft(nft);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Failed to fetch NFT by token ID:", error);
    }
    return null;
  }
}

// Get collection total supply
export async function getCollectionTotalSupply(collectionAddress: string): Promise<number | null> {
  try {
    // Use local backend for development, production backend for production
    const BACKEND_URL = import.meta.env.DEV ? 'http://localhost:3001' : '';
    const response = await fetch(`${BACKEND_URL}/api/alchemy/contract-metadata/${collectionAddress}`);

    if (!response.ok) {
      throw new Error(`Backend API request failed with status ${response.status}`);
    }

    const data = await response.json();
    
    // Try different possible field paths for total supply
    const totalSupply = parseInt(
      data.totalSupply || 
      data.contractMetadata?.totalSupply || 
      data.contractMetadata?.supply ||
      '0'
    );
    
    return totalSupply;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Failed to fetch collection total supply:", error);
    }
    return null;
  }
}

// This function is now only used as a fallback in getRandomNft
export async function getCollectionNfts(collectionAddress: string): Promise<Nft[]> {
  if (!collectionAddress) {
    if (import.meta.env.DEV) {
      console.warn("getCollectionNfts called with no collection address.");
    }
    return [];
  }

  try {
    const allNfts: Nft[] = [];
    let pageKey: string | undefined;
    const pageSize = 100; // Alchemy max per request

    do {
      // Use local backend for development, production backend for production
      const BACKEND_URL = import.meta.env.DEV ? 'http://localhost:3001' : '';
      let url = `${BACKEND_URL}/api/alchemy/collection-nfts/${collectionAddress}?limit=${pageSize}`;
      if (pageKey) {
        url += `&pageKey=${pageKey}`;
      }

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Backend API request failed with status ${response.status}`);
      }

      const data = await response.json();

      if (!data.nfts || !Array.isArray(data.nfts)) {
        throw new Error('Invalid data structure from backend API');
      }

      // Add NFTs from this page
      const pageNfts: Nft[] = data.nfts.map(mapAlchemyNftToNft);

      allNfts.push(...pageNfts);

      // Get page key for next page
      pageKey = data.nextToken;

      // Safety check to prevent infinite loops
      if (allNfts.length > 10000) {
        if (import.meta.env.DEV) {
          console.warn('Collection has more than 10,000 NFTs. Stopping pagination for safety.');
        }
        break;
      }

    } while (pageKey);

    return allNfts;

  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Failed to fetch NFTs from backend:", error);
    }
    return [];
  }
}
