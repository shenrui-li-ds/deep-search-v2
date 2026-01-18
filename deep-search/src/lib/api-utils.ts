/**
 * Utility functions for API requests
 *
 * Features:
 * - Multi-provider LLM support with automatic fallback
 * - Retry with exponential backoff for transient failures
 * - Circuit breaker pattern to prevent cascading failures
 * - Configurable timeouts
 */

import {
  circuitBreakerRegistry,
  resilientCall,
  PROVIDER_TIMEOUTS,
  PROVIDER_RETRY_OPTIONS,
  CIRCUIT_BREAKER_OPTIONS,
  UserTier,
} from './resilience';
import { TavilySearchResult } from './types';

// Re-export UserTier for convenience
export { UserTier } from './resilience';

// Message type for LLM API calls
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
}

// Token usage from LLM providers
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// LLM response with optional usage data
export interface LLMResponse {
  content: string;
  usage?: TokenUsage;
}

// Streaming result with final usage
export interface StreamingResult {
  response: Response;
  getUsage?: () => TokenUsage | undefined;
}

// Search result type for summarization
interface SearchResultItem {
  title: string;
  url: string;
  content: string;
}

// LLM Provider type - the underlying API provider
export type LLMProvider = 'openai' | 'deepseek' | 'grok' | 'claude' | 'gemini' | 'vercel-gateway';

// Model ID type - user-selectable model identifiers
// Uses provider-based naming for future compatibility (update MODEL_CONFIG when new versions release)
export type ModelId =
  | 'gemini'          // Google Gemini Flash (latest fast model)
  | 'gemini-pro'      // Google Gemini Pro (latest pro model)
  | 'openai'          // OpenAI flagship (latest)
  | 'openai-mini'     // OpenAI mini series (latest)
  | 'deepseek'        // DeepSeek Chat
  | 'grok'            // xAI Grok
  | 'claude'          // Anthropic Claude
  | 'vercel-gateway'; // Vercel AI Gateway

// Model configuration - maps ModelId to provider and actual model name
// When new model versions release, update the model strings here
export const MODEL_CONFIG: Record<ModelId, { provider: LLMProvider; model: string; label: string }> = {
  'gemini': { provider: 'gemini', model: 'gemini-3-flash-preview', label: 'Gemini Flash' },
  'gemini-pro': { provider: 'gemini', model: 'gemini-3-pro-preview', label: 'Gemini Pro' },
  'openai': { provider: 'openai', model: 'gpt-5.2-2025-12-11', label: 'GPT-5.2' },
  'openai-mini': { provider: 'openai', model: 'gpt-5-mini-2025-08-07', label: 'GPT-5 mini' },
  'deepseek': { provider: 'deepseek', model: 'deepseek-chat', label: 'DeepSeek Chat' },
  'grok': { provider: 'grok', model: 'grok-4-1-fast', label: 'Grok 4.1 Fast' },
  'claude': { provider: 'claude', model: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  'vercel-gateway': { provider: 'vercel-gateway', model: 'alibaba/qwen3-max', label: 'Qwen 3 Max' },
};

// Get provider from model ID
export function getProviderFromModelId(modelId: ModelId): LLMProvider {
  return MODEL_CONFIG[modelId]?.provider || 'gemini';
}

// Get actual model string from model ID
export function getModelFromModelId(modelId: ModelId): string {
  return MODEL_CONFIG[modelId]?.model || 'gemini-3-flash-preview';
}

// API endpoints
export const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
export const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
export const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';
export const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
export const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
export const VERCEL_GATEWAY_API_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions';

// Tavily API endpoints
export const TAVILY_API_URL = 'https://api.tavily.com/search';

// Google Custom Search API endpoints
export const GOOGLE_SEARCH_API_URL = 'https://customsearch.googleapis.com/customsearch/v1';

// Jina Reader API for content extraction
export const JINA_READER_API_URL = 'https://r.jina.ai';

// Jina Reader extraction result
interface JinaExtractionResult {
  url: string;
  content: string;
  success: boolean;
}

/**
 * Check if Jina API key is configured (optional but recommended for higher rate limits)
 * Without key: 20 RPM, With key: 500 RPM + 10M free tokens
 */
export function isJinaApiKeyConfigured(): boolean {
  return !!process.env.JINA_API_KEY;
}

/**
 * Extract content from a URL using Jina Reader API
 * Returns markdown content or empty string on failure
 */
export async function extractContentWithJina(
  url: string,
  timeoutMs: number = 10000
): Promise<JinaExtractionResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Build headers - API key is optional but provides higher rate limits
    const headers: Record<string, string> = {
      'Accept': 'text/plain',
      'X-Return-Format': 'markdown',
    };

    // Add API key if configured (500 RPM vs 20 RPM without)
    if (process.env.JINA_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.JINA_API_KEY}`;
    }

    const response = await fetch(`${JINA_READER_API_URL}/${encodeURIComponent(url)}`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[Jina] Failed to extract ${url}: ${response.status}`);
      return { url, content: '', success: false };
    }

    const content = await response.text();

    // Jina returns markdown content, truncate to reasonable size
    const truncatedContent = content.slice(0, 8000);

    return { url, content: truncatedContent, success: true };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn(`[Jina] Timeout extracting ${url}`);
    } else {
      console.warn(`[Jina] Error extracting ${url}:`, error);
    }
    return { url, content: '', success: false };
  }
}

/**
 * Extract content from multiple URLs in parallel using Jina Reader
 * Returns a map of URL -> content
 */
export async function extractContentsWithJina(
  urls: string[],
  timeoutMs: number = 10000,
  maxConcurrent: number = 5
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  // Process in batches to avoid overwhelming the API
  for (let i = 0; i < urls.length; i += maxConcurrent) {
    const batch = urls.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(url => extractContentWithJina(url, timeoutMs))
    );

    for (const result of batchResults) {
      if (result.success && result.content) {
        results.set(result.url, result.content);
      }
    }
  }

  return results;
}

// Determine which LLM provider to use based on available API keys (fallback)
export function getLLMProvider(): LLMProvider {
  // Prefer DeepSeek if available (since OpenAI quota may be exceeded)
  if (process.env.DEEPSEEK_API_KEY) {
    return 'deepseek';
  }
  if (process.env.OPENAI_API_KEY) {
    return 'openai';
  }
  if (process.env.GROK_API_KEY) {
    return 'grok';
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return 'claude';
  }
  if (process.env.GEMINI_API_KEY) {
    return 'gemini';
  }
  throw new Error('No LLM API key configured. Please set DEEPSEEK_API_KEY, OPENAI_API_KEY, GROK_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY.');
}

// Check if a specific provider has an API key configured
export function isProviderAvailable(provider: LLMProvider): boolean {
  switch (provider) {
    case 'openai':
      return !!process.env.OPENAI_API_KEY;
    case 'deepseek':
      return !!process.env.DEEPSEEK_API_KEY;
    case 'grok':
      return !!process.env.GROK_API_KEY;
    case 'claude':
      return !!process.env.ANTHROPIC_API_KEY;
    case 'gemini':
      return !!process.env.GEMINI_API_KEY;
    case 'vercel-gateway':
      return !!process.env.VERCEL_AI_GATEWAY_KEY;
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
): Promise<Response | LLMResponse> {
  const circuitBreaker = circuitBreakerRegistry.getBreaker('deepseek', CIRCUIT_BREAKER_OPTIONS.llm);

  const makeRequest = async (): Promise<Response | LLMResponse> => {
    const requestBody: Record<string, unknown> = {
      model,
      messages,
      temperature,
      stream,
    };

    // Request usage data in streaming response
    if (stream) {
      requestBody.stream_options = { include_usage: true };
    }

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`DeepSeek API error: ${error.error?.message || 'Unknown error'}`);
    }

    if (stream) {
      return response;
    } else {
      const data = await response.json();
      return {
        content: data.choices[0].message.content,
        usage: data.usage ? {
          prompt_tokens: data.usage.prompt_tokens || 0,
          completion_tokens: data.usage.completion_tokens || 0,
          total_tokens: data.usage.total_tokens || 0,
        } : undefined,
      };
    }
  };

  return resilientCall(makeRequest, {
    name: 'deepseek',
    timeoutMs: stream ? PROVIDER_TIMEOUTS.llmStreaming : PROVIDER_TIMEOUTS.llm,
    circuitBreaker,
    ...PROVIDER_RETRY_OPTIONS.llm,
  });
}

// OpenAI API request
export async function callOpenAI(
  messages: ChatMessage[],
  model: string = 'gpt-5.2-2025-12-11',
  temperature: number = 0.7,
  stream: boolean = false
): Promise<Response | LLMResponse> {
  const circuitBreaker = circuitBreakerRegistry.getBreaker('openai', CIRCUIT_BREAKER_OPTIONS.llm);

  const makeRequest = async (): Promise<Response | LLMResponse> => {
    // Some models (reasoning models like o1, o3, gpt-5) don't support custom temperature
    // GPT-5, GPT-5.1, GPT-5.2 are reasoning models; GPT-5 mini supports temperature
    const noTemperatureModels = ['o1', 'o3', 'gpt-5.1', 'gpt-5.2'];
    const supportsTemperature = !noTemperatureModels.some(m => model.startsWith(m));

    const requestBody: Record<string, unknown> = {
      model,
      messages,
      stream,
    };

    // Only include temperature for models that support it
    if (supportsTemperature) {
      requestBody.temperature = temperature;
    }

    // Request usage data in streaming response
    if (stream) {
      requestBody.stream_options = { include_usage: true };
    }

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
    }

    if (stream) {
      return response;
    } else {
      const data = await response.json();
      return {
        content: data.choices[0].message.content,
        usage: data.usage ? {
          prompt_tokens: data.usage.prompt_tokens || 0,
          completion_tokens: data.usage.completion_tokens || 0,
          total_tokens: data.usage.total_tokens || 0,
        } : undefined,
      };
    }
  };

  return resilientCall(makeRequest, {
    name: 'openai',
    timeoutMs: stream ? PROVIDER_TIMEOUTS.llmStreaming : PROVIDER_TIMEOUTS.llm,
    circuitBreaker,
    ...PROVIDER_RETRY_OPTIONS.llm,
  });
}

// Grok API request (OpenAI-compatible, from x.ai)
export async function callGrok(
  messages: ChatMessage[],
  model: string = 'grok-4-1-fast',
  temperature: number = 0.7,
  stream: boolean = false
): Promise<Response | LLMResponse> {
  const circuitBreaker = circuitBreakerRegistry.getBreaker('grok', CIRCUIT_BREAKER_OPTIONS.llm);

  const makeRequest = async (): Promise<Response | LLMResponse> => {
    const requestBody: Record<string, unknown> = {
      model,
      messages,
      temperature,
      stream,
    };

    // Request usage data in streaming response
    if (stream) {
      requestBody.stream_options = { include_usage: true };
    }

    const response = await fetch(GROK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROK_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Grok API error: ${error.error?.message || 'Unknown error'}`);
    }

    if (stream) {
      return response;
    } else {
      const data = await response.json();
      return {
        content: data.choices[0].message.content,
        usage: data.usage ? {
          prompt_tokens: data.usage.prompt_tokens || 0,
          completion_tokens: data.usage.completion_tokens || 0,
          total_tokens: data.usage.total_tokens || 0,
        } : undefined,
      };
    }
  };

  return resilientCall(makeRequest, {
    name: 'grok',
    timeoutMs: stream ? PROVIDER_TIMEOUTS.llmStreaming : PROVIDER_TIMEOUTS.llm,
    circuitBreaker,
    ...PROVIDER_RETRY_OPTIONS.llm,
  });
}

// Claude API request (Anthropic format)
export async function callClaude(
  messages: ChatMessage[],
  model: string = 'claude-haiku-4-5',
  temperature: number = 0.7,
  stream: boolean = false
): Promise<Response | LLMResponse> {
  const circuitBreaker = circuitBreakerRegistry.getBreaker('claude', CIRCUIT_BREAKER_OPTIONS.llm);

  const makeRequest = async (): Promise<Response | LLMResponse> => {
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
      // Claude uses input_tokens and output_tokens
      return {
        content: data.content[0].text,
        usage: data.usage ? {
          prompt_tokens: data.usage.input_tokens || 0,
          completion_tokens: data.usage.output_tokens || 0,
          total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
        } : undefined,
      };
    }
  };

  return resilientCall(makeRequest, {
    name: 'claude',
    timeoutMs: stream ? PROVIDER_TIMEOUTS.llmStreaming : PROVIDER_TIMEOUTS.llm,
    circuitBreaker,
    ...PROVIDER_RETRY_OPTIONS.llm,
  });
}

// Gemini API request (Google AI format)
export async function callGemini(
  messages: ChatMessage[],
  model: string = 'gemini-3-flash-preview',
  temperature: number = 0.7,
  stream: boolean = false
): Promise<Response | LLMResponse> {
  const circuitBreaker = circuitBreakerRegistry.getBreaker('gemini', CIRCUIT_BREAKER_OPTIONS.llm);

  const makeRequest = async (): Promise<Response | LLMResponse> => {
    // Convert OpenAI message format to Gemini format
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const geminiContents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

    const endpoint = stream ? 'streamGenerateContent' : 'generateContent';
    // Use alt=sse for streaming to get Server-Sent Events format (easier to parse)
    const sseParam = stream ? '&alt=sse' : '';
    const url = `${GEMINI_API_URL}/${model}:${endpoint}?key=${process.env.GEMINI_API_KEY}${sseParam}`;

    const requestBody: Record<string, unknown> = {
      contents: geminiContents,
      generationConfig: {
        temperature,
        maxOutputTokens: 8192,
      },
    };

    // Add system instruction if present
    if (systemMessage) {
      requestBody.systemInstruction = {
        parts: [{ text: systemMessage }]
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Gemini API error: ${error.error?.message || 'Unknown error'}`);
    }

    if (stream) {
      return response;
    } else {
      const data = await response.json();
      // Gemini uses usageMetadata with promptTokenCount and candidatesTokenCount
      const usageMetadata = data.usageMetadata;
      return {
        content: data.candidates[0]?.content?.parts[0]?.text || '',
        usage: usageMetadata ? {
          prompt_tokens: usageMetadata.promptTokenCount || 0,
          completion_tokens: usageMetadata.candidatesTokenCount || 0,
          total_tokens: usageMetadata.totalTokenCount || 0,
        } : undefined,
      };
    }
  };

  return resilientCall(makeRequest, {
    name: 'gemini',
    timeoutMs: stream ? PROVIDER_TIMEOUTS.llmStreaming : PROVIDER_TIMEOUTS.llm,
    circuitBreaker,
    ...PROVIDER_RETRY_OPTIONS.llm,
  });
}

// Vercel AI Gateway request (OpenAI-compatible, unified API for 100+ models)
// Default model: alibaba/qwen3-max (Qwen 3 235B)
export async function callVercelGateway(
  messages: ChatMessage[],
  model: string = 'alibaba/qwen3-max',
  temperature: number = 0.7,
  stream: boolean = false
): Promise<Response | LLMResponse> {
  const circuitBreaker = circuitBreakerRegistry.getBreaker('vercel-gateway', CIRCUIT_BREAKER_OPTIONS.llm);

  const makeRequest = async (): Promise<Response | LLMResponse> => {
    const requestBody: Record<string, unknown> = {
      model,
      messages,
      temperature,
      stream,
    };

    // Request usage data in streaming response
    if (stream) {
      requestBody.stream_options = { include_usage: true };
    }

    const response = await fetch(VERCEL_GATEWAY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.VERCEL_AI_GATEWAY_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Vercel Gateway API error: ${error.error?.message || 'Unknown error'}`);
    }

    if (stream) {
      return response;
    } else {
      const data = await response.json();
      return {
        content: data.choices[0].message.content,
        usage: data.usage ? {
          prompt_tokens: data.usage.prompt_tokens || 0,
          completion_tokens: data.usage.completion_tokens || 0,
          total_tokens: data.usage.total_tokens || 0,
        } : undefined,
      };
    }
  };

  return resilientCall(makeRequest, {
    name: 'vercel-gateway',
    timeoutMs: stream ? PROVIDER_TIMEOUTS.llmStreaming : PROVIDER_TIMEOUTS.llm,
    circuitBreaker,
    ...PROVIDER_RETRY_OPTIONS.llm,
  });
}

// Stream chunk type - yields content or final usage
export interface StreamChunk {
  type: 'content' | 'usage';
  content?: string;
  usage?: TokenUsage;
}

// Helper function to parse stream response from Claude (Anthropic format)
export async function* streamClaudeResponse(response: Response): AsyncGenerator<StreamChunk> {
  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let finalUsage: TokenUsage | undefined;

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
            // Yield final usage if captured
            if (finalUsage) {
              yield { type: 'usage', usage: finalUsage };
            }
            return;
          }
          try {
            const parsed = JSON.parse(data);
            // Anthropic uses delta.text for streaming
            if (parsed.type === 'content_block_delta') {
              const content = parsed.delta?.text || '';
              if (content) {
                yield { type: 'content', content };
              }
            }
            // Capture usage from message_delta event (end of stream)
            if (parsed.type === 'message_delta' && parsed.usage) {
              finalUsage = {
                prompt_tokens: parsed.usage.input_tokens || 0,
                completion_tokens: parsed.usage.output_tokens || 0,
                total_tokens: (parsed.usage.input_tokens || 0) + (parsed.usage.output_tokens || 0),
              };
            }
          } catch {
            // Ignore parse errors for non-JSON lines
          }
        }
      }
    }
    // Yield final usage if captured (stream ended without [DONE])
    if (finalUsage) {
      yield { type: 'usage', usage: finalUsage };
    }
  } catch (error) {
    console.error('Error reading Claude stream:', error);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

// Helper function to parse stream response from Gemini (SSE format with alt=sse)
export async function* streamGeminiResponse(response: Response): AsyncGenerator<StreamChunk> {
  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let finalUsage: TokenUsage | undefined;

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
        // SSE format: "data: {json}"
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data.trim() === '[DONE]') {
            // Yield final usage if captured
            if (finalUsage) {
              yield { type: 'usage', usage: finalUsage };
            }
            return;
          }
          try {
            const parsed = JSON.parse(data);

            // Capture usage metadata (appears in chunks, last one has final counts)
            if (parsed.usageMetadata) {
              finalUsage = {
                prompt_tokens: parsed.usageMetadata.promptTokenCount || 0,
                completion_tokens: parsed.usageMetadata.candidatesTokenCount || 0,
                total_tokens: parsed.usageMetadata.totalTokenCount || 0,
              };
            }

            // Check for finish reason and log if response was truncated
            const finishReason = parsed.candidates?.[0]?.finishReason;
            if (finishReason && finishReason !== 'STOP') {
              console.warn(`[Gemini] Stream ended with finishReason: ${finishReason}`);
              if (finishReason === 'MAX_TOKENS') {
                console.warn('[Gemini] Response was truncated due to max token limit');
              } else if (finishReason === 'SAFETY') {
                console.warn('[Gemini] Response was stopped due to safety filters');
              }
            }

            // Gemini uses candidates[0].content.parts[0].text
            const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (content) {
              yield { type: 'content', content };
            }
          } catch {
            // Ignore parse errors for non-JSON lines
          }
        }
      }
    }
    // Yield final usage if captured (stream ended without [DONE])
    if (finalUsage) {
      yield { type: 'usage', usage: finalUsage };
    }
  } catch (error) {
    console.error('Error reading Gemini stream:', error);
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

// Primary providers to try before falling back to Vercel Gateway (excludes vercel-gateway itself)
const PRIMARY_PROVIDERS: LLMProvider[] = ['deepseek', 'openai', 'grok', 'claude', 'gemini'];

/**
 * Unified LLM call with automatic fallback chain.
 * Tries the specified provider first, then cycles through other available providers,
 * and uses Vercel AI Gateway as the last resort fallback.
 *
 * Fallback order:
 * 1. Specified provider (if available)
 * 2. Other primary providers in priority order (deepseek, openai, grok, claude, gemini)
 * 3. Vercel AI Gateway (last resort)
 *
 * @returns Object containing the response and the provider that was actually used
 */
export async function callLLMWithFallback(
  messages: ChatMessage[],
  temperature: number = 0.7,
  stream: boolean = false,
  provider?: LLMProvider
): Promise<{ response: Response | LLMResponse; usedProvider: LLMProvider }> {
  const errors: { provider: LLMProvider; error: Error }[] = [];

  // Build ordered list of providers to try
  const providersToTry: LLMProvider[] = [];

  // If a specific provider was requested, try it first
  if (provider && provider !== 'vercel-gateway' && isProviderAvailable(provider)) {
    providersToTry.push(provider);
  }

  // Add other available primary providers
  for (const p of PRIMARY_PROVIDERS) {
    if (!providersToTry.includes(p) && isProviderAvailable(p)) {
      providersToTry.push(p);
    }
  }

  // Try each primary provider
  for (const currentProvider of providersToTry) {
    try {
      console.log(`[Fallback] Trying provider: ${currentProvider}`);
      const response = await callLLMForProvider(messages, temperature, stream, currentProvider);
      console.log(`[Fallback] Success with provider: ${currentProvider}`);
      return { response, usedProvider: currentProvider };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.warn(`[Fallback] Provider ${currentProvider} failed:`, err.message);
      errors.push({ provider: currentProvider, error: err });
    }
  }

  // Last resort: try Vercel AI Gateway
  if (isProviderAvailable('vercel-gateway')) {
    try {
      console.log('[Fallback] All primary providers failed. Trying Vercel AI Gateway...');
      const response = await callLLMForProvider(messages, temperature, stream, 'vercel-gateway');
      console.log('[Fallback] Success with Vercel AI Gateway');
      return { response, usedProvider: 'vercel-gateway' };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[Fallback] Vercel AI Gateway failed:', err.message);
      errors.push({ provider: 'vercel-gateway', error: err });
    }
  }

  // All providers failed - throw a comprehensive error
  const errorSummary = errors
    .map(({ provider, error }) => `${provider}: ${error.message}`)
    .join('; ');
  throw new Error(`All LLM providers failed. Errors: ${errorSummary}`);
}

// Internal helper to call the appropriate provider with specific model
function callLLMForProviderWithModel(
  messages: ChatMessage[],
  temperature: number,
  stream: boolean,
  provider: LLMProvider,
  model: string
) {
  switch (provider) {
    case 'deepseek':
      console.log(`Using DeepSeek API with model: ${model}`);
      return callDeepSeek(messages, model, temperature, stream);
    case 'openai':
      console.log(`Using OpenAI API with model: ${model}`);
      return callOpenAI(messages, model, temperature, stream);
    case 'grok':
      console.log(`Using Grok API with model: ${model}`);
      return callGrok(messages, model, temperature, stream);
    case 'claude':
      console.log(`Using Claude API with model: ${model}`);
      return callClaude(messages, model, temperature, stream);
    case 'gemini':
      console.log(`Using Gemini API with model: ${model}`);
      return callGemini(messages, model, temperature, stream);
    case 'vercel-gateway':
      console.log(`Using Vercel AI Gateway with model: ${model}`);
      return callVercelGateway(messages, model, temperature, stream);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// Internal helper to call the appropriate provider (uses default model for provider)
function callLLMForProvider(
  messages: ChatMessage[],
  temperature: number,
  stream: boolean,
  provider: LLMProvider
) {
  // Map provider to default model ID
  const providerToDefaultModelId: Record<LLMProvider, ModelId> = {
    'gemini': 'gemini',
    'openai': 'openai',
    'deepseek': 'deepseek',
    'grok': 'grok',
    'claude': 'claude',
    'vercel-gateway': 'vercel-gateway',
  };

  const modelId = providerToDefaultModelId[provider];
  const config = MODEL_CONFIG[modelId];
  return callLLMForProviderWithModel(messages, temperature, stream, provider, config.model);
}

// Call LLM with a specific model ID
export function callLLMWithModelId(
  messages: ChatMessage[],
  temperature: number = 0.7,
  stream: boolean = false,
  modelId: ModelId
) {
  const config = MODEL_CONFIG[modelId];
  if (!config) {
    throw new Error(`Unknown model ID: ${modelId}`);
  }

  // Check if the provider is available
  if (!isProviderAvailable(config.provider)) {
    console.warn(`Provider ${config.provider} for model ${modelId} not available, falling back to auto-detection`);
    const fallbackProvider = getLLMProvider();
    console.log(`Using fallback provider: ${fallbackProvider}`);
    return callLLMForProvider(messages, temperature, stream, fallbackProvider);
  }

  return callLLMForProviderWithModel(messages, temperature, stream, config.provider, config.model);
}

// Get the appropriate stream parser for a provider
export function getStreamParser(provider: LLMProvider) {
  if (provider === 'claude') {
    return streamClaudeResponse;
  }
  if (provider === 'gemini') {
    return streamGeminiResponse;
  }
  // OpenAI, DeepSeek, Grok, and Vercel Gateway all use OpenAI-compatible streaming
  return streamOpenAIResponse;
}

// Tavily API request
// Supports optional userTier for per-tier circuit breaker isolation
export async function callTavily(
  query: string,
  includeImages: boolean = true,
  searchDepth: 'basic' | 'advanced' = 'basic',
  maxResults: number = 10,
  userTier?: UserTier
) {
  // Use per-tier circuit breaker if tier is provided, otherwise global
  const circuitBreaker = userTier
    ? circuitBreakerRegistry.getTieredBreaker('tavily', userTier, CIRCUIT_BREAKER_OPTIONS.search)
    : circuitBreakerRegistry.getBreaker('tavily', CIRCUIT_BREAKER_OPTIONS.search);

  const makeRequest = async () => {
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
  };

  return resilientCall(makeRequest, {
    name: 'tavily',
    timeoutMs: PROVIDER_TIMEOUTS.search,
    circuitBreaker,
    ...PROVIDER_RETRY_OPTIONS.search,
  });
}

// Google Custom Search API types
interface GoogleSearchResponse {
  kind: string;
  items?: {
    title: string;
    link: string;
    snippet: string;
    displayLink: string;
    pagemap?: {
      metatags?: Array<{
        author?: string;
        'article:published_time'?: string;
        'og:updated_time'?: string;
        date?: string;
      }>;
      cse_image?: Array<{
        src: string;
      }>;
    };
  }[];
  searchInformation?: {
    totalResults: string;
    searchTime: number;
  };
}

/**
 * Check if Google Custom Search is available
 */
export function isGoogleSearchAvailable(): boolean {
  return !!(process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_ENGINE_ID);
}

/**
 * Google Custom Search API request
 * Returns results in TavilySearchResult format for compatibility
 */
export async function callGoogleSearch(
  query: string,
  maxResults: number = 10,
  extractContent: boolean = true
): Promise<TavilySearchResult> {
  const circuitBreaker = circuitBreakerRegistry.getBreaker('google-search', CIRCUIT_BREAKER_OPTIONS.search);

  const makeRequest = async () => {
    console.log('Calling Google Custom Search API with:', { query, maxResults, extractContent });

    if (!process.env.GOOGLE_SEARCH_API_KEY) {
      throw new Error('GOOGLE_SEARCH_API_KEY is not defined in environment variables');
    }
    if (!process.env.GOOGLE_SEARCH_ENGINE_ID) {
      throw new Error('GOOGLE_SEARCH_ENGINE_ID is not defined in environment variables');
    }

    // Google API returns max 10 results per request
    const numResults = Math.min(maxResults, 10);

    const params = new URLSearchParams({
      key: process.env.GOOGLE_SEARCH_API_KEY,
      cx: process.env.GOOGLE_SEARCH_ENGINE_ID,
      q: query,
      num: numResults.toString(),
    });

    const response = await fetch(`${GOOGLE_SEARCH_API_URL}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      let errorMessage = 'Unknown error';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorData.message || 'Unknown error';
      } catch {
        errorMessage = `Error parsing error response: ${response.statusText}`;
      }
      console.error('Google Search API error details:', {
        status: response.status,
        statusText: response.statusText,
        errorMessage
      });
      throw new Error(`Google Search API error: ${errorMessage}`);
    }

    const data: GoogleSearchResponse = await response.json();

    // Get URLs for content extraction
    const urls = (data.items || []).map(item => item.link);

    // Extract full content with Jina Reader if enabled
    let extractedContent = new Map<string, string>();
    if (extractContent && urls.length > 0) {
      console.log(`[Google+Jina] Extracting content from ${urls.length} URLs...`);
      const startTime = Date.now();
      extractedContent = await extractContentsWithJina(urls, 10000, 5);
      console.log(`[Google+Jina] Extracted ${extractedContent.size}/${urls.length} URLs in ${Date.now() - startTime}ms`);
    }

    // Convert Google response to TavilySearchResult format
    const results: TavilySearchResult = {
      query,
      results: (data.items || []).map(item => {
        // Try to extract date from pagemap metatags
        let publishedDate: string | undefined;
        const metatags = item.pagemap?.metatags?.[0];
        if (metatags) {
          publishedDate = metatags['article:published_time'] ||
                          metatags['og:updated_time'] ||
                          metatags.date;
        }

        // Try to extract author from metatags
        const author = metatags?.author;

        // Use Jina extracted content if available, otherwise fall back to snippet
        const jinaContent = extractedContent.get(item.link);
        const content = jinaContent || item.snippet;

        return {
          title: item.title,
          url: item.link,
          content, // Full extracted content or snippet fallback
          source: item.displayLink,
          published_date: publishedDate,
          author,
        };
      }),
      // Google requires separate image search, skip for fallback to save quota
      images: [],
      search_context: {
        retrieved_from: 'google',
        search_type: 'web',
        content_extraction: extractContent ? 'jina' : 'snippet',
      },
    };

    return results;
  };

  return resilientCall(makeRequest, {
    name: 'google-search',
    timeoutMs: extractContent ? 30000 : PROVIDER_TIMEOUTS.search, // Longer timeout when extracting
    circuitBreaker,
    ...PROVIDER_RETRY_OPTIONS.search,
  });
}

/**
 * Search provider type for tracking which provider was used
 */
export type SearchProvider = 'tavily' | 'google';

/**
 * Result type for unified search function
 */
export interface SearchWithFallbackResult {
  results: TavilySearchResult;
  provider: SearchProvider;
}

/**
 * Unified search function with automatic fallback
 * Tries Tavily first, falls back to Google Custom Search on failure
 *
 * @param userTier - Optional user tier for per-tier circuit breaker isolation.
 *                   When provided, circuit breaker state is isolated per tier
 *                   (e.g., free tier failures don't affect pro tier).
 */
export async function callSearchWithFallback(
  query: string,
  includeImages: boolean = true,
  searchDepth: 'basic' | 'advanced' = 'basic',
  maxResults: number = 10,
  userTier?: UserTier
): Promise<SearchWithFallbackResult> {
  // Check if Tavily circuit breaker is open (use tiered if tier provided)
  const tavilyBreaker = userTier
    ? circuitBreakerRegistry.getTieredBreaker('tavily', userTier)
    : circuitBreakerRegistry.getBreaker('tavily');
  const tavilyCircuitOpen = !tavilyBreaker.isAllowed();

  // If Tavily circuit is open and Google is available, skip directly to Google
  if (tavilyCircuitOpen && isGoogleSearchAvailable()) {
    console.log(`[Search] Tavily circuit breaker open${userTier ? ` for tier ${userTier}` : ''}, using Google Search directly`);
    const results = await callGoogleSearch(query, maxResults);
    return { results, provider: 'google' };
  }

  // Try Tavily first
  try {
    const results = await callTavily(query, includeImages, searchDepth, maxResults, userTier);
    return { results, provider: 'tavily' };
  } catch (tavilyError) {
    console.error('[Search] Tavily failed:', tavilyError);

    // Check if Google fallback is available
    if (!isGoogleSearchAvailable()) {
      console.error('[Search] Google Search not configured, cannot fallback');
      throw tavilyError; // Re-throw original error
    }

    // Try Google as fallback
    console.log('[Search] Falling back to Google Custom Search');
    try {
      const results = await callGoogleSearch(query, maxResults);
      return { results, provider: 'google' };
    } catch (googleError) {
      console.error('[Search] Google Search also failed:', googleError);
      // Throw the original Tavily error as it's the primary provider
      throw tavilyError;
    }
  }
}

// Helper function to parse stream response from OpenAI
export async function* streamOpenAIResponse(response: Response): AsyncGenerator<StreamChunk> {
  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let finalUsage: TokenUsage | undefined;

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
            // Yield final usage if captured
            if (finalUsage) {
              yield { type: 'usage', usage: finalUsage };
            }
            return;
          }
          try {
            const parsed = JSON.parse(data);

            // Capture usage from final chunk (OpenAI includes usage in last chunk with stream_options)
            // Note: Requires stream_options: { include_usage: true } in request
            if (parsed.usage) {
              finalUsage = {
                prompt_tokens: parsed.usage.prompt_tokens || 0,
                completion_tokens: parsed.usage.completion_tokens || 0,
                total_tokens: parsed.usage.total_tokens || 0,
              };
            }

            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              yield { type: 'content', content };
            }
          } catch (e) {
            console.error('Error parsing JSON from stream:', e);
          }
        }
      }
    }
    // Yield final usage if captured (stream ended without [DONE])
    if (finalUsage) {
      yield { type: 'usage', usage: finalUsage };
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

// Language type for response language
export type ResponseLanguage = 'English' | 'Chinese' | 'Japanese' | 'Korean' | 'Spanish' | 'French' | 'German' | 'Other';

/**
 * Detect the primary language of a text string.
 * Used to ensure LLM responses match the user's query language.
 */
export function detectLanguage(text: string): ResponseLanguage {
  if (!text || text.trim().length === 0) {
    return 'English'; // Default to English
  }

  // Count character types
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const japaneseChars = (text.match(/[\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
  const koreanChars = (text.match(/[\uac00-\ud7af\u1100-\u11ff]/g) || []).length;

  const totalChars = text.replace(/\s/g, '').length;

  if (totalChars === 0) {
    return 'English';
  }

  // Calculate ratios
  const chineseRatio = chineseChars / totalChars;
  const japaneseRatio = japaneseChars / totalChars;
  const koreanRatio = koreanChars / totalChars;

  // Threshold for detection (if more than 20% of characters are from a language)
  const threshold = 0.2;

  if (chineseRatio > threshold) {
    return 'Chinese';
  }
  if (japaneseRatio > threshold) {
    return 'Japanese';
  }
  if (koreanRatio > threshold) {
    return 'Korean';
  }

  // For European languages, check for common patterns
  const lowerText = text.toLowerCase();

  // French detection - check first because French accents are very distinct (grave, circumflex, cedilla)
  const hasFrenchAccents = /[àâçèêëîïôùûœæ]/.test(lowerText);
  const frenchCommonWords = ['le', 'la', 'les', 'des', 'du', 'au', 'aux', 'est', 'sont', 'une', 'qui', 'pour', 'avec', 'dans', 'sur', 'par', 'mais', 'donc', 'comme', 'tout', 'cette', 'ces', 'quel', 'quelle', 'vous', 'nous', 'être', 'avoir', 'faire', 'peut', 'plus', 'très'];
  const frenchWordCount = frenchCommonWords.filter(word => new RegExp(`\\b${word}\\b`, 'i').test(text)).length;

  if (hasFrenchAccents || frenchWordCount >= 3) {
    return 'French';
  }

  // German detection - check before Spanish because umlauts are distinct
  const hasGermanChars = /[äöüß]/.test(lowerText);
  const germanCommonWords = ['der', 'die', 'das', 'und', 'ist', 'ein', 'eine', 'den', 'dem', 'des', 'von', 'mit', 'auch', 'auf', 'für', 'nicht', 'sich', 'bei', 'nach', 'werden', 'haben', 'wird', 'kann', 'sind', 'wurde', 'sein', 'oder', 'wenn', 'noch', 'über', 'diese', 'dieser'];
  const germanWordCount = germanCommonWords.filter(word => new RegExp(`\\b${word}\\b`, 'i').test(text)).length;

  if (hasGermanChars || germanWordCount >= 2) {
    return 'German';
  }

  // Spanish detection - check accents (áéíóúñ¿¡) and word patterns
  // Note: "la", "el" overlap with other languages, so require accents or more words
  const hasSpanishAccents = /[áéíóúñ¿¡]/.test(lowerText);
  const spanishCommonWords = ['el', 'la', 'los', 'las', 'del', 'al', 'un', 'una', 'que', 'para', 'por', 'con', 'como', 'pero', 'más', 'este', 'esta', 'ese', 'esa', 'qué', 'cómo', 'cuándo', 'dónde', 'sobre', 'entre', 'desde', 'hasta', 'también', 'porque', 'cuando', 'donde', 'mejor', 'nuevo', 'nueva', 'fecha', 'precio', 'tiempo'];
  const spanishWordCount = spanishCommonWords.filter(word => new RegExp(`\\b${word}\\b`, 'i').test(text)).length;
  const hasSpanishSuffixes = /\b\w+(ción|miento|mente|idad|ado|ada|ero|era|ando|iendo|amiento)\b/i.test(text);

  // Spanish if: has accents, OR 2+ common words, OR common words + Spanish suffixes
  if (hasSpanishAccents || spanishWordCount >= 2 || (spanishWordCount >= 1 && hasSpanishSuffixes)) {
    return 'Spanish';
  }

  // Default to English for Latin-based text without clear markers
  return 'English';
}

// ============================================
// CIRCUIT BREAKER MONITORING
// ============================================

/**
 * Get the health status of all circuit breakers.
 * Useful for monitoring and debugging.
 */
export function getCircuitBreakerStats() {
  return circuitBreakerRegistry.getAllStats();
}

/**
 * Reset all circuit breakers.
 * Useful for recovery after maintenance.
 */
export function resetAllCircuitBreakers() {
  circuitBreakerRegistry.resetAll();
}

/**
 * Reset a specific circuit breaker by name.
 */
export function resetCircuitBreaker(name: string) {
  circuitBreakerRegistry.resetBreaker(name);
}
