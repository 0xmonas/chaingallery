import React from 'react';

interface ContentDisplayProps {
  content: string;
  isLoading: boolean;
}

const StreamingContent: React.FC<{ content: string }> = ({ content }) => (
  <p className="streaming-content">
    {content}
    <span className="blinking-cursor">|</span>
  </p>
);

const FinalContent: React.FC<{ content: string }> = ({ content }) => (
    <p className="final-content">
        {content}
    </p>
);

const ContentDisplay: React.FC<ContentDisplayProps> = ({ content, isLoading }) => {
  if (isLoading) {
    return <StreamingContent content={content} />;
  }
  
  if (content) {
    return <FinalContent content={content} />;
  }

  return null;
};

export default ContentDisplay;