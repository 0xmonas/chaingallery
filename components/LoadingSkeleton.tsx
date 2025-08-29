import React from 'react';

const LoadingSkeleton: React.FC = () => {
  return (
    <div className="loading-skeleton" aria-label="Loading content..." role="progressbar">
      <div className="skeleton-bar full"></div>
      <div className="skeleton-bar large"></div>
      <div className="skeleton-bar full"></div>
      <div className="skeleton-bar medium"></div>
      <div className="skeleton-bar small"></div>
    </div>
  );
};

export default LoadingSkeleton;
