/**
 * LLM Provider Pricing Configuration
 * Prices are per 1 million tokens in USD
 *
 * Last updated: 2025-01-07
 */

export interface ModelPricing {
  input: number;        // Price per 1M input tokens
  cachedInput: number;  // Price per 1M cached input tokens
  output: number;       // Price per 1M output tokens
  model: string;        // Actual model identifier
  displayName: string;  // Human-readable name
}

export interface ProviderPricing {
  provider: string;
  defaultModel: ModelPricing;
  models: Record<string, ModelPricing>;
  updatedAt: string;
}

// Model-level pricing (actual model names)
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI
  'gpt-5.2': {
    input: 1.75,
    cachedInput: 0.175,
    output: 14.00,
    model: 'gpt-5.2-2025-12-11',
    displayName: 'GPT-5.2',
  },
  'gpt-5-mini': {
    input: 0.25,
    cachedInput: 0.025,
    output: 2.00,
    model: 'gpt-5-mini-2025-08-07',
    displayName: 'GPT-5 mini',
  },

  // Google Gemini
  'gemini-3-pro-preview': {
    input: 2.00,
    cachedInput: 0.20,
    output: 12.00,
    model: 'gemini-3-pro-preview',
    displayName: 'Gemini 3 Pro',
  },
  'gemini-3-flash-preview': {
    input: 0.50,
    cachedInput: 0.05,
    output: 3.00,
    model: 'gemini-3-flash-preview',
    displayName: 'Gemini 3 Flash',
  },

  // xAI Grok
  'grok-4-1-fast': {
    input: 0.20,
    cachedInput: 0.05,
    output: 0.50,
    model: 'grok-4-1-fast',
    displayName: 'Grok 4.1 Fast',
  },

  // Alibaba Qwen (via Vercel Gateway)
  'qwen3-max': {
    input: 1.20,
    cachedInput: 0.24,
    output: 6.00,
    model: 'alibaba/qwen3-max',
    displayName: 'Qwen 3 Max',
  },

  // DeepSeek
  'deepseek-chat': {
    input: 0.28,
    cachedInput: 0.028,
    output: 0.42,
    model: 'deepseek-chat',
    displayName: 'DeepSeek Chat',
  },

  // Anthropic Claude
  'claude-haiku-4-5': {
    input: 1.00,
    cachedInput: 0.10,
    output: 5.00,
    model: 'claude-haiku-4-5-latest',
    displayName: 'Claude Haiku 4.5',
  },
};

// Provider-level pricing (maps to LLMProvider type)
// Uses the default/primary model for each provider
export const PROVIDER_PRICING: Record<string, ProviderPricing> = {
  openai: {
    provider: 'openai',
    defaultModel: MODEL_PRICING['gpt-5.2'],
    models: {
      'gpt-5.2': MODEL_PRICING['gpt-5.2'],
      'gpt-5-mini': MODEL_PRICING['gpt-5-mini'],
    },
    updatedAt: '2025-01-07',
  },
  gemini: {
    provider: 'gemini',
    defaultModel: MODEL_PRICING['gemini-3-flash-preview'],
    models: {
      'gemini-3-pro-preview': MODEL_PRICING['gemini-3-pro-preview'],
      'gemini-3-flash-preview': MODEL_PRICING['gemini-3-flash-preview'],
    },
    updatedAt: '2025-01-07',
  },
  grok: {
    provider: 'grok',
    defaultModel: MODEL_PRICING['grok-4-1-fast'],
    models: {
      'grok-4-1-fast': MODEL_PRICING['grok-4-1-fast'],
    },
    updatedAt: '2025-01-07',
  },
  'vercel-gateway': {
    provider: 'vercel-gateway',
    defaultModel: MODEL_PRICING['qwen3-max'],
    models: {
      'qwen3-max': MODEL_PRICING['qwen3-max'],
    },
    updatedAt: '2025-01-07',
  },
  deepseek: {
    provider: 'deepseek',
    defaultModel: MODEL_PRICING['deepseek-chat'],
    models: {
      'deepseek-chat': MODEL_PRICING['deepseek-chat'],
    },
    updatedAt: '2025-01-07',
  },
  claude: {
    provider: 'claude',
    defaultModel: MODEL_PRICING['claude-haiku-4-5'],
    models: {
      'claude-haiku-4-5': MODEL_PRICING['claude-haiku-4-5'],
    },
    updatedAt: '2025-01-07',
  },
};

/**
 * Get pricing for a provider (uses default model)
 */
export function getProviderPricing(provider: string): ModelPricing | null {
  const providerConfig = PROVIDER_PRICING[provider];
  return providerConfig?.defaultModel ?? null;
}

/**
 * Get pricing for a specific model
 */
export function getModelPricing(model: string): ModelPricing | null {
  return MODEL_PRICING[model] ?? null;
}

/**
 * Calculate estimated cost for a request
 */
export function calculateCost(
  provider: string,
  promptTokens: number,
  completionTokens: number,
  usedCache: boolean = false
): number {
  const pricing = getProviderPricing(provider);
  if (!pricing) return 0;

  const inputPrice = usedCache ? pricing.cachedInput : pricing.input;
  const inputCost = (promptTokens * inputPrice) / 1_000_000;
  const outputCost = (completionTokens * pricing.output) / 1_000_000;

  return inputCost + outputCost;
}

/**
 * Generate SQL INSERT statements for provider_pricing table
 * Useful for syncing TypeScript config to database
 */
export function generatePricingSQL(): string {
  const statements: string[] = [
    '-- Auto-generated from src/lib/pricing.ts',
    '-- Run this to sync pricing to database',
    '',
    'TRUNCATE TABLE provider_pricing;',
    '',
  ];

  for (const [provider, config] of Object.entries(PROVIDER_PRICING)) {
    const { defaultModel, updatedAt } = config;
    statements.push(
      `INSERT INTO provider_pricing (provider, input_per_1m, cached_input_per_1m, output_per_1m, updated_at)`,
      `VALUES ('${provider}', ${defaultModel.input}, ${defaultModel.cachedInput}, ${defaultModel.output}, '${updatedAt}');`
    );
  }

  return statements.join('\n');
}
