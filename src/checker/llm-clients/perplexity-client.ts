/**
 * Perplexity LLM client — OpenAI-compatible REST API with native citations.
 */

import type { LLMResponse } from '../../crawler/page-data.js';
import type { LLMClient } from './base-client.js';
import { createErrorResponse } from './base-client.js';

export class PerplexityClient implements LLMClient {
  name = 'perplexity' as const;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.PERPLEXITY_API_KEY || '';
  }

  isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  async query(searchQuery: string): Promise<LLMResponse> {
    const start = Date.now();

    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [{ role: 'user', content: searchQuery }],
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Perplexity API error ${response.status}: ${text}`);
      }

      const data = await response.json() as {
        choices: { message: { content: string } }[];
        citations?: string[];
      };

      const latencyMs = Date.now() - start;
      const responseText = data.choices?.[0]?.message?.content || '';
      const citations = data.citations || [];

      return {
        engine: 'perplexity',
        query: searchQuery,
        response: responseText,
        citations,
        mentioned: false,
        mentionType: 'absent',
        mentionContext: null,
        latencyMs,
        error: null,
      };
    } catch (err) {
      return createErrorResponse('perplexity', searchQuery, (err as Error).message, Date.now() - start);
    }
  }
}
