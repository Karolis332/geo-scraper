/**
 * Generate tdmrep.json — W3C TDM Reservation Protocol.
 * Location: /.well-known/tdmrep.json
 * Spec: https://www.w3.org/2022/tdmrep/
 */

import type { SiteCrawlResult, GeneratorOptions } from '../crawler/page-data.js';

export function generateTdmrepJson(
  _crawlResult: SiteCrawlResult,
  options: GeneratorOptions,
): string {
  const allowTraining = !options.denyTraining;

  // TDM Reservation Protocol policy
  const tdmrep = {
    // Version of the TDM policy
    version: 1,
    // Default policy for the entire site
    policies: [
      {
        // Apply to all paths
        location: '/',
        // TDM actors: can they mine this content?
        assurance: allowTraining ? 'https://www.w3.org/2022/tdmrep/assurance#non-exclusive'
          : 'https://www.w3.org/2022/tdmrep/assurance#reserved',
        // Type of content covered
        type: [
          'text/html',
          'application/json',
          'text/plain',
          'text/markdown',
          'application/xml',
        ],
      },
    ],
  };

  return JSON.stringify(tdmrep, null, 2) + '\n';
}
