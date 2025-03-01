"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SearchResult, Source, SearchImage } from '@/lib/types';
import SearchResultComponent from '@/components/SearchResult';

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
          
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
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
                    // Stream is complete
                    break;
                  }
                  
                  // Append new content to the result
                  setSearchResult(prevResult => {
                    if (!prevResult) return null;
                    return {
                      ...prevResult,
                      content: prevResult.content + data.data
                    };
                  });
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
  
  // Format content for HTML rendering
  const formattedContent = searchResult.content
    // Convert markdown headings to HTML
    .replace(/## (.*?)\n/g, '<h2 class="text-2xl font-semibold mb-3 mt-6">$1</h2>\n')
    .replace(/# (.*?)\n/g, '<h1 class="text-3xl font-bold mb-4">$1</h1>\n')
    // Convert markdown bold to HTML
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Convert markdown italic to HTML
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Convert markdown links to HTML
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="text-teal-500 hover:underline" target="_blank" rel="noopener noreferrer">$1</a>')
    // Convert line breaks to paragraphs
    .replace(/\n\n/g, '</p><p class="mb-4">')
    // Convert horizontal rules
    .replace(/---/g, '<hr class="my-4 border-neutral-700"/>')
    // Wrap everything in a paragraph if not already
    .replace(/^(?!<h|<p|<ul|<ol|<hr)(.+)/gm, '<p class="mb-4">$1</p>');
  
  return (
    <SearchResultComponent
      query={query}
      result={{
        content: formattedContent,
        sources: searchResult.sources,
        images: searchResult.images
      }}
      isLoading={isLoading}
    />
  );
}
