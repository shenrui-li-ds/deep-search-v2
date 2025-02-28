"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import SearchBox from './SearchBox';
import SourcesList from './SourcesList';

interface Source {
  id: string;
  title: string;
  url: string;
  iconUrl: string;
  author?: string;
  timeAgo?: string;
  readTime?: string;
}

interface SearchResultProps {
  query: string;
  result: {
    content: string;
    sources: Source[];
    images?: {
      url: string;
      alt: string;
      sourceId: string;
    }[];
  };
  isLoading?: boolean;
}

const SearchResult: React.FC<SearchResultProps> = ({ query, result, isLoading = false }) => {
  const [showSources, setShowSources] = useState(false);
  
  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <SearchBox initialValue={query} />
      </div>
      
      <div className="flex flex-col-reverse md:flex-row gap-6">
        <div className="md:w-3/4">
          <div className="prose prose-invert max-w-none">
            <div dangerouslySetInnerHTML={{ __html: result.content }} />
          </div>
          
          {result.images && result.images.length > 0 && (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {result.images.map((image, index) => (
                <div key={index} className="relative h-48 rounded-lg overflow-hidden bg-neutral-800">
                  <Image
                    src={image.url}
                    alt={image.alt}
                    fill
                    style={{ objectFit: 'cover' }}
                    unoptimized
                  />
                </div>
              ))}
            </div>
          )}
          
          <div className="mt-6 flex items-center space-x-4">
            <button 
              onClick={() => setShowSources(!showSources)}
              className="flex items-center text-sm text-neutral-400 hover:text-white"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className={`h-5 w-5 mr-1 transition-transform ${showSources ? 'rotate-180' : ''}`}
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              {showSources ? 'Hide' : 'Show'} Sources ({result.sources.length})
            </button>
            
            <button className="flex items-center text-sm text-neutral-400 hover:text-white">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-5 w-5 mr-1" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share
            </button>
            
            <button className="flex items-center text-sm text-neutral-400 hover:text-white">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-5 w-5 mr-1" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Follow-up
            </button>
          </div>
          
          {showSources && (
            <div className="mt-4">
              <SourcesList 
                sources={result.sources} 
                onSourceClick={(sourceId) => {
                  // Handle source click
                  console.log(`Source clicked: ${sourceId}`);
                }}
              />
            </div>
          )}
        </div>
        
        <div className="md:w-1/4 md:block">
          <div className="sticky top-6">
            <SourcesList 
              sources={result.sources.slice(0, 3)} 
              onSourceClick={(sourceId) => {
                // Handle source click
                console.log(`Source clicked: ${sourceId}`);
              }}
              totalSources={result.sources.length}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchResult;
