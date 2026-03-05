/**
 * Non-scored audit checks (category weight: 0x — informational only)
 */

import type { ExistingGeoFiles } from '../../crawler/page-data.js';
import type { AuditItem } from './types.js';

export function auditNonScored(existingGeoFiles: ExistingGeoFiles): AuditItem[] {
  return [
    makeFileCheck('security.txt', existingGeoFiles.securityTxt,
      'security.txt found at /.well-known/security.txt',
      'No security.txt found',
      'RFC 9116 security.txt is present',
      'Add /.well-known/security.txt per RFC 9116 with security contact info',
    ),
    makeFileCheck('tdmrep.json', existingGeoFiles.tdmrepJson,
      'TDM reservation found',
      'No TDM reservation found',
      'W3C TDM reservation is present',
      'Add /.well-known/tdmrep.json to define text/data mining rights',
    ),
    makeFileCheck('manifest.json', existingGeoFiles.manifestJson,
      'Web manifest found',
      'No web manifest found',
      'Web manifest is present',
      'Add manifest.json for site identity metadata',
    ),
    makeFileCheck('humans.txt', existingGeoFiles.humansTxt,
      'humans.txt found',
      'No humans.txt found',
      'humans.txt is present',
      'Add /humans.txt for team and technology info',
    ),
  ];
}

function makeFileCheck(
  name: string,
  content: string | null,
  foundDetails: string,
  missingDetails: string,
  foundRec: string,
  missingRec: string,
): AuditItem {
  const status = content ? 'pass' as const : 'fail' as const;
  return {
    name,
    category: 'non_scored',
    score: content ? 100 : 0,
    maxScore: 100,
    status,
    severity: 'info',
    details: content ? foundDetails : missingDetails,
    recommendation: content ? foundRec : missingRec,
  };
}
