/**
 * Anthropic Claude LLM client — uses web_search tool.
 */

import type { LLMResponse } from '../../crawler/page-data.js';
import type { LLMClient } from './base-client.js';
import { createErrorResponse } from './base-client.js';

export class ClaudeClient implements LLMClient {
  name = 'claude' as const;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';
  }

  isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  async query(searchQuery: string): Promise<LLMResponse> {
    const start = Date.now();

    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: this.apiKey });

      const response = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        tools: [
          {
            type: 'web_search' as never,
            name: 'web_search',
            max_uses: 3,
          } as never,
        ],
        messages: [{ role: 'user', content: searchQuery }],
      });

      const latencyMs = Date.now() - start;

      // Extract text and citations from content blocks
      let responseText = '';
      const citations: string[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          responseText += block.text;
        }
        if (block.type === 'web_search_tool_result' && 'content' in block) {
          const content = block.content as Array<{ type: string; url?: string }>;
          if (Array.isArray(content)) {
            for (const item of content) {
              if (item.type === 'web_search_result' && item.url) {
                citations.push(item.url);
              }
            }
          }
        }
      }

      return {
        engine: 'claude',
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
      return createErrorResponse('claude', searchQuery, (err as Error).message, Date.now() - start);
    }
  }
}
