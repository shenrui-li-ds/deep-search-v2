"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface SearchBoxProps {
  large?: boolean;
  initialValue?: string;
}

const SearchBox: React.FC<SearchBoxProps> = ({ large = false, initialValue = '' }) => {
  const [query, setQuery] = useState(initialValue);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('OpenAI');
  const [deepResearchEnabled, setDeepResearchEnabled] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      performSearch();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (query.trim()) {
        performSearch();
      }
      e.preventDefault();
    }
  };

  const performSearch = async () => {
    if (isSearching || !query.trim()) return;

    try {
      setIsSearching(true);

      // Step 1: Refine the search query
      const refineResponse = await fetch('/api/refine', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: query.trim() }),
      });

      if (!refineResponse.ok) {
        throw new Error('Failed to refine search query');
      }

      const refinedData = await refineResponse.json();
      const refinedQuery = refinedData.refinedQuery || query.trim();

      // Step 2: Navigate to search results page with the refined query
      router.push(`/search?q=${encodeURIComponent(refinedQuery)}&provider=${encodeURIComponent(selectedProvider)}&deep=${deepResearchEnabled}`);
    } catch (error) {
      console.error('Search error:', error);
      // Fallback to direct navigation if something goes wrong
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendRequest = () => {
    if (query.trim()) {
      performSearch();
    }
  };

  const apiProviders = ['OpenAI', 'DeepSeek', 'Qwen'];

  return (
    <div className={`flex flex-col ${large ? 'w-full' : 'max-w-full'}`}>
      <div className={`relative flex items-center ${large ? 'h-14' : 'h-10'}`}>
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg
            className="h-5 w-5 text-neutral-400"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <input
          type="text"
          className={`block w-full pl-10 pr-12 py-2 border border-neutral-700 bg-neutral-800 placeholder-neutral-400 text-white rounded-lg ${
            large ? 'text-lg' : 'text-base'
          }`}
          placeholder="Ask anything..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSearching}
        />
        <button 
          className={`absolute right-3 top-1/2 transform -translate-y-1/2 ${isSearching ? 'text-teal-500' : 'text-neutral-400 hover:text-white'}`}
          onClick={handleSendRequest}
          disabled={isSearching}
        >
          {isSearching ? (
            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          )}
        </button>
      </div>

      {large && (
        <div className="flex mt-2 items-center text-xs">
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              className="px-3 py-1 flex items-center text-neutral-300 hover:text-white bg-neutral-800 rounded-full"
              onClick={() => setShowDropdown(!showDropdown)}
            >
              <span>Provider: {selectedProvider}</span>
              <svg
                className={`ml-1 h-4 w-4 transform ${showDropdown ? 'rotate-180' : ''}`}
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            {showDropdown && (
              <div className="absolute mt-2 w-40 bg-neutral-800 rounded-md shadow-lg z-10">
                {apiProviders.map((provider) => (
                  <button
                    key={provider}
                    className="block w-full text-left px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
                    onClick={() => {
                      setSelectedProvider(provider);
                      setShowDropdown(false);
                    }}
                  >
                    {provider}
                  </button>
                ))}
              </div>
            )}
          </div>

          <label className="inline-flex items-center ml-4 cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={deepResearchEnabled}
              onChange={() => setDeepResearchEnabled(!deepResearchEnabled)}
            />
            <div className="relative w-9 h-5 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-teal-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
            <span className="ml-2 text-neutral-300">Deep Research</span>
          </label>
        </div>
      )}
    </div>
  );
};

export default SearchBox;
