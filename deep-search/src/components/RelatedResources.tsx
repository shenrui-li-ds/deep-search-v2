"use client";

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface Resource {
  id: string;
  title: string;
  imageUrl: string;
  description: string;
  url: string;
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
            href={resource.url} 
            key={resource.id}
            className="block bg-neutral-800 rounded-lg overflow-hidden hover:ring-1 hover:ring-neutral-700 transition-all"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="relative h-32 w-full bg-neutral-800">
              <Image 
                src={resource.imageUrl} 
                alt={resource.title}
                fill
                style={{ objectFit: 'cover' }}
                unoptimized
              />
            </div>
            <div className="p-3">
              <h4 className="font-medium text-white text-sm leading-tight mb-1">{resource.title}</h4>
              <p className="text-neutral-400 text-xs line-clamp-2">{resource.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default RelatedResources;
