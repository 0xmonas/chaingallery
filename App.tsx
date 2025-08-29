
import React, { useState, useEffect, useCallback } from 'react';
import { streamNftDescription } from './services/geminiService';
import { getCollectionNfts, getRandomNft, getNftByTokenId, getCollectionTotalSupply, Nft } from './services/reservoirService';
import ContentDisplay from './components/ContentDisplay';
import LoadingSkeleton from './components/LoadingSkeleton';
import NftDisplay from './components/NftDisplay';
import CollectionModal from './components/CollectionModal';
import SearchBar from './components/SearchBar';


const DEFAULT_COLLECTION_ADDRESS = '0xc51d4269d159beb8a91ef9f0a8da9c40443d6bd4';

// Modern meta tag utility for social sharing
const updateMetaTags = (nft: Nft | null, content: string) => {
  if (!nft) return;
  
  const title = `${nft.name} - ChainGallery`;
  const description = content.substring(0, 160) + (content.length > 160 ? '...' : '');
  const imageUrl = nft.image || 'https://chaingallery.app/og-image.png';
  
  // Update document title
  document.title = title;
  
  // Update OG meta tags
  const updateMetaTag = (property: string, content: string) => {
    let meta = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement;
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('property', property);
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', content);
  };
  
  const updateNameMetaTag = (name: string, content: string) => {
    let meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement;
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', name);
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', content);
  };
  
  updateMetaTag('og:title', title);
  updateMetaTag('og:description', description);
  updateMetaTag('og:image', imageUrl);
  updateNameMetaTag('twitter:title', title);
  updateNameMetaTag('twitter:description', description);
  updateNameMetaTag('twitter:image', imageUrl);
};

const App: React.FC = () => {
  const [collectionAddress, setCollectionAddress] = useState<string>(DEFAULT_COLLECTION_ADDRESS);
  const [allNfts, setAllNfts] = useState<Nft[]>([]);
  const [currentNft, setCurrentNft] = useState<Nft | null>(null);
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [generationTime, setGenerationTime] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [notification, setNotification] = useState<{message: string, type: 'error' | 'success'} | null>(null);
  const [collectionLoading, setCollectionLoading] = useState<boolean>(true);

  // Handle URL parameters for shared links
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sharedCollection = urlParams.get('collection');
    const sharedToken = urlParams.get('token');
    
    if (sharedCollection && sharedCollection !== collectionAddress) {
      setCollectionAddress(sharedCollection);
    }
  }, []);

  // Auto-dismiss notification after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Update meta tags when NFT and content change
  useEffect(() => {
    if (currentNft && content && !isLoading) {
      updateMetaTags(currentNft, content);
    }
  }, [currentNft, content, isLoading]);

  // Effect to fetch NFTs when the collection address changes
  useEffect(() => {
    const fetchNftsForCollection = async () => {
      // Reset state for new collection
      setIsLoading(true);
      setError(null);
      setAllNfts([]);
      setCurrentNft(null);
      setContent('');
      setCollectionLoading(true); // Start collection loading

      try {
        // Get one random NFT to start with (fast loading)
        const randomNft = await getRandomNft(collectionAddress);
        if (randomNft) {
          setCurrentNft(randomNft); // This will trigger the description generation effect
          // Set a placeholder for allNfts with just the count
          setAllNfts([randomNft]); // Start with just the first NFT
        } else {
          setError(`No NFTs found for address: ${collectionAddress}`);
          setIsLoading(false);
        }
      } catch (e) {
        setError(`Failed to fetch collection data for address: ${collectionAddress}. Check the address or try another.`);
        setIsLoading(false);
      } finally {
        setCollectionLoading(false); // End collection loading
      }
    };
    fetchNftsForCollection();
  }, [collectionAddress]);


  // Effect to generate description when currentNft changes
  useEffect(() => {
    if (!currentNft) return;

    let isCancelled = false;

    const fetchDescription = async () => {
      setIsLoading(true);
      setError(null);
      setContent('');
      setGenerationTime(null);
      const startTime = performance.now();

      let accumulatedContent = '';
      try {
        for await (const chunk of streamNftDescription(currentNft)) {
          if (isCancelled) break;
          
          if (chunk.startsWith('Error:')) {
            throw new Error(chunk);
          }
          accumulatedContent += chunk;
          if (!isCancelled) {
            setContent(accumulatedContent);
          }
        }
      } catch (e: unknown) {
        if (!isCancelled) {
          const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred';
          setError(errorMessage);
          setContent(''); // Ensure content is clear on error
          console.error(e);
        }
      } finally {
        if (!isCancelled) {
          const endTime = performance.now();
          setGenerationTime(endTime - startTime);
          setIsLoading(false);
        }
      }
    };

    fetchDescription();
    
    return () => {
      isCancelled = true;
    };
  }, [currentNft]);

  const handleRandom = useCallback(async () => {
    if (!collectionAddress || isLoading) return;

    try {
      // Fetch a new random NFT from the collection
      const randomNft = await getRandomNft(collectionAddress);
      if (randomNft) {
        setCurrentNft(randomNft);
      }
    } catch (error) {
      console.error('Failed to fetch random NFT:', error);
      setError('Failed to fetch random NFT. Please try again.');
    }
  }, [collectionAddress, isLoading]);

  const handleCollectionSubmit = (newAddress: string) => {
    const trimmedAddress = newAddress.trim();
    if (trimmedAddress && trimmedAddress !== collectionAddress) {
      if (/^0x[a-fA-F0-9]{40}$/.test(trimmedAddress)) {
        setCollectionAddress(trimmedAddress);
        setIsModalOpen(false);
      } else {
        setNotification({message: "Invalid Ethereum contract address format. Please try again.", type: 'error'});
      }
    } else {
      setIsModalOpen(false); // Close if address is same or empty
    }
  };

  const handleShare = async () => {
    if (!currentNft) return;
    
    try {
      // Modern Web Share API for native sharing
      if (navigator.share) {
        await navigator.share({
          title: `${currentNft.name} - ChainGallery`,
          text: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
          url: `${window.location.origin}?collection=${collectionAddress}&token=${currentNft.tokenId}`
        });
      } else {
        // Fallback: Copy link to clipboard
        const shareUrl = `${window.location.origin}?collection=${collectionAddress}&token=${currentNft.tokenId}`;
        await navigator.clipboard.writeText(shareUrl);
        setNotification({message: 'Share link copied to clipboard!', type: 'success'});
      }
    } catch (error) {
      console.error('Share failed:', error);
      setNotification({message: 'Share failed. Please try again.', type: 'error'});
    }
  };
  
  const handleSearch = useCallback(async (query: string) => {
    if (!collectionAddress || isLoading) return;
    
    try {
      // Try to find by token ID first (fetch from API)
      if (/^\d+$/.test(query)) { // If query is a number
        const nft = await getNftByTokenId(collectionAddress, query);
        if (nft) {
          setCurrentNft(nft);
          setError(null);
          return;
        }
      }
      
      // If not found by token ID or query is not a number, show error
      setError(`No NFT found matching "${query}" in this collection.`);
    } catch (error) {
      console.error('Search failed:', error);
      setError('Search failed. Please try again.');
    }
  }, [collectionAddress, isLoading]);


  return (
    <>
      {/* Notification Toast */}
      {notification && (
        <div 
          className={`notification-toast ${notification.type}`}
          onClick={() => setNotification(null)}
        >
          {notification.message}
        </div>
      )}
      
      <div id="root">
        <header>
          <SearchBar 
            onSearch={handleSearch} 
            onRandom={handleRandom}
            onAddCollection={() => setIsModalOpen(true)}
            isLoading={isLoading || collectionLoading || allNfts.length === 0} 
          />
        </header>
        
        <main>
          <h1 className="main-title">
            CHAINGALLERY
          </h1>
          
          {/* Collection Loading Indicator */}
          {collectionLoading && (
            <div className="loading-indicator">
              <p>Loading collection... This may take a moment for large collections.</p>
            </div>
          )}
          
          <div className="nft-section">
            <NftDisplay nft={currentNft} />
          </div>

          <div>
            <h2 className="section-title">
              {currentNft ? (
                <a
                  href={`https://opensea.io/item/ethereum/${collectionAddress}/${currentNft.tokenId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nft-title-link"
                >
                  {currentNft.name}
                </a>
              ) : (
                'Loading...'
              )}
            </h2>

            {error && (
              <div className="error-container">
                <p>An Error Occurred</p>
                <p>{error}</p>
              </div>
            )}
            
            {isLoading && content.length === 0 && !error && (
              <LoadingSkeleton />
            )}

            {content.length > 0 && !error && (
               <ContentDisplay 
                 content={content} 
                 isLoading={isLoading}
               />
            )}

            {!isLoading && !error && content.length === 0 && (
              <div className="content-placeholder">
                <p>Content could not be generated for this NFT.</p>
              </div>
            )}
          </div>
        </main>

        <footer className="footer">
          <div className="footer-content">
            <div className="footer-text">
              Dev by <a href="https://x.com/0xmonas" target="_blank" rel="noopener noreferrer">0xmonas</a> · Powered by Gemini 2.5 Flash Lite
              {' · '}
            <button 
              onClick={handleShare}
              title="Share this NFT"
              className="footer-button"
            >
              Share
            </button>
              {generationTime && ` · ${Math.round(generationTime)}ms`}
            </div>
          </div>
        </footer>
      </div>
      
      <CollectionModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCollectionSubmit}
        currentAddress={collectionAddress}
      />
    </>
  );
};

export default App;