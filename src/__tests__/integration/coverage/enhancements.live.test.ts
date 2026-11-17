/**
 * Enhancement reads, live, of SAP's own objects found by a repository search
 * (read only, nothing created):
 *
 * - on both systems, `GetEnhancementSpot` reads the first BAdI enhancement
 *   spot the search finds;
 * - on premise, `GetEnhancementImpl` reads the first source code plugin
 *   (`ENHO/XHH`) the search finds. The tool is served on premise only:
 *   source code plugins are not supported in ABAP Cloud (SAP's
 *   `CL_ENH_ADT_HOOK_IMPL_WB_ACCESS`), and the cloud system answers their
 *   read 403 ExceptionResourceNoAuthorization, SADT_RESOURCE 003, from the
 *   ADT dispatcher's `S_ADT_RES` check on the URI (measured 2026-11-15; the
 *   same answer is in adt-clients' corpus,
 *   `conformance/abap-cloud/ENHO-XHH--enh_copy_test_03--03-metadata.body.xml`).
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
import { member, payloadOf, succeeded } from './ownObjects';

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

/** What the search found: the first BAdI spot and the first source code plugin. */
const names: { spot?: string; plugin?: string } = {};

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

liveSuite(['onprem'], 'Source code plugin reads', () => {
  it('the search finds a source code plugin', async () => {
    const [plugin] = await found('ENHO', 'ENHO/XHH');
    if (plugin === undefined) {
      throw new Error('the search found no source code plugin');
    }
    names.plugin = plugin;
  });

  describe('through the server', () => {
    throughServer();

    it('GetEnhancementImpl reads a source code plugin', async () => {
      const { plugin } = names;
      if (plugin === undefined)
        throw new Error('no source code plugin was found');
      const read = await liveCall('GetEnhancementImpl', {
        enhancement_spot: 'enhoxhh',
        enhancement_name: plugin,
      });
      const payload = payloadOf(succeeded('GetEnhancementImpl', read));
      assert.equal(member(payload, 'enhancement_name'), plugin);
      assert.equal(member(payload, 'status'), undefined);
      assert.equal(typeof member(payload, 'source_code'), 'string');
    });
  });
});
