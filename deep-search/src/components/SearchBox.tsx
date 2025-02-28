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
      router.push(`/search?q=${encodeURIComponent(query)}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch(e);
    }
  };

  const handleSendRequest = () => {
    // This will be implemented later when we have a backend
    console.log(`Sending request with query: ${query}, provider: ${selectedProvider}, deep research: ${deepResearchEnabled}`);
    // For now, just navigate to the search results page
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query)}`);
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
        />
        <button 
          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-400 hover:text-white"
          onClick={handleSendRequest}
        >
          <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      {large && (
        <div className="flex justify-between items-center mt-2">
          <div className="flex items-center space-x-2">
            <div className="relative" ref={dropdownRef}>
              <button 
                className="flex items-center text-sm text-neutral-400 hover:text-white bg-neutral-800 px-3 py-1 rounded"
                onClick={() => setShowDropdown(!showDropdown)}
              >
                {selectedProvider}
                <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"></path>
                </svg>
              </button>
              {showDropdown && (
                <div className="absolute left-0 mt-1 w-40 rounded-md shadow-lg bg-neutral-800 ring-1 ring-black ring-opacity-5 z-10">
                  <div className="py-1" role="menu" aria-orientation="vertical">
                    {apiProviders.map((provider) => (
                      <button
                        key={provider}
                        className={`block px-4 py-2 text-sm w-full text-left ${
                          provider === selectedProvider ? 'bg-neutral-700 text-white' : 'text-neutral-300 hover:bg-neutral-700'
                        }`}
                        onClick={() => {
                          setSelectedProvider(provider);
                          setShowDropdown(false);
                        }}
                      >
                        {provider}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button 
              className={`flex items-center text-sm px-3 py-1 rounded ${
                deepResearchEnabled 
                  ? 'bg-teal-600 text-white' 
                  : 'bg-neutral-800 text-neutral-400 hover:text-white'
              }`}
              onClick={() => setDeepResearchEnabled(!deepResearchEnabled)}
            >
              <span className="material-symbols-outlined mr-1" style={{ fontSize: '16px' }}>travel_explore</span>
              Deep Research {deepResearchEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchBox;
