"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

const Sidebar = () => {
  return (
    <div className="w-[200px] min-h-screen bg-neutral-900 text-white p-4 flex flex-col">
      <div className="flex items-center space-x-2 mb-8">
        <Image
          src="/logo.svg"
          alt="Deep Search Logo"
          width={24}
          height={24}
          className="text-white"
        />
        <span className="font-semibold text-lg">Deep Search</span>
      </div>
      
      <Link href="/" className="flex items-center py-2 px-4 mb-2 hover:bg-neutral-800 rounded-md">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        Home
      </Link>
      
      <Link href="/discover" className="flex items-center py-2 px-4 mb-2 hover:bg-neutral-800 rounded-md">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        Discover
      </Link>
      
      <Link href="/spaces" className="flex items-center py-2 px-4 mb-2 hover:bg-neutral-800 rounded-md">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        Spaces
      </Link>
      
      <Link href="/library" className="flex items-center py-2 px-4 mb-2 hover:bg-neutral-800 rounded-md">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
        </svg>
        Library
      </Link>
      
      <div className="mt-auto">
        <Link href="/signup" className="block w-full py-2 bg-teal-500 text-white text-center rounded-md mb-2 hover:bg-teal-600">
          Sign Up
        </Link>
        <Link href="/login" className="block w-full py-2 border border-neutral-600 text-white text-center rounded-md hover:bg-neutral-800">
          Log in
        </Link>
      </div>
    </div>
  );
};

export default Sidebar;
