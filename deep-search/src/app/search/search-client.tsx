"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SearchResult, Source, SearchImage } from '@/lib/types';
import SearchResultComponent from '@/components/SearchResult';
import ReactMarkdown from 'react-markdown';

interface SearchClientProps {
  query: string;
  provider?: string;
  deep?: boolean;
}

export default function SearchClient({ query, provider = 'OpenAI', deep = false }: SearchClientProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!query) return;
    
    const performSearch = async () => {
      setIsLoading(true);
      setError(null);
      let sources: Source[] = [];
      let images: SearchImage[] = [];
      
      try {
        // Step 1: Perform search via Tavily
        const searchResponse = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            query,
            searchDepth: deep ? 'advanced' : 'basic',
            maxResults: deep ? 15 : 10
          }),
        });
        
        if (!searchResponse.ok) {
          throw new Error('Search failed');
        }
        
        const searchData = await searchResponse.json();
        sources = searchData.sources || [];
        images = searchData.images || [];
        
        if (sources.length === 0) {
          setError('No search results found');
          setIsLoading(false);
          return;
        }
        
        // Step 2: Summarize search results via OpenAI
        const summarizeResponse = await fetch('/api/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            query,
            results: searchData.rawResults.results,
            stream: true
          }),
        });
        
        if (!summarizeResponse.ok) {
          throw new Error('Summarization failed');
        }
        
        // Set up result with empty content first
        setSearchResult({
          query,
          content: '',
          sources,
          images
        });
        
        // Handle streaming response
        const reader = summarizeResponse.body?.getReader();
        const decoder = new TextDecoder();
        
        if (reader) {
          setIsLoading(false);
          
          let buffer = '';
          
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              // Process any remaining buffer content when stream ends
              if (buffer.length > 0) {
                setSearchResult(prevResult => {
                  if (!prevResult) return null;
                  return {
                    ...prevResult,
                    content: prevResult.content + buffer
                  };
                });
              }
              break;
            }
            
            // Process the received chunk
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n\n');
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(5));
                  
                  if (data.done === true) {
                    // Process any remaining buffer content when stream ends
                    if (buffer.length > 0) {
                      setSearchResult(prevResult => {
                        if (!prevResult) return null;
                        return {
                          ...prevResult,
                          content: prevResult.content + buffer
                        };
                      });
                    }
                    // Stream is complete
                    break;
                  }
                  
                  // Add to buffer
                  buffer += data.data;
                  
                  // Improved text processing logic
                  // Look for natural break points (end of sentences or paragraphs)
                  // This regex matches sentence endings followed by space or newline characters
                  const sentenceEndRegex = /[.!?]\s+|\n\n/g;
                  let match;
                  let lastIndex = 0;
                  let matchFound = false;
                  
                  // Find the last complete sentence or paragraph in the buffer
                  while ((match = sentenceEndRegex.exec(buffer)) !== null) {
                    lastIndex = match.index + match[0].length;
                    matchFound = true;
                  }
                  
                  // If we have complete sentences, append them to the result
                  if (matchFound && lastIndex > 0) {
                    const completeText = buffer.substring(0, lastIndex);
                    buffer = buffer.substring(lastIndex);
                    
                    // Append complete text to the result
                    setSearchResult(prevResult => {
                      if (!prevResult) return null;
                      return {
                        ...prevResult,
                        content: prevResult.content + completeText
                      };
                    });
                  } 
                  // If buffer gets too large without finding sentence breaks,
                  // Look for word boundaries instead to avoid cutting words
                  else if (buffer.length > 80) {
                    // Find the last space character to avoid breaking words
                    const lastSpaceIndex = buffer.lastIndexOf(' ');
                    
                    if (lastSpaceIndex > 0) {
                      const completeText = buffer.substring(0, lastSpaceIndex + 1);
                      buffer = buffer.substring(lastSpaceIndex + 1);
                      
                      setSearchResult(prevResult => {
                        if (!prevResult) return null;
                        return {
                          ...prevResult,
                          content: prevResult.content + completeText
                        };
                      });
                    } else if (buffer.length > 150) {
                      // If buffer is extremely large with no spaces, flush it anyway
                      setSearchResult(prevResult => {
                        if (!prevResult) return null;
                        return {
                          ...prevResult,
                          content: prevResult.content + buffer
                        };
                      });
                      buffer = '';
                    }
                  }
                } catch (e) {
                  console.error('Error parsing stream:', e);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('Search error:', err);
        setError('An error occurred while processing your search');
      } finally {
        setIsLoading(false);
      }
    };
    
    performSearch();
  }, [query, provider, deep]);
  
  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center">
        <h2 className="text-xl text-red-500 mb-4">{error}</h2>
        <button 
          className="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700"
          onClick={() => router.push('/')}
        >
          Try a different search
        </button>
      </div>
    );
  }
  
  if (!searchResult && isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex flex-col items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500 mb-4"></div>
          <p className="text-neutral-400">Searching and analyzing results...</p>
        </div>
      </div>
    );
  }
  
  if (!searchResult) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center">
        <h2 className="text-xl text-red-500 mb-4">No results found</h2>
        <button 
          className="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700"
          onClick={() => router.push('/')}
        >
          Try a different search
        </button>
      </div>
    );
  }
  
  return (
    <SearchResultComponent
      query={query}
      result={{
        content: searchResult.content,
        sources: searchResult.sources,
        images: searchResult.images?.map(image => ({
          url: image.url,
          alt: image.alt,
          sourceId: image.sourceId || ''  // Ensure sourceId is always provided
        }))
      }}
      isLoading={isLoading}
    />
  );
}
