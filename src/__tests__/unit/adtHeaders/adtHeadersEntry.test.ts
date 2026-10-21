/**
 * `@mcp-abap-adt/lib/adt-headers`, the subpath an embedder imports to send
 * the server's ADT request headers and apply its one-shot `406`/`415`
 * correction: resolved through the package's own `exports` as a consumer's
 * Node resolves it (after a build), exactly its public names — nothing of the
 * batch scope or the server's context reader —, and the correction working
 * through it, keyed by the system as the server keys it.
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  AdtHeaderPairs,
  adtSystemKey,
  DEFAULT_ADT_HEADERS,
  withAdtHeaders,
} from '@mcp-abap-adt/lib/adt-headers';

const root = path.join(__dirname, '..', '..', '..', '..');
const PUBLIC = [
  'AdtHeaderPairs',
  'DEFAULT_ADT_HEADERS',
  'adtOperation',
  'adtSystemKey',
  'withAdtHeaders',
];

describe('@mcp-abap-adt/lib/adt-headers through the package exports', () => {
  const built = fs.existsSync(
    path.join(root, 'dist', 'lib', 'adtHeaders', 'index.js'),
  );
  const t = built ? it : it.skip;

  t(
    'resolves to the built module and its types, and exports only the public names',
    () => {
      // A consumer's Node, outside Jest's resolver: the package's own
      // exports map, a self-reference from the package root.
      const script = [
        "const resolved = require.resolve('@mcp-abap-adt/lib/adt-headers');",
        "const names = Object.keys(require('@mcp-abap-adt/lib/adt-headers')).filter((k) => k !== '__esModule').sort();",
        'process.stdout.write(JSON.stringify({ resolved, names }));',
      ].join('\n');
      const run = spawnSync(process.execPath, ['-e', script], {
        cwd: root,
        encoding: 'utf8',
      });
      expect(run.status).toBe(0);
      const { resolved, names } = JSON.parse(run.stdout);
      expect(resolved).toBe(
        path.join(root, 'dist', 'lib', 'adtHeaders', 'index.js'),
      );
      expect(
        fs.existsSync(
          path.join(root, 'dist', 'lib', 'adtHeaders', 'index.d.ts'),
        ),
      ).toBe(true);
      expect(names).toEqual(PUBLIC);
    },
  );
});

describe('the one-shot correction through the subpath', () => {
  const NEWER =
    'application/vnd.sap.adt.repository.usagereferences.result.v2+xml';
  const notAcceptable = () =>
    Object.assign(new Error('Request failed with status code 406'), {
      response: {
        status: 406,
        headers: {},
        data: `<exc:exception><message>The message content is not acceptable. Accepted content types: ${NEWER}</message></exc:exception>`,
      },
    });

  it('a 406 is answered once more with the type SAP named, and the system keeps it, keyed as the server keys it', async () => {
    const pairs = new AdtHeaderPairs();
    const system = adtSystemKey({ url: 'https://sap.invalid/', client: '100' });
    const port = pairs.forSystem(system);
    const sent: string[] = [];
    const answer = await withAdtHeaders(
      { adtHeaders: port },
      'utils.getWhereUsed',
      async (headers) => {
        sent.push(headers.accept);
        if (sent.length === 1) throw notAcceptable();
        return 'answered';
      },
    );
    expect(answer).toBe('answered');
    expect(sent).toEqual([
      DEFAULT_ADT_HEADERS['utils.getWhereUsed'].accept,
      NEWER,
    ]);
    // The same system, another spelling of its URL: the kept pair.
    const again = pairs.forSystem(
      adtSystemKey({ url: 'https://sap.invalid', client: '100' }),
    );
    expect(again.pairFor('utils.getWhereUsed').accept).toBe(NEWER);
  });
});
