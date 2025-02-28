"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

interface SearchBoxProps {
  large?: boolean;
  defaultQuery?: string;
}

const SearchBox: React.FC<SearchBoxProps> = ({ large = false, defaultQuery = '' }) => {
  const router = useRouter();
  const [query, setQuery] = useState(defaultQuery);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setIsLoading(true);
    // In a real application, we would handle the search here
    // For now, let's just navigate to the results page
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <div className={`w-full ${large ? 'max-w-2xl' : 'max-w-full'}`}>
      <form onSubmit={handleSubmit} className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask anything..."
          className={`w-full bg-neutral-800 text-white border border-neutral-700 
                     rounded-md pl-4 pr-12 ${large ? 'py-3 text-lg' : 'py-2 text-base'}
                     focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
        />
        <button 
          type="submit"
          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-400 hover:text-white"
          disabled={isLoading}
        >
          {isLoading ? (
            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          )}
        </button>
      </form>
      {large && (
        <div className="flex justify-start mt-2">
          <button 
            className="flex items-center text-sm text-neutral-400 hover:text-white mr-4"
            onClick={() => {
              setQuery('');
              router.push('/');
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clear
          </button>
          <button className="flex items-center text-sm text-neutral-400 hover:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            Try Deep Research
          </button>
        </div>
      )}
    </div>
  );
};

export default SearchBox;
