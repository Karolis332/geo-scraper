/**
 * Base interface for LLM clients used in visibility checking.
 */

import type { LLMResponse } from '../../crawler/page-data.js';

export interface LLMClient {
  name: 'openai' | 'perplexity' | 'gemini' | 'claude';
  isAvailable(): boolean;
  query(searchQuery: string): Promise<LLMResponse>;
}

export function createErrorResponse(
  engine: LLMResponse['engine'],
  query: string,
  error: string,
  latencyMs: number,
): LLMResponse {
  return {
    engine,
    query,
    response: '',
    citations: [],
    mentioned: false,
    mentionType: 'absent',
    mentionContext: null,
    latencyMs,
    error,
  };
}
