/**
 * OpenAI LLM client — uses Responses API with web_search tool.
 */

import type { LLMResponse } from '../../crawler/page-data.js';
import type { LLMClient } from './base-client.js';
import { createErrorResponse } from './base-client.js';

export class OpenAIClient implements LLMClient {
  name = 'openai' as const;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
  }

  isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  async query(searchQuery: string): Promise<LLMResponse> {
    const start = Date.now();

    try {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: this.apiKey });

      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        tools: [{ type: 'web_search' as never }],
        input: searchQuery,
      });

      const latencyMs = Date.now() - start;

      // Extract text and citations from output
      let responseText = '';
      const citations: string[] = [];

      for (const item of response.output) {
        if (item.type === 'message') {
          for (const block of item.content) {
            if (block.type === 'output_text') {
              responseText += block.text;
              // Extract citations from annotations
              if (block.annotations) {
                for (const annotation of block.annotations) {
                  if (annotation.type === 'url_citation' && annotation.url) {
                    citations.push(annotation.url);
                  }
                }
              }
            }
          }
        }
      }

      return {
        engine: 'openai',
        query: searchQuery,
        response: responseText,
        citations: [...new Set(citations)],
        mentioned: false,
        mentionType: 'absent',
        mentionContext: null,
        latencyMs,
        error: null,
      };
    } catch (err) {
      return createErrorResponse('openai', searchQuery, (err as Error).message, Date.now() - start);
    }
  }
}
