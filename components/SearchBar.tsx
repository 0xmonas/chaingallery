import React, { useState } from 'react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  onRandom: () => void;
  onAddCollection: () => void;
  isLoading: boolean;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch, onRandom, onAddCollection, isLoading }) => {
  const [query, setQuery] = useState('');

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (query.trim() && !isLoading) {
      onSearch(query.trim());
      setQuery(''); // Clear the input field after search
    }
  };

  return (
    <div className="search-container">
      <form onSubmit={handleSubmit} className="search-form" role="search">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Token ID"
          className="search-input"
          aria-label="Search for a topic"
          disabled={isLoading}
        />
      </form>
      <button onClick={onAddCollection} className="random-button collection-button" disabled={isLoading}>
        + Collection
      </button>
      <div className="random-button-container">
        <button onClick={onRandom} className="random-button" disabled={isLoading}>
          Random
        </button>
      </div>
    </div>
  );
};

export default SearchBar;
