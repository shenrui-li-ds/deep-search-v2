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
} from './resilience';

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
) {
  const circuitBreaker = circuitBreakerRegistry.getBreaker('deepseek', CIRCUIT_BREAKER_OPTIONS.llm);

  const makeRequest = async () => {
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
) {
  const circuitBreaker = circuitBreakerRegistry.getBreaker('openai', CIRCUIT_BREAKER_OPTIONS.llm);

  const makeRequest = async () => {
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
      return data.choices[0].message.content;
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
) {
  const circuitBreaker = circuitBreakerRegistry.getBreaker('grok', CIRCUIT_BREAKER_OPTIONS.llm);

  const makeRequest = async () => {
    const response = await fetch(GROK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROK_API_KEY}`,
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
      throw new Error(`Grok API error: ${error.error?.message || 'Unknown error'}`);
    }

    if (stream) {
      return response;
    } else {
      const data = await response.json();
      return data.choices[0].message.content;
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
) {
  const circuitBreaker = circuitBreakerRegistry.getBreaker('claude', CIRCUIT_BREAKER_OPTIONS.llm);

  const makeRequest = async () => {
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
) {
  const circuitBreaker = circuitBreakerRegistry.getBreaker('gemini', CIRCUIT_BREAKER_OPTIONS.llm);

  const makeRequest = async () => {
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
      return data.candidates[0]?.content?.parts[0]?.text || '';
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
) {
  const circuitBreaker = circuitBreakerRegistry.getBreaker('vercel-gateway', CIRCUIT_BREAKER_OPTIONS.llm);

  const makeRequest = async () => {
    const response = await fetch(VERCEL_GATEWAY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.VERCEL_AI_GATEWAY_KEY}`,
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
      throw new Error(`Vercel Gateway API error: ${error.error?.message || 'Unknown error'}`);
    }

    if (stream) {
      return response;
    } else {
      const data = await response.json();
      return data.choices[0].message.content;
    }
  };

  return resilientCall(makeRequest, {
    name: 'vercel-gateway',
    timeoutMs: stream ? PROVIDER_TIMEOUTS.llmStreaming : PROVIDER_TIMEOUTS.llm,
    circuitBreaker,
    ...PROVIDER_RETRY_OPTIONS.llm,
  });
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

// Helper function to parse stream response from Gemini (SSE format with alt=sse)
export async function* streamGeminiResponse(response: Response) {
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
        // SSE format: "data: {json}"
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data.trim() === '[DONE]') {
            return;
          }
          try {
            const parsed = JSON.parse(data);

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
              yield content;
            }
          } catch {
            // Ignore parse errors for non-JSON lines
          }
        }
      }
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
): Promise<{ response: Response | string; usedProvider: LLMProvider }> {
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
export async function callTavily(
  query: string,
  includeImages: boolean = true,
  searchDepth: 'basic' | 'advanced' = 'basic',
  maxResults: number = 10
) {
  const circuitBreaker = circuitBreakerRegistry.getBreaker('tavily', CIRCUIT_BREAKER_OPTIONS.search);

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
  // Spanish: common accented characters and patterns
  if (/[áéíóúüñ¿¡]/i.test(text) && /\b(el|la|los|las|de|en|que|es|un|una)\b/i.test(text)) {
    return 'Spanish';
  }

  // French: common accented characters and patterns
  if (/[àâçéèêëîïôùûü]/i.test(text) && /\b(le|la|les|de|des|en|est|un|une|que)\b/i.test(text)) {
    return 'French';
  }

  // German: common patterns and umlauts
  if (/[äöüß]/i.test(text) && /\b(der|die|das|und|ist|ein|eine|zu|den)\b/i.test(text)) {
    return 'German';
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
