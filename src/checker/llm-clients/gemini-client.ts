/**
 * Google Gemini LLM client — uses Google GenAI SDK with grounding.
 */

import type { LLMResponse } from '../../crawler/page-data.js';
import type { LLMClient } from './base-client.js';
import { createErrorResponse } from './base-client.js';

export class GeminiClient implements LLMClient {
  name = 'gemini' as const;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.GOOGLE_API_KEY || '';
  }

  isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  async query(searchQuery: string): Promise<LLMResponse> {
    const start = Date.now();

    try {
      const { GoogleGenAI } = await import('@google/genai');
      const client = new GoogleGenAI({ apiKey: this.apiKey });

      const response = await client.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: searchQuery,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const latencyMs = Date.now() - start;
      const responseText = response.text || '';

      // Extract grounding sources from response metadata
      const citations: string[] = [];
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      if (groundingMetadata?.groundingChunks) {
        for (const chunk of groundingMetadata.groundingChunks) {
          if (chunk.web?.uri) {
            citations.push(chunk.web.uri);
          }
        }
      }

      return {
        engine: 'gemini',
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
      return createErrorResponse('gemini', searchQuery, (err as Error).message, Date.now() - start);
    }
  }
}
