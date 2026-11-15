/**
 * Enhancement reads, live, on both systems, of SAP's own objects found by a
 * repository search (read only, nothing created): `GetEnhancementSpot` reads
 * the first BAdI enhancement spot the search finds.
 *
 * `GetEnhancementImpl` is not here: it reads a source code plugin
 * (`ENHO/XHH`), and the cloud system holds one alone, SAP's own, whose read
 * SAP refuses (measured 2026-11-15: 403 ExceptionResourceNoAuthorization,
 * SADT_RESOURCE 003).
 *
 * The calls go through the in-process server (`throughServer`): these tools
 * answer a JSON content item, which the server's registration serialises to
 * text.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  liveCall,
  livePrepare,
  liveSuite,
  throughServer,
} from '../helpers/live';
import { succeeded } from './ownObjects';

/** The names a search table lists of `type`: a header, then name, type, … per line. */
async function found(objectType: string, kind: string): Promise<string[]> {
  const table = succeeded(
    `SearchObject ${objectType}`,
    await livePrepare('SearchObject', {
      object_name: '*',
      object_type: objectType,
      max_results: 1000,
    }),
  );
  return table.text
    .split('\n')
    .slice(1)
    .map((line) => line.split('\t'))
    .filter(([, type]) => type === kind)
    .map(([name]) => name ?? '');
}

/** What the search found: the first BAdI spot. */
const names: { spot?: string } = {};

liveSuite(['onprem', 'cloud'], 'Enhancement reads', () => {
  // The search runs on the suite's own runner (the entry's answer, a
  // table); the reads under test through the server.
  it('the search finds a BAdI spot', async () => {
    const [spot] = await found('ENHS', 'ENHS/XSB');
    if (spot === undefined) throw new Error('the search found no BAdI spot');
    names.spot = spot;
  });

  describe('through the server', () => {
    throughServer();

    it('GetEnhancementSpot reads a BAdI enhancement spot', async () => {
      const { spot } = names;
      if (spot === undefined) throw new Error('no BAdI spot was found');
      const read = await liveCall('GetEnhancementSpot', {
        enhancement_spot: spot,
      });
      assert.ok(succeeded('GetEnhancementSpot', read).text.includes(spot));
    });
  });
});
