"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import SearchBox from './SearchBox';
import SourcesList from './SourcesList';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

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
            <div className="markdown-content mx-auto my-6 text-base">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw, rehypeSanitize]}
                components={{
                  h1: ({children, ...props}) => <h1 className="text-3xl font-bold mb-4 mt-6" {...props}>{children}</h1>,
                  h2: ({children, ...props}) => <h2 className="text-2xl font-semibold mb-3 mt-5" {...props}>{children}</h2>,
                  h3: ({children, ...props}) => <h3 className="text-xl font-semibold mb-2 mt-4" {...props}>{children}</h3>,
                  h4: ({children, ...props}) => <h4 className="text-lg font-medium mb-2 mt-3" {...props}>{children}</h4>,
                  p: ({children, ...props}) => <p className="mb-4" {...props}>{children}</p>,
                  ul: ({children, ...props}) => <ul className="list-disc ml-5 mb-4" {...props}>{children}</ul>,
                  ol: ({children, ...props}) => <ol className="list-decimal ml-5 mb-4" {...props}>{children}</ol>,
                  li: ({children, ...props}) => <li className="mb-1" {...props}>{children}</li>,
                  a: ({children, href, ...props}) => <a className="text-teal-500 hover:underline" href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>,
                  blockquote: ({children, ...props}) => <blockquote className="border-l-4 border-neutral-500 pl-4 italic my-4" {...props}>{children}</blockquote>,
                  code: (props: any) => {
                    const {inline, className, children, ...rest} = props;
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <pre className="bg-neutral-800 p-3 rounded overflow-x-auto mb-4">
                        <code
                          className={`language-${match[1]}`}
                          {...rest}
                        >
                          {children}
                        </code>
                      </pre>
                    ) : (
                      <code className="bg-neutral-800 px-1 py-0.5 rounded text-sm" {...rest}>
                        {children}
                      </code>
                    );
                  },
                  hr: ({...props}) => <hr className="my-6 border-neutral-700" {...props} />,
                  img: ({src, alt, ...props}) => <img className="max-w-full h-auto my-4 rounded" src={src} alt={alt || ''} {...props} />,
                  strong: ({children, ...props}) => <strong className="font-bold" {...props}>{children}</strong>,
                  em: ({children, ...props}) => <em className="italic" {...props}>{children}</em>
                }}
              >
                {result.content}
              </ReactMarkdown>
            </div>
            
            {result.images && result.images.length > 0 && (
              <div className="mt-6 mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <h3 className="text-xl font-semibold col-span-full mb-2">Relevant Images</h3>
                {result.images.map((image, index) => (
                  <div key={index} className="relative h-48 rounded-lg overflow-hidden bg-neutral-800 border border-neutral-700 shadow-md">
                    {image.url && image.url.trim() !== '' ? (
                      <Image
                        src={image.url}
                        alt={image.alt || 'Search result image'}
                        fill
                        style={{ objectFit: 'cover' }}
                        unoptimized
                        onError={(e) => {
                          // Replace with placeholder if image fails to load
                          const target = e.target as HTMLImageElement;
                          target.onerror = null; // Prevent infinite loop
                          target.src = "https://via.placeholder.com/300x200?text=Image+Unavailable";
                        }}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full w-full bg-neutral-800">
                        <p className="text-neutral-400 text-sm">Image Unavailable</p>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 p-2 text-xs">
                      {image.alt || 'No description available'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
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
              sources={result.sources} 
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
