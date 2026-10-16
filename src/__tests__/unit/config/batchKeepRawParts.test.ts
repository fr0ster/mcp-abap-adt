import { HTTP_PARAMETERS } from '../../../../http/src/config/httpParameters';
import { CORE_PARAMETERS } from '../../../../server/src/config/coreParameters';
import { SSE_PARAMETERS } from '../../../../sse/src/config/sseParameters';
import {
  BATCH_KEEP_RAW_PARTS_ROW,
  type ParameterTable,
} from '../../../lib/config/authParameters';
import { readBatchKeepRawParts } from '../../../lib/config/batchKeepRawParts';
import {
  generateYamlConfigTemplate as templateOf,
  validateYamlConfig as validateTable,
} from '../../../lib/config/yamlConfig';

/** lib's shared row alone: every binary's table holds it. */
const RAW: ParameterTable = {
  program: 'any-binary',
  rows: [BATCH_KEEP_RAW_PARTS_ROW],
  removed: [],
};

const ENV = 'MCP_BATCH_KEEP_RAW_PARTS';

describe('batch.keepRawParts — CLI, env, YAML', () => {
  it('absent → false', () => {
    expect(readBatchKeepRawParts([], {}, null)).toBe(false);
    expect(readBatchKeepRawParts([], {}, {})).toBe(false);
    expect(readBatchKeepRawParts([], {}, { batch: {} })).toBe(false);
  });

  it('true from YAML batch.keepRawParts', () => {
    expect(
      readBatchKeepRawParts([], {}, { batch: { keepRawParts: true } }),
    ).toBe(true);
    expect(
      readBatchKeepRawParts([], {}, { batch: { keepRawParts: false } }),
    ).toBe(false);
  });

  it('the CLI beats the env, which beats the YAML', () => {
    expect(readBatchKeepRawParts(['--batch-keep-raw-parts'], {}, null)).toBe(
      true,
    );
    expect(readBatchKeepRawParts([], { [ENV]: 'true' }, null)).toBe(true);
    expect(
      readBatchKeepRawParts(
        ['--batch-keep-raw-parts=false'],
        { [ENV]: 'true' },
        { batch: { keepRawParts: true } },
      ),
    ).toBe(false);
    expect(
      readBatchKeepRawParts(
        [],
        { [ENV]: 'false' },
        { batch: { keepRawParts: true } },
      ),
    ).toBe(false);
  });

  it.each([5, 'yes', 'on', [true]])(
    'a non-boolean is refused at start (%p)',
    (value) => {
      expect(() =>
        readBatchKeepRawParts([], {}, { batch: { keepRawParts: value } }),
      ).toThrow(/batch\.keepRawParts \(config file\).*Must be true or false/);
      expect(
        validateTable(RAW, { batch: { keepRawParts: value } }).errors.join(
          '\n',
        ),
      ).toMatch(/batch\.keepRawParts \(config file\).*Must be true or false/);
    },
  );

  it('a non-boolean CLI or env value is refused, named in its form', () => {
    expect(() =>
      readBatchKeepRawParts(['--batch-keep-raw-parts=maybe'], {}, null),
    ).toThrow(/--batch-keep-raw-parts.*Must be true or false/);
    expect(() => readBatchKeepRawParts([], { [ENV]: 'maybe' }, null)).toThrow(
      new RegExp(`${ENV}.*Must be true or false`),
    );
  });

  it('the template writes it under batch:, false', () => {
    expect(templateOf(RAW)).toMatch(
      /batch:\n {2}# .*\n {2}# .*\n {2}keepRawParts: false/,
    );
  });

  it.each([
    ['mcp-abap-adt', CORE_PARAMETERS],
    ['mcp-abap-adt-http', HTTP_PARAMETERS],
    ['mcp-abap-adt-sse', SSE_PARAMETERS],
  ])('%s reads it', (_binary, table) => {
    expect(table.rows).toContain(BATCH_KEEP_RAW_PARTS_ROW);
  });
});
