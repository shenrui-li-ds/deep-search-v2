export interface Source {
  id: string;
  title: string;
  url: string;
  iconUrl: string;
  author?: string;
  timeAgo?: string;
  readTime?: string;
}

export interface SearchImage {
  url: string;
  alt: string;
  sourceId?: string;
}

export interface SearchResult {
  query: string;
  content: string;
  sources: Source[];
  images: SearchImage[];
}

export interface RelatedQuestion {
  id: string;
  question: string;
}

export interface RelatedResource {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  url: string;
}

export interface TavilySearchResult {
  query: string;
  results: {
    title: string;
    url: string;
    content: string;
    published_date?: string;
    author?: string;
    source?: string;
  }[];
  images?: {
    url: string;
    alt_text?: string;
  }[];
  search_context?: {
    retrieved_from?: string;
    search_depth?: string;
    search_type?: string;
  };
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
}

export interface StreamData {
  data: string;
  done: boolean;
}
