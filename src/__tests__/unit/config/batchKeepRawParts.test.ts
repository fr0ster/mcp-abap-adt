import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import { HTTP_PARAMETERS } from '../../../../server-runtime/src/http/config/httpParameters';
import { SSE_PARAMETERS } from '../../../../server-runtime/src/sse/config/sseParameters';
import { CORE_PARAMETERS } from '../../../../server-runtime/src/stdio/config/coreParameters';
import {
  BATCH_KEEP_RAW_PARTS_ROW,
  type ParameterTable,
} from '../../../lib/config/authParameters';
import { readBatchKeepRawParts } from '../../../lib/config/batchKeepRawParts';
import {
  generateYamlConfigTemplate as templateOf,
  validateYamlConfig as validateTable,
} from '../../../lib/config/yamlConfig';
import { assertThrows } from '../../helpers/assertions';

/** lib's shared row alone: every binary's table holds it. */
const RAW: ParameterTable = {
  program: 'any-binary',
  rows: [BATCH_KEEP_RAW_PARTS_ROW],
  removed: [],
};

const ENV = 'MCP_BATCH_KEEP_RAW_PARTS';

describe('batch.keepRawParts — CLI, env, YAML', () => {
  it('absent → false', () => {
    assert.equal(readBatchKeepRawParts([], {}, null), false);
    assert.equal(readBatchKeepRawParts([], {}, {}), false);
    assert.equal(readBatchKeepRawParts([], {}, { batch: {} }), false);
  });

  it('true from YAML batch.keepRawParts', () => {
    assert.equal(
      readBatchKeepRawParts([], {}, { batch: { keepRawParts: true } }),
      true,
    );
    assert.equal(
      readBatchKeepRawParts([], {}, { batch: { keepRawParts: false } }),
      false,
    );
  });

  it('the CLI beats the env, which beats the YAML', () => {
    assert.equal(
      readBatchKeepRawParts(['--batch-keep-raw-parts'], {}, null),
      true,
    );
    assert.equal(readBatchKeepRawParts([], { [ENV]: 'true' }, null), true);
    assert.equal(
      readBatchKeepRawParts(
        ['--batch-keep-raw-parts=false'],
        { [ENV]: 'true' },
        { batch: { keepRawParts: true } },
      ),
      false,
    );
    assert.equal(
      readBatchKeepRawParts(
        [],
        { [ENV]: 'false' },
        { batch: { keepRawParts: true } },
      ),
      false,
    );
  });

  // The title shows each value as written: a string quoted.
  for (const [value, shown] of [
    [5, '5'],
    ['yes', '"yes"'],
    ['on', '"on"'],
    [[true], '[true]'],
  ] satisfies [unknown, string][]) {
    it(`a non-boolean is refused at start (${shown})`, () => {
      assertThrows(
        () => readBatchKeepRawParts([], {}, { batch: { keepRawParts: value } }),
        /batch\.keepRawParts \(config file\).*Must be true or false/,
      );
      assert.match(
        validateTable(RAW, { batch: { keepRawParts: value } }).errors.join(
          '\n',
        ),
        /batch\.keepRawParts \(config file\).*Must be true or false/,
      );
    });
  }

  it('a non-boolean CLI or env value is refused, named in its form', () => {
    assertThrows(
      () => readBatchKeepRawParts(['--batch-keep-raw-parts=maybe'], {}, null),
      /--batch-keep-raw-parts.*Must be true or false/,
    );
    assertThrows(
      () => readBatchKeepRawParts([], { [ENV]: 'maybe' }, null),
      new RegExp(`${ENV}.*Must be true or false`),
    );
  });

  it('the template writes it under batch:, false', () => {
    assert.match(
      templateOf(RAW),
      /batch:\n {2}# .*\n {2}# .*\n {2}keepRawParts: false/,
    );
  });

  for (const [_binary, table] of [
    ['mcp-abap-adt', CORE_PARAMETERS],
    ['mcp-abap-adt-http', HTTP_PARAMETERS],
    ['mcp-abap-adt-sse', SSE_PARAMETERS],
  ] satisfies [string, typeof CORE_PARAMETERS][]) {
    it(format('%s reads it', _binary), () => {
      assert.ok(table.rows.includes(BATCH_KEEP_RAW_PARTS_ROW));
    });
  }
});
