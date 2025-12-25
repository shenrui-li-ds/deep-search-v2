"use client";

import React, { useState } from 'react';
import SourceItem from './SourceItem';

interface Source {
  id: string;
  title: string;
  url: string;
  iconUrl: string;
  author?: string;
  timeAgo?: string;
  readTime?: string;
}

interface SourcesListProps {
  sources: Source[];
  onSourceClick: (sourceId: string) => void;
  totalSources?: number;
}

const SourcesList: React.FC<SourcesListProps> = ({ 
  sources, 
  onSourceClick,
  totalSources
}) => {
  const [activeSourceId, setActiveSourceId] = useState<string | null>(
    sources.length > 0 ? sources[0].id : null
  );
  const [showAllSources, setShowAllSources] = useState(false);
  
  // Number of sources to show when collapsed
  const initialSourcesCount = 3;
  
  const handleSourceClick = (sourceId: string) => {
    setActiveSourceId(sourceId);
    onSourceClick(sourceId);
  };
  
  const toggleShowAllSources = () => {
    setShowAllSources(prev => !prev);
  };
  
  // Filter sources based on expanded state
  const displayedSources = showAllSources || sources.length <= initialSourcesCount
    ? sources
    : sources.slice(0, initialSourcesCount);

  return (
    <div className="bg-neutral-900 p-4 rounded-lg border border-neutral-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-white">
          {totalSources ? `${totalSources} sources` : `${sources.length} sources`}
        </h3>
        <button 
          className="text-xs text-teal-500 hover:text-teal-400 transition-colors"
          onClick={toggleShowAllSources}
        >
          {showAllSources ? 'Show less' : 'View all'}
        </button>
      </div>
      
      <div className="space-y-2">
        {displayedSources.map((source) => (
          <SourceItem
            key={source.id}
            title={source.title}
            url={source.url}
            iconUrl={source.iconUrl}
            author={source.author}
            timeAgo={source.timeAgo}
            readTime={source.readTime}
            onClick={() => handleSourceClick(source.id)}
            isActive={source.id === activeSourceId}
          />
        ))}
      </div>
      
      {!showAllSources && sources.length > initialSourcesCount && sources.length > displayedSources.length && (
        <div className="mt-2 text-center">
          <button 
            className="text-xs text-neutral-400 hover:text-white py-1 px-2 rounded hover:bg-neutral-800"
            onClick={toggleShowAllSources}
          >
            + {sources.length - initialSourcesCount} more
          </button>
        </div>
      )}
    </div>
  );
};

export default SourcesList;
