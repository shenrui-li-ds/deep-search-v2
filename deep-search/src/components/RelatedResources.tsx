"use client";

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Card } from '@/components/ui/card';

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
      <h3 className="text-lg font-medium text-[var(--text-primary)] mb-6">Keep Reading</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {resources.map((resource) => (
          <Link
            href={resource.url}
            key={resource.id}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Card className="overflow-hidden hover:border-[var(--accent)] transition-all h-full">
              <div className="relative h-32 w-full bg-[var(--card)]">
                <Image
                  src={resource.imageUrl}
                  alt={resource.title}
                  fill
                  style={{ objectFit: 'cover' }}
                  unoptimized
                />
              </div>
              <div className="p-3">
                <h4 className="font-medium text-[var(--text-primary)] text-sm leading-tight mb-1">{resource.title}</h4>
                <p className="text-[var(--text-muted)] text-xs line-clamp-2">{resource.description}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default RelatedResources;
