/**
 * `--batch-open-envelopes` / `MCP_BATCH_OPEN_ENVELOPES` / YAML
 * `batch.openEnvelopes` (spec §3.3): the consumer's bound on the open
 * envelopes of one owner. A positive whole number; anything else stops the
 * start with fixed words naming the setting as given, the value never
 * echoed. Not given: no bound — the server has no default.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BATCH_OPEN_ENVELOPES_ROW,
  openEnvelopesOf,
  ParameterRefusal,
  readParameters,
  type YamlConfig,
} from '../../../lib/config';

const read = (
  argv: string[],
  env: NodeJS.ProcessEnv = {},
  yaml: YamlConfig | null = null,
) =>
  readParameters(
    {
      program: 'open-envelopes',
      rows: [BATCH_OPEN_ENVELOPES_ROW],
      removed: [],
    },
    argv,
    env,
    yaml,
  ).batchOpenEnvelopes;

describe('the consumer’s bound on open envelopes', () => {
  it('is read from the CLI, the environment and YAML; the CLI beats the environment, which beats YAML', () => {
    assert.equal(read(['--batch-open-envelopes=4']), 4);
    assert.equal(read([], { MCP_BATCH_OPEN_ENVELOPES: '5' }), 5);
    assert.equal(read([], {}, { batch: { openEnvelopes: 6 } }), 6);
    assert.equal(read([], {}, { batch: { openEnvelopes: '7' } }), 7);
    const yaml = { batch: { openEnvelopes: 30 } };
    const env = { MCP_BATCH_OPEN_ENVELOPES: '20' };
    assert.equal(read(['--batch-open-envelopes=10'], env, yaml), 10);
    assert.equal(read([], env, yaml), 20);
  });

  it('not given: no bound, and no default', () => {
    assert.equal(read([]), undefined);
    assert.equal(read([], { MCP_BATCH_OPEN_ENVELOPES: '' }), undefined);
    assert.equal(read([], {}, { batch: { openEnvelopes: null } }), undefined);
    assert.equal(BATCH_OPEN_ENVELOPES_ROW.default, undefined);
  });

  for (const value of ['0', '-1', '1.5', 'x']) {
    it(`"${value}" on the CLI stops the start, naming the setting, the value not echoed`, () => {
      assert.throws(
        () => read([`--batch-open-envelopes=${value}`]),
        (error: unknown) =>
          error instanceof ParameterRefusal &&
          error.words ===
            'Invalid --batch-open-envelopes: must be a positive whole number of envelopes',
      );
    });
    it(`"${value}" in the environment names the variable`, () => {
      assert.throws(
        () => read([], { MCP_BATCH_OPEN_ENVELOPES: value }),
        (error: unknown) =>
          error instanceof ParameterRefusal &&
          error.words ===
            'Invalid MCP_BATCH_OPEN_ENVELOPES: must be a positive whole number of envelopes',
      );
    });
  }

  for (const value of [0, 1.5, true, 'x', [3], { n: 3 }]) {
    it(`YAML ${JSON.stringify(value)} names the YAML key`, () => {
      assert.throws(
        () => read([], {}, { batch: { openEnvelopes: value } }),
        (error: unknown) =>
          error instanceof ParameterRefusal &&
          error.words ===
            'Invalid batch.openEnvelopes (config file): must be a positive whole number of envelopes',
      );
    });
  }

  it("an embedder's openEnvelopes: a positive whole number, else refused with its name", () => {
    assert.equal(openEnvelopesOf(1, 'openEnvelopes'), 1);
    assert.equal(openEnvelopesOf(12, 'openEnvelopes'), 12);
    for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(
        () => openEnvelopesOf(value, 'openEnvelopes'),
        (error: unknown) =>
          error instanceof Error &&
          error.message ===
            'Invalid openEnvelopes: must be a positive whole number of envelopes',
      );
    }
  });
});
