"use client";

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface Resource {
  id: string;
  title: string;
  imageUrl: string;
  description: string;
  viewCount: number;
}

interface RelatedResourcesProps {
  resources: Resource[];
}

const RelatedResources: React.FC<RelatedResourcesProps> = ({ resources }) => {
  return (
    <div className="mt-10">
      <h3 className="text-lg font-medium text-white mb-6">Keep Reading</h3>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {resources.map((resource) => (
          <Link 
            href={`/resource/${resource.id}`} 
            key={resource.id}
            className="block bg-neutral-800 rounded-lg overflow-hidden hover:ring-1 hover:ring-neutral-700 transition-all"
          >
            <div className="relative h-32 w-full">
              <Image
                src={resource.imageUrl}
                alt={resource.title}
                fill
                style={{ objectFit: 'cover' }}
              />
            </div>
            <div className="p-3">
              <h4 className="text-sm font-medium text-white mb-1 line-clamp-2">
                {resource.title}
              </h4>
              <p className="text-xs text-neutral-400 mb-2 line-clamp-2">
                {resource.description}
              </p>
              <div className="flex items-center text-xs text-neutral-500">
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className="h-3 w-3 mr-1" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                {resource.viewCount.toLocaleString()}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default RelatedResources;
