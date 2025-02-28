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
  // Extract domain from URL
  const domain = new URL(url).hostname.replace('www.', '');

  return (
    <div 
      onClick={onClick}
      className={`flex items-center p-2 rounded-md cursor-pointer mb-2 transition-colors
                 ${isActive ? 'bg-neutral-800' : 'hover:bg-neutral-800'}`}
    >
      <div className="flex-shrink-0 mr-3">
        <Image
          src={iconUrl}
          alt={`${domain} icon`}
          width={24}
          height={24}
          className="rounded-full"
        />
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
