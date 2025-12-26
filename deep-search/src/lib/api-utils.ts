/**
 * Utility functions for API requests
 */

// Message type for LLM API calls
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
}

// Search result type for summarization
interface SearchResultItem {
  title: string;
  url: string;
  content: string;
}

// LLM Provider type - matches the frontend ModelProvider type
export type LLMProvider = 'openai' | 'deepseek' | 'qwen' | 'claude';

// API endpoints
export const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
export const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
export const QWEN_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
export const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

// Tavily API endpoints
export const TAVILY_API_URL = 'https://api.tavily.com/search';

// Determine which LLM provider to use based on available API keys (fallback)
export function getLLMProvider(): LLMProvider {
  // Prefer DeepSeek if available (since OpenAI quota may be exceeded)
  if (process.env.DEEPSEEK_API_KEY) {
    return 'deepseek';
  }
  if (process.env.OPENAI_API_KEY) {
    return 'openai';
  }
  if (process.env.QWEN_API_KEY) {
    return 'qwen';
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return 'claude';
  }
  throw new Error('No LLM API key configured. Please set DEEPSEEK_API_KEY, OPENAI_API_KEY, QWEN_API_KEY, or ANTHROPIC_API_KEY.');
}

// Check if a specific provider has an API key configured
export function isProviderAvailable(provider: LLMProvider): boolean {
  switch (provider) {
    case 'openai':
      return !!process.env.OPENAI_API_KEY;
    case 'deepseek':
      return !!process.env.DEEPSEEK_API_KEY;
    case 'qwen':
      return !!process.env.QWEN_API_KEY;
    case 'claude':
      return !!process.env.ANTHROPIC_API_KEY;
    default:
      return false;
  }
}

// DeepSeek API request (OpenAI-compatible)
export async function callDeepSeek(
  messages: ChatMessage[],
  model: string = 'deepseek-chat',
  temperature: number = 0.7,
  stream: boolean = false
) {
  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        stream,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`DeepSeek API error: ${error.error?.message || 'Unknown error'}`);
    }

    if (stream) {
      return response;
    } else {
      const data = await response.json();
      return data.choices[0].message.content;
    }
  } catch (error) {
    console.error('Error calling DeepSeek API:', error);
    throw error;
  }
}

// OpenAI API request
export async function callOpenAI(
  messages: ChatMessage[],
  model: string = 'gpt-4o',
  temperature: number = 0.7,
  stream: boolean = false
) {
  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        stream,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
    }

    if (stream) {
      return response;
    } else {
      const data = await response.json();
      return data.choices[0].message.content;
    }
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    throw error;
  }
}

// Qwen API request (OpenAI-compatible)
export async function callQwen(
  messages: ChatMessage[],
  model: string = 'qwen-plus',
  temperature: number = 0.7,
  stream: boolean = false
) {
  try {
    const response = await fetch(QWEN_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.QWEN_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        stream,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Qwen API error: ${error.error?.message || 'Unknown error'}`);
    }

    if (stream) {
      return response;
    } else {
      const data = await response.json();
      return data.choices[0].message.content;
    }
  } catch (error) {
    console.error('Error calling Qwen API:', error);
    throw error;
  }
}

// Claude API request (Anthropic format)
export async function callClaude(
  messages: ChatMessage[],
  model: string = 'claude-sonnet-4-20250514',
  temperature: number = 0.7,
  stream: boolean = false
) {
  try {
    // Convert OpenAI message format to Anthropic format
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const anthropicMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }));

    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature,
        system: systemMessage,
        messages: anthropicMessages,
        stream,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Claude API error: ${error.error?.message || 'Unknown error'}`);
    }

    if (stream) {
      return response;
    } else {
      const data = await response.json();
      return data.content[0].text;
    }
  } catch (error) {
    console.error('Error calling Claude API:', error);
    throw error;
  }
}

// Helper function to parse stream response from Claude (Anthropic format)
export async function* streamClaudeResponse(response: Response) {
  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data.trim() === '[DONE]') {
            return;
          }
          try {
            const parsed = JSON.parse(data);
            // Anthropic uses delta.text for streaming
            if (parsed.type === 'content_block_delta') {
              const content = parsed.delta?.text || '';
              if (content) {
                yield content;
              }
            }
          } catch {
            // Ignore parse errors for non-JSON lines
          }
        }
      }
    }
  } catch (error) {
    console.error('Error reading Claude stream:', error);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

// Unified LLM call - routes to the specified provider or auto-selects based on available API keys
export async function callLLM(
  messages: ChatMessage[],
  temperature: number = 0.7,
  stream: boolean = false,
  provider?: LLMProvider
) {
  // Use specified provider or fall back to auto-detection
  const selectedProvider = provider || getLLMProvider();

  // Check if the selected provider is available
  if (provider && !isProviderAvailable(provider)) {
    console.warn(`Provider ${provider} not available, falling back to auto-detection`);
    const fallbackProvider = getLLMProvider();
    console.log(`Using fallback provider: ${fallbackProvider}`);
    return callLLMForProvider(messages, temperature, stream, fallbackProvider);
  }

  return callLLMForProvider(messages, temperature, stream, selectedProvider);
}

// Internal helper to call the appropriate provider
function callLLMForProvider(
  messages: ChatMessage[],
  temperature: number,
  stream: boolean,
  provider: LLMProvider
) {
  switch (provider) {
    case 'deepseek':
      console.log('Using DeepSeek API');
      return callDeepSeek(messages, 'deepseek-chat', temperature, stream);
    case 'openai':
      console.log('Using OpenAI API');
      return callOpenAI(messages, 'gpt-4o', temperature, stream);
    case 'qwen':
      console.log('Using Qwen API');
      return callQwen(messages, 'qwen-plus', temperature, stream);
    case 'claude':
      console.log('Using Claude API');
      return callClaude(messages, 'claude-sonnet-4-20250514', temperature, stream);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// Get the appropriate stream parser for a provider
export function getStreamParser(provider: LLMProvider) {
  if (provider === 'claude') {
    return streamClaudeResponse;
  }
  // OpenAI, DeepSeek, and Qwen all use OpenAI-compatible streaming
  return streamOpenAIResponse;
}

// Tavily API request
export async function callTavily(
  query: string,
  includeImages: boolean = true,
  searchDepth: 'basic' | 'advanced' = 'basic',
  maxResults: number = 10
) {
  try {
    console.log('Calling Tavily API with:', { query, includeImages, searchDepth, maxResults });
    
    if (!process.env.TAVILY_API_KEY) {
      throw new Error('TAVILY_API_KEY is not defined in environment variables');
    }
    
    const requestBody = {
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: searchDepth,
      include_images: includeImages,
      max_results: maxResults,
    };
    
    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      let errorMessage = 'Unknown error';
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || 'Unknown error';
      } catch {
        errorMessage = `Error parsing error response: ${response.statusText}`;
      }
      console.error('Tavily API error details:', {
        status: response.status,
        statusText: response.statusText,
        errorMessage
      });
      throw new Error(`Tavily API error: ${errorMessage}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error calling Tavily API:', error);
    throw error;
  }
}

// Helper function to parse stream response from OpenAI
export async function* streamOpenAIResponse(response: Response) {
  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        // If there's anything left in the buffer when the stream ends, yield it
        if (buffer.trim()) {
          yield buffer.trim();
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data.trim() === '[DONE]') {
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content || '';
            if (content) {
              yield content;
            }
          } catch (e) {
            console.error('Error parsing JSON from stream:', e);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error reading stream:', error);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

// Helper function to format search results for summarization
export function formatSearchResultsForSummarization(searchResults: SearchResultItem[]) {
  return searchResults.map((result, index) => {
    return `<result index="${index + 1}">
      <title>${result.title}</title>
      <url>${result.url}</url>
      <content>${result.content}</content>
    </result>`;
  }).join('\n');
}

// Helper function to get current date in a formatted string
export function getCurrentDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
