/**
 * The five access-restriction rows (spec §2): every row in each of its
 * three forms — CLI, environment, YAML — read CLI over environment over
 * YAML; an absent form restricts nothing; an empty entry, a stray separator,
 * a non-string YAML item and every malformed entry stop the start, named in
 * the form given; denied and allowed tables together stop it too.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  type AccessRestrictions,
  parsePackageEntry,
  parseRequestEntry,
  parseTableEntry,
} from '../../../lib/access/accessLists';
import { parseDeniedEntry } from '../../../lib/access/deniedActions';
import { readAccessRestrictions } from '../../../lib/config/accessRestrictions';
import { ParameterRefusal } from '../../../lib/config/authParameters';

interface Row {
  readonly cli: string;
  readonly env: string;
  readonly yaml: string;
  /** Two valid entries. */
  readonly valid: readonly [string, string];
  /** Malformed entries of the row's grammar. */
  readonly malformed: readonly string[];
  /** The row's read value in `AccessRestrictions`, comparable. */
  readonly readOf: (read: AccessRestrictions) => unknown;
  /** What the row reads `entries` into. */
  readonly expected: (entries: readonly string[], name: string) => unknown;
}

const ROWS: readonly Row[] = [
  {
    cli: '--deny-actions',
    env: 'MCP_DENY_ACTIONS',
    yaml: 'deny-actions',
    valid: ['DeleteClass', 'HandlerBatch.end'],
    malformed: ['.CLASS', 'Handler-Get', 'Del*ete', '*', '*.CLASS', 'A.B.C'],
    readOf: (read) =>
      read.deniedActions.length === 0 ? undefined : read.deniedActions,
    expected: (entries, name) =>
      entries.map((entry) => parseDeniedEntry(entry, name)),
  },
  {
    cli: '--allowed-packages',
    env: 'MCP_ALLOWED_PACKAGES',
    yaml: 'allowed-packages',
    valid: ['ZFOO', 'ZBAR/**'],
    malformed: ['Z*O', 'ZFOO**', 'Z*/**', '/**', 'ZF OO'],
    readOf: (read) => read.lists.allowedPackages,
    expected: (entries, name) =>
      entries.map((entry) => parsePackageEntry(entry, name)),
  },
  {
    cli: '--allowed-requests',
    env: 'MCP_ALLOWED_REQUESTS',
    yaml: 'allowed-requests',
    valid: ['A4HK900123', 'B4HK*'],
    malformed: ['A4HK/1', 'A*K'],
    readOf: (read) => read.lists.allowedRequests,
    expected: (entries, name) =>
      entries.map((entry) => parseRequestEntry(entry, name)),
  },
  {
    cli: '--denied-tables',
    env: 'MCP_DENIED_TABLES',
    yaml: 'denied-tables',
    valid: ['MARA', 'ZT*'],
    malformed: ['ZT/**', 'Z*T'],
    readOf: (read) => read.lists.deniedTables,
    expected: (entries, name) =>
      entries.map((entry) => parseTableEntry(entry, name)),
  },
  {
    cli: '--allowed-tables',
    env: 'MCP_ALLOWED_TABLES',
    yaml: 'allowed-tables',
    valid: ['MARA', 'ZT*'],
    malformed: ['ZT/**', 'Z*T'],
    readOf: (read) => read.lists.allowedTables,
    expected: (entries, name) =>
      entries.map((entry) => parseTableEntry(entry, name)),
  },
];

type Form = 'cli' | 'env' | 'yaml';
const FORMS: readonly Form[] = ['cli', 'env', 'yaml'];

/** The form's name as a refusal gives it. */
function nameOf(row: Row, form: Form): string {
  if (form === 'cli') return row.cli;
  if (form === 'env') return row.env;
  return `restrictions.${row.yaml} (config file)`;
}

/** Reads `value` given in `form` for `row`. */
function readIn(row: Row, form: Form, value: unknown): AccessRestrictions {
  if (form === 'cli') {
    return readAccessRestrictions([`${row.cli}=${String(value)}`], {}, null);
  }
  if (form === 'env') {
    return readAccessRestrictions([], { [row.env]: String(value) }, null);
  }
  return readAccessRestrictions(
    [],
    {},
    { restrictions: { [row.yaml]: value } },
  );
}

function refusesNaming(read: () => unknown, ...names: readonly string[]) {
  assert.throws(
    read,
    (error: unknown) =>
      error instanceof ParameterRefusal &&
      names.every((name) => error.words.includes(name)),
  );
}

for (const row of ROWS) {
  describe(row.cli, () => {
    for (const form of FORMS) {
      const name = nameOf(row, form);

      it(`reads two entries, trimmed (${form})`, () => {
        const value =
          form === 'yaml'
            ? [` ${row.valid[0]} `, row.valid[1]]
            : ` ${row.valid[0]} , ${row.valid[1]} `;
        assert.deepEqual(
          row.readOf(readIn(row, form, value)),
          row.expected(row.valid, name),
        );
      });

      if (form === 'yaml') {
        it('reads one YAML string as a list', () => {
          assert.deepEqual(
            row.readOf(readIn(row, form, `${row.valid[0]},${row.valid[1]}`)),
            row.expected(row.valid, name),
          );
        });
        it('refuses a non-string item, naming the row', () => {
          refusesNaming(() => readIn(row, form, [row.valid[0], 42]), name);
          refusesNaming(
            () => readIn(row, form, [{ entry: row.valid[0] }]),
            name,
          );
        });
        it('refuses an empty item', () => {
          refusesNaming(() => readIn(row, form, [row.valid[0], ' ']), name);
        });
        it('reads an empty sequence as absent', () => {
          assert.equal(row.readOf(readIn(row, form, [])), undefined);
        });
      } else {
        it(`refuses a stray separator (${form})`, () => {
          for (const value of [
            `${row.valid[0]},,${row.valid[1]}`,
            `${row.valid[0]},`,
            `,${row.valid[0]}`,
          ]) {
            refusesNaming(() => readIn(row, form, value), name);
          }
        });
        it(`reads an empty value as absent (${form})`, () => {
          assert.equal(row.readOf(readIn(row, form, '')), undefined);
        });
      }

      for (const malformed of row.malformed) {
        it(`refuses "${malformed}" (${form})`, () => {
          const value = form === 'yaml' ? [malformed] : malformed;
          refusesNaming(() => readIn(row, form, value), name, malformed);
        });
      }
    }

    it('is absent when no form gives it', () => {
      assert.equal(row.readOf(readAccessRestrictions([], {}, null)), undefined);
      assert.equal(
        row.readOf(readAccessRestrictions([], {}, { restrictions: {} })),
        undefined,
      );
    });

    it('reads CLI over env over YAML', () => {
      const [first, second] = row.valid;
      const yaml = { restrictions: { [row.yaml]: [second] } };
      assert.deepEqual(
        row.readOf(
          readAccessRestrictions(
            [`${row.cli}=${first}`],
            { [row.env]: second },
            yaml,
          ),
        ),
        row.expected([first], row.cli),
      );
      assert.deepEqual(
        row.readOf(readAccessRestrictions([], { [row.env]: first }, yaml)),
        row.expected([first], row.env),
      );
    });

    it('takes the CLI form with a separate value', () => {
      assert.deepEqual(
        row.readOf(readAccessRestrictions([row.cli, row.valid[0]], {}, null)),
        row.expected([row.valid[0]], row.cli),
      );
    });
  });
}

describe('the deny entries naming an ADT type code', () => {
  for (const code of [
    'HandlerActivate.CLAS/OC',
    'HandlerGet.DDLS/DF',
    'HandlerActivate.ENHO/XHH',
  ]) {
    it(`reads ${code} as one entry in every form`, () => {
      for (const read of [
        readAccessRestrictions([`--deny-actions=${code}`], {}, null),
        readAccessRestrictions([], { MCP_DENY_ACTIONS: code }, null),
        readAccessRestrictions(
          [],
          {},
          { restrictions: { 'deny-actions': [code] } },
        ),
      ]) {
        assert.equal(read.deniedActions.length, 1);
        assert.equal(read.deniedActions[0]?.text, code);
      }
    });
  }
});

describe('nothing configured', () => {
  it('reads no restriction', () => {
    assert.deepEqual(readAccessRestrictions([], {}, null), {
      deniedActions: [],
      lists: {},
    });
  });
});

describe('denied tables beside allowed tables', () => {
  it('stops the start, naming both forms', () => {
    refusesNaming(
      () =>
        readAccessRestrictions(
          ['--denied-tables=MARA', '--allowed-tables=ZT*'],
          {},
          null,
        ),
      '--denied-tables',
      '--allowed-tables',
    );
    refusesNaming(
      () =>
        readAccessRestrictions(
          [],
          { MCP_DENIED_TABLES: 'MARA' },
          { restrictions: { 'allowed-tables': ['ZT*'] } },
        ),
      'MCP_DENIED_TABLES',
      'restrictions.allowed-tables (config file)',
    );
  });
});
