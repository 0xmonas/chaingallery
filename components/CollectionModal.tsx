import React, { useState, useEffect, useRef } from 'react';

interface CollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (address: string) => void;
  currentAddress: string;
}

const CollectionModal: React.FC<CollectionModalProps> = ({ isOpen, onClose, onSubmit, currentAddress }) => {
  const [addressInput, setAddressInput] = useState(currentAddress);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset input when currentAddress changes (e.g., after successful submission)
  useEffect(() => {
    setAddressInput(currentAddress);
  }, [currentAddress]);
  
  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      // Timeout to allow the element to be visible before focusing
      setTimeout(() => {
        inputRef.current?.focus();
      }, 10);
    }
  }, [isOpen]);
  
  // Handle Escape key press
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(addressInput);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3 id="modal-title" className="modal-title">
          Load a New Collection
        </h3>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            placeholder="Enter contract address, e.g., 0x..."
            className="modal-input"
          />
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="modal-button">
              Cancel
            </button>
            <button type="submit" className="modal-button">
              Load
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CollectionModal;