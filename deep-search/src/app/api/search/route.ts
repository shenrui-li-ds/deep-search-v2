import { NextRequest, NextResponse } from 'next/server';
import { callTavily } from '@/lib/api-utils';
import { v4 as uuidv4 } from 'uuid';
import { Source, SearchImage, TavilySearchResult } from '@/lib/types';

// Helper function to convert Tavily results to our Source format
function convertToSources(tavilyResults: TavilySearchResult): Source[] {
  return tavilyResults.results.map((result, index) => {
    // Extract domain from URL for the icon
    let domain = '';
    try {
      const url = new URL(result.url);
      domain = url.hostname;
    } catch (e) {
      console.error('Error parsing URL:', e);
      domain = 'example.com';
    }

    return {
      id: `s${index + 1}`,
      title: result.title,
      url: result.url,
      iconUrl: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
      author: result.author || result.source || domain,
      timeAgo: result.published_date ? getTimeAgo(result.published_date) : 'Recent',
      readTime: calculateReadTime(result.content),
    };
  });
}

// Helper function to convert Tavily images to our SearchImage format
function convertToImages(tavilyResults: TavilySearchResult): SearchImage[] {
  if (!tavilyResults.images || tavilyResults.images.length === 0) {
    return [];
  }

  return tavilyResults.images.map((image, index) => {
    return {
      url: image.url,
      alt: image.alt_text || 'Search result image',
      sourceId: `s${Math.min(index + 1, tavilyResults.results.length)}`, // Link to a valid source
    };
  });
}

// Calculate approximate read time
function calculateReadTime(content: string): string {
  const words = content.split(/\s+/).length;
  const readTimeMinutes = Math.max(1, Math.round(words / 200)); // Average reading speed
  return `${readTimeMinutes} min`;
}

// Get time ago from date string
function getTimeAgo(dateString: string): string {
  try {
    const publishedDate = new Date(dateString);
    const now = new Date();
    const diffInMilliseconds = now.getTime() - publishedDate.getTime();
    
    const diffInMinutes = Math.floor(diffInMilliseconds / (1000 * 60));
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);
    const diffInWeeks = Math.floor(diffInDays / 7);
    const diffInMonths = Math.floor(diffInDays / 30);
    
    if (diffInMonths > 0) {
      return `${diffInMonths} month${diffInMonths > 1 ? 's' : ''} ago`;
    } else if (diffInWeeks > 0) {
      return `${diffInWeeks} week${diffInWeeks > 1 ? 's' : ''} ago`;
    } else if (diffInDays > 0) {
      return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
    } else if (diffInHours > 0) {
      return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    } else {
      return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
    }
  } catch (e) {
    console.error('Error parsing date:', e);
    return 'Recent';
  }
}

export async function POST(req: NextRequest) {
  try {
    const { query, searchDepth = 'basic', maxResults = 10 } = await req.json();

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }

    // Call Tavily search API
    const tavilyResults = await callTavily(
      query,
      true, // include images
      searchDepth as 'basic' | 'advanced',
      maxResults
    );

    // Convert Tavily results to our format
    const sources = convertToSources(tavilyResults);
    const images = convertToImages(tavilyResults);

    return NextResponse.json({
      query,
      sources,
      images,
      rawResults: tavilyResults,
    });
  } catch (error) {
    console.error('Error in search API:', error);
    return NextResponse.json(
      { error: 'Failed to perform search' },
      { status: 500 }
    );
  }
}
