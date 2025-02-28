"use client";

import React from 'react';
import Image from 'next/image';

interface SourceItemProps {
  title: string;
  url: string;
  iconUrl: string;
  author?: string;
  timeAgo?: string;
  readTime?: string;
  onClick: () => void;
  isActive?: boolean;
}

const SourceItem: React.FC<SourceItemProps> = ({
  title,
  url,
  iconUrl,
  author,
  timeAgo,
  readTime,
  onClick,
  isActive = false
}) => {
  // Extract domain from URL safely
  let domain = '';
  try {
    domain = new URL(url).hostname.replace('www.', '');
  } catch (e) {
    domain = url.split('/')[0];
  }

  return (
    <div 
      onClick={onClick}
      className={`flex items-center p-2 rounded-md cursor-pointer mb-2 transition-colors
                 ${isActive ? 'bg-neutral-800' : 'hover:bg-neutral-800'}`}
    >
      <div className="flex-shrink-0 mr-3">
        {/* Use a fallback for the image in case it fails to load */}
        <div className="relative w-6 h-6 rounded-full bg-neutral-700 flex items-center justify-center overflow-hidden">
          {iconUrl ? (
            <Image
              src={iconUrl}
              alt={`${domain} icon`}
              width={24}
              height={24}
              className="rounded-full"
              unoptimized
            />
          ) : (
            <span className="text-xs text-white">{domain.charAt(0).toUpperCase()}</span>
          )}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">
          {title}
        </p>
        <div className="flex text-xs text-neutral-400 mt-1">
          {author && <span className="mr-2 truncate">{author}</span>}
          {timeAgo && <span className="mr-2">{timeAgo}</span>}
          {readTime && <span>{readTime} read</span>}
        </div>
      </div>
    </div>
  );
};

export default SourceItem;
