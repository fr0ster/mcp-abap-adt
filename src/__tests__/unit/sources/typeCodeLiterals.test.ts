/**
 * An ADT type code in the server's production source — `src` and every
 * package directory's `src`, tool descriptions included — is typed by the
 * tables of `@mcp-abap-adt/interfaces-adt`, and a code named in a comment or
 * inside a string is a code of the tables (`helpers/typeCodeScan.ts` has the
 * rules). The program is built from `tsconfig.test.json`, which maps every
 * package of this repository to its source.
 *
 * What looks like a code and is not one goes into ALLOWED, with its reason;
 * an entry that matches no finding fails too, so the list cannot rot.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { productionFiles, typeCodeFindings } from './helpers/typeCodeScan';

const ROOT = join(__dirname, '../../../..');
const TSCONFIG = join(ROOT, 'tsconfig.test.json');

/** `src`, and the `src` of every package directory of the repository. */
const SOURCE_DIRS: readonly string[] = [
  join(ROOT, 'src'),
  ...readdirSync(ROOT, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name !== 'node_modules' &&
        existsSync(join(ROOT, entry.name, 'package.json')) &&
        existsSync(join(ROOT, entry.name, 'src')),
    )
    .map((entry) => join(ROOT, entry.name, 'src')),
];

/** `<file>:<literal or word>` → why it is not a type code. */
const ALLOWED: ReadonlyMap<string, string> = new Map([
  [
    'src/handlers/enhancement/readonly/enhancementAvailability.ts:ENHS/XS',
    'A plain enhancement spot as the repository search answers its type (`adtcore:type`): a type ADT does not expose (measured, the collection answers `500`), so no API serves it and no table holds it; the reader names it and stops. Keyed by what SAP answers, and named so in the comment.',
  ],
  [
    'src/handlers/enhancement/readonly/enhancementAvailability.ts:ENHO/XH',
    'A class enhancement as the repository search answers its type: a type ADT does not expose (measured, `500`), so no table holds it; the reader names it and stops.',
  ],
  [
    'src/handlers/enhancement/readonly/handleGetEnhancementImpl.ts:ENHO/XH',
    'The words a caller gets for a class enhancement, which ADT does not expose: the type as SAP answers it, held by no table.',
  ],
  [
    'src/handlers/include/readonly/handleGetIncludesList.ts:CLAS/I',
    "The node type GetIncludesList's answer gives a class section (ADT's class include type), read from the class's metadata: no API of the library serves it, so no table holds it; it is the tree's label as answered before.",
  ],
  [
    'src/lib/search-source/sourceReader.ts:VIEW',
    "The first four letters of a function module's name (the `VIEW…` maintenance modules), compared with a name, not a type.",
  ],
  [
    'src/lib/clients.ts:HTTP/SSE',
    'The two HTTP transports named together, not a type code.',
  ],
  [
    'src/lib/requestContext.ts:HTTP/SSE',
    'The two HTTP transports named together, not a type code.',
  ],
]);

describe('type codes in production source come from the tables', () => {
  const findings = typeCodeFindings(
    ROOT,
    TSCONFIG,
    SOURCE_DIRS.flatMap((dir) => productionFiles(dir)),
  );

  it('scans src and every package directory', () => {
    expect(SOURCE_DIRS.length).toBeGreaterThan(10);
  });

  it('types every code literal and names only table codes in comments and strings', () => {
    expect(
      findings
        .filter((finding) => !ALLOWED.has(finding.key))
        .map((finding) => finding.line),
    ).toEqual([]);
  });

  it('keeps no allow-list entry that matches no finding', () => {
    const keys = new Set(findings.map((finding) => finding.key));
    expect([...ALLOWED.keys()].filter((key) => !keys.has(key))).toEqual([]);
  });
});
