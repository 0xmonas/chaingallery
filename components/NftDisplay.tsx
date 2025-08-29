import React, { useState, useEffect } from 'react';
import type { Nft } from '../services/reservoirService';

interface NftDisplayProps {
  nft: Nft | null;
}

const NftDisplay: React.FC<NftDisplayProps> = ({ nft }) => {
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  useEffect(() => {
    if (nft?.image) {
      setIsImageLoading(true);
      // Preload the image
      const img = new Image();
      img.src = nft.image;
      img.onload = () => {
        setImageSrc(nft.image);
        setIsImageLoading(false);
      };
      img.onerror = () => {
        // Handle image loading error if necessary
        setIsImageLoading(false);
        setImageSrc(null); // Or a fallback image
      };
    } else {
        setImageSrc(null);
        setIsImageLoading(false);
    }
  }, [nft]);

  if (!nft) {
      return (
        <div className="nft-container">
            <p className="nft-loading-text">Loading NFT...</p>
        </div>
      );
  }

  return (
    <div className="nft-container transparent">
      {isImageLoading && <p className="nft-loading-text">Loading image...</p>}
      {imageSrc && 
        <img 
            src={imageSrc} 
            alt={nft.name || `NFT Token ID ${nft.tokenId}`} 
            className={`nft-image ${isImageLoading ? 'loading' : 'loaded'}`}
            style={{display: isImageLoading ? 'none' : 'block'}}
        />
      }
      {!imageSrc && !isImageLoading && <p className="nft-loading-text">Image not available</p>}
    </div>
  );
};

export default NftDisplay;
