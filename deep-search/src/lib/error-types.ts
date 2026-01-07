/**
 * Standardized error types for API responses.
 * Used to provide contextual error messages to users.
 */

export type ErrorType =
  | 'credits_insufficient'    // Not enough credits
  | 'rate_limited'            // Too many requests
  | 'provider_unavailable'    // LLM/search provider is down
  | 'search_failed'           // Search API failed
  | 'synthesis_failed'        // LLM synthesis/summarization failed
  | 'network_error'           // Network/connection issue
  | 'timeout'                 // Request timed out
  | 'invalid_query'           // Query is invalid or empty
  | 'no_results'              // Search returned no results
  | 'auth_required'           // User not authenticated
  | 'unknown';                // Unknown error

export interface ApiError {
  error: string;              // Human-readable error message
  errorType: ErrorType;       // Categorized error type
  retryAfter?: number;        // Seconds to wait before retry (for rate limits)
  details?: string;           // Additional technical details
}

/**
 * User-friendly error messages for each error type.
 */
export const errorMessages: Record<ErrorType, { title: string; message: string; canRetry: boolean }> = {
  credits_insufficient: {
    title: 'Insufficient Credits',
    message: 'You don\'t have enough credits for this search. Purchase more to continue.',
    canRetry: false,
  },
  rate_limited: {
    title: 'Too Many Requests',
    message: 'You\'ve made too many requests. Please wait a moment before trying again.',
    canRetry: true,
  },
  provider_unavailable: {
    title: 'Service Temporarily Unavailable',
    message: 'Our AI service is temporarily unavailable. Please try again in a few moments.',
    canRetry: true,
  },
  search_failed: {
    title: 'Search Failed',
    message: 'We couldn\'t complete your search. Please try again.',
    canRetry: true,
  },
  synthesis_failed: {
    title: 'Response Generation Failed',
    message: 'We found results but couldn\'t generate a summary. Please try again.',
    canRetry: true,
  },
  network_error: {
    title: 'Connection Issue',
    message: 'Please check your internet connection and try again.',
    canRetry: true,
  },
  timeout: {
    title: 'Request Timed Out',
    message: 'The request took too long. Please try a simpler query or try again.',
    canRetry: true,
  },
  invalid_query: {
    title: 'Invalid Query',
    message: 'Please enter a valid search query.',
    canRetry: false,
  },
  no_results: {
    title: 'No Results Found',
    message: 'We couldn\'t find any results. Try different keywords.',
    canRetry: false,
  },
  auth_required: {
    title: 'Login Required',
    message: 'Please log in to continue.',
    canRetry: false,
  },
  unknown: {
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred. Please try again.',
    canRetry: true,
  },
};

/**
 * Detect error type from various error sources.
 */
export function detectErrorType(error: unknown): ErrorType {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Timeout errors
    if (message.includes('timeout') || message.includes('timed out') || error.name === 'TimeoutError') {
      return 'timeout';
    }

    // Network errors
    if (message.includes('network') || message.includes('fetch') || message.includes('connection') || error.name === 'TypeError') {
      return 'network_error';
    }

    // Abort errors (user cancelled)
    if (error.name === 'AbortError') {
      return 'unknown'; // Not really an error
    }
  }

  return 'unknown';
}

/**
 * Create a standardized API error response.
 */
export function createApiError(
  errorType: ErrorType,
  customMessage?: string,
  details?: string,
  retryAfter?: number
): ApiError {
  const defaultMessage = errorMessages[errorType].message;
  return {
    error: customMessage || defaultMessage,
    errorType,
    ...(details && { details }),
    ...(retryAfter && { retryAfter }),
  };
}
