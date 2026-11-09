/**
 * The coverage guard (spec §8, acceptance 2): every coverage key the
 * binaries serve has a row in `tests/fixtures/tools/coverage-ledger.json`
 * naming a unit file that pins it with `pinCases` and, per system kind that
 * requires it, a live file that calls it with `liveCall` — and nothing else
 * is in the ledger, and no pin or live call stands outside it.
 *
 * A ratchet by the owner's decision (O1): the keys still without a ledger
 * row are exactly the keys `coverage-debt.json` lists. A key missing but not
 * listed fails, and so does a listed key that is covered or no longer
 * served: the list only shrinks, to empty when the last family lands.
 *
 * The served list is read as a client reads it (`servedTools()`), and is
 * first compared with `listed-schemas.json`: an empty or partial list cannot
 * make the guard pass. The unit files `npm test` runs come from Jest's own
 * discovery of the root configuration (`runCLI` with `listTests`): no
 * pattern of ours is evaluated. Files are read with the TypeScript compiler
 * API (`ledgerScan.ts`).
 *
 * Each check is load-bearing: one fixture per refusal under
 * `__fixtures__/coverage/` is refused by its own check alone, and `clean`
 * by none; under `__fixtures__/coverage-debt/` likewise for the ratchet,
 * `equal` refused by none.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCLI } from 'jest';
import { compactModifyEntries } from '../../../../compact-modify/src/group';
import { PART_TYPES } from '../../../handlers/common/low/handleUpdateUnderLock';
import { declareSystemKind } from '../../../lib/systemKind';
import { recordingConnection } from '../../helpers/recordingConnection';
import { type ServedTool, servedTools } from '../../helpers/servedTools';
import { toolAnswer } from '../../helpers/toolAnswer';
import {
  INCLUDE_PARTS,
  LISTED_SCHEMAS,
  requiredKeys,
  schemaEnums,
} from './coverageKeys';
import {
  type Check,
  type CheckInput,
  checkDebt,
  checkLedger,
  type Finding,
  repoReader,
} from './ledgerScan';

jest.setTimeout(300_000);

const REPO = path.join(__dirname, '..', '..', '..', '..');
const LEDGER = path.join(
  REPO,
  'tests',
  'fixtures',
  'tools',
  'coverage-ledger.json',
);
const DEBT = path.join(__dirname, 'coverage-debt.json');
const FIXTURES = path.join(__dirname, '__fixtures__', 'coverage');
const DEBT_FIXTURES = path.join(__dirname, '__fixtures__', 'coverage-debt');
const INTEGRATION = path.join(REPO, 'src', '__tests__', 'integration');

const readJson = (file: string): unknown =>
  JSON.parse(fs.readFileSync(file, 'utf8'));

/** A JSON value's member, read by shape. */
function member(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value
    ? Reflect.get(value, key)
    : undefined;
}

const repoPath = (full: string): string =>
  path.relative(REPO, full).split(path.sep).join('/');

/** The test files `npm test` runs: Jest's own discovery of the root configuration. */
async function jestDiscovery(): Promise<Set<string>> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-discovery-'));
  const outputFile = path.join(dir, 'tests.json');
  try {
    await runCLI(
      {
        _: [],
        $0: 'jest',
        listTests: true,
        json: true,
        outputFile,
        watchman: false,
        silent: true,
      },
      [REPO],
    );
    const listed = readJson(outputFile);
    if (!Array.isArray(listed)) throw new Error('Jest listed no test paths');
    return new Set(
      listed
        .filter((each): each is string => typeof each === 'string')
        .map(repoPath),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Every `*.test.ts` under `dir`, as repository paths. */
function testFilesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) testFilesUnder(full, out);
    else if (entry.name.endsWith('.test.ts')) out.push(repoPath(full));
  }
  return out;
}

const codes = (findings: readonly Finding[]): Check[] =>
  findings.map((finding) => finding.check);

/** The findings of `checks`, as lines, for a failure that names each. */
const of = (findings: readonly Finding[], ...checks: Check[]): string[] =>
  findings
    .filter((finding) => checks.includes(finding.check))
    .map((finding) => `${finding.check}: ${finding.detail}`);

describe('the coverage ledger guard', () => {
  let served: readonly ServedTool[] = [];
  let discovered = new Set<string>();
  let findings: Finding[] = [];
  let debtFindings: Finding[] = [];

  beforeAll(async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    served = await servedTools();
    discovered = await jestDiscovery();
    const input: CheckInput = {
      served,
      listed: member(readJson(LISTED_SCHEMAS), 'schemas'),
      ledger: readJson(LEDGER),
      discovered,
      scanned: [...discovered, ...testFilesUnder(INTEGRATION)],
      read: repoReader(REPO),
    };
    findings = checkLedger(input);
    debtFindings = checkDebt(input, readJson(DEBT));
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('the served list is the listed-schema fixture', () => {
    expect(new Set(served.map((tool) => tool.name)).size).toBe(313);
    expect(of(findings, 'served-mismatch')).toEqual([]);
  });

  it('Jest discovery lists the unit files npm test runs, and no integration or admin file', () => {
    expect(
      discovered.has('src/__tests__/unit/coverage/coverageLedger.test.ts'),
    ).toBe(true);
    expect(
      [...discovered].filter(
        (file) =>
          file.startsWith('src/__tests__/integration/') ||
          file.startsWith('src/__tests__/admin/'),
      ),
    ).toEqual([]);
  });

  it('the ledger is a map of key to { unit, live }', () => {
    expect(of(findings, 'ledger-shape')).toEqual([]);
  });

  it('the required keys without a ledger row are exactly coverage-debt.json: add the tests, or delete the listed keys from it', () => {
    expect(
      of(
        debtFindings,
        'debt-shape',
        'debt-new',
        'debt-covered',
        'debt-removed',
      ),
    ).toEqual([]);
  });

  it('every ledger row is a required key', () => {
    expect(of(findings, 'extra-row')).toEqual([]);
  });

  it('each row names exactly the systems its key requires', () => {
    expect(of(findings, 'missing-system', 'extra-system')).toEqual([]);
  });

  it('each unit reference is a pinCases row of that key', () => {
    expect(
      of(
        findings,
        'unit-no-pin',
        'rows-not-array',
        'row-not-literal',
        'tool-not-literal',
        'variant-not-literal',
        'args-not-literal',
        'dimension-not-literal',
        'bind-key-field',
        'typeless-part-typed',
        'expected-empty',
        'expected-not-literal',
        'request-not-literal',
        'request-keys',
        'url-not-literal',
        'nothing-sent-without-refusal',
      ),
    ).toEqual([]);
  });

  it('each unit reference is a test file the default unit command runs', () => {
    expect(of(findings, 'unit-not-discovered')).toEqual([]);
  });

  it('each live reference is an awaited liveCall of that key in an it, inside a liveSuite naming the system', () => {
    expect(
      of(
        findings,
        'live-not-integration',
        'live-missing',
        'live-not-awaited',
        'live-not-statement',
        'live-in-hook',
        'live-nested-function',
        'live-outside-suite',
        'suite-systems-not-literal',
      ),
    ).toEqual([]);
  });

  it("a delete key's live case awaits expectAbsent or expectCleared on the deleted object", () => {
    expect(
      of(
        findings,
        'delete-no-check',
        'delete-wrong-check',
        'delete-check-other-object',
        'delete-check-wrong-tool',
        'delete-check-wrong-tool',
      ),
    ).toEqual([]);
  });

  it('a none row is a tool the spec names as sending nothing', () => {
    expect(of(findings, 'none-not-allowed')).toEqual([]);
  });

  it('no pinCases row or liveCall in a scanned file lacks a ledger row', () => {
    expect(of(findings, 'orphan')).toEqual([]);
  });

  it('no registration is skipped', () => {
    expect(
      of(
        findings,
        'not-executable',
        'skipped',
        'only',
        'failing',
        'concurrent',
      ),
    ).toEqual([]);
  });

  it('every finding is one of the checks above', () => {
    const named = new Set<Check>([
      'served-mismatch',
      'ledger-shape',
      'missing-row',
      'extra-row',
      'missing-system',
      'extra-system',
      'unit-no-pin',
      'rows-not-array',
      'row-not-literal',
      'tool-not-literal',
      'variant-not-literal',
      'args-not-literal',
      'dimension-not-literal',
      'bind-key-field',
      'typeless-part-typed',
      'expected-empty',
      'expected-not-literal',
      'request-not-literal',
      'request-keys',
      'url-not-literal',
      'nothing-sent-without-refusal',
      'unit-not-discovered',
      'live-not-integration',
      'live-missing',
      'live-not-awaited',
      'live-not-statement',
      'live-in-hook',
      'live-nested-function',
      'live-outside-suite',
      'suite-systems-not-literal',
      'delete-no-check',
      'delete-wrong-check',
      'delete-check-other-object',
      'none-not-allowed',
      'orphan',
      'not-executable',
      'skipped',
      'only',
      'failing',
      'concurrent',
    ]);
    expect(codes(findings).filter((check) => !named.has(check))).toEqual([]);
  });
});

/** A fixture case under `dir`: the base inputs with the case's own overrides. */
function fixtureInput(
  name: string,
  dir: string = FIXTURES,
): { input: CheckInput; expect: Check[]; spec: unknown } {
  const base = readJson(path.join(FIXTURES, 'base', 'base.json'));
  const spec = readJson(path.join(dir, name, 'case.json'));
  const pick = (key: string): unknown => member(spec, key) ?? member(base, key);
  const files = new Map<string, string>();
  for (const [from, source] of [
    [path.join(FIXTURES, 'base'), member(base, 'files')],
    [path.join(dir, name), member(spec, 'files')],
  ] as const) {
    if (typeof source !== 'object' || source === null) continue;
    for (const [repo, file] of Object.entries(source)) {
      if (typeof file === 'string') {
        files.set(repo, path.join(from, file));
      }
    }
  }
  const strings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((each): each is string => typeof each === 'string')
      : [];
  const expected = member(spec, 'expect');
  const servedValue = pick('served');
  return {
    input: {
      served: Array.isArray(servedValue)
        ? servedValue.flatMap((tool): ServedTool[] => {
            const toolName = member(tool, 'name');
            const variant = member(tool, 'variant');
            const binary = member(tool, 'binary');
            const schema = member(tool, 'schema');
            return typeof toolName === 'string' &&
              (variant === 'onprem' || variant === 'cloud') &&
              typeof binary === 'string' &&
              typeof schema === 'object' &&
              schema !== null
              ? [
                  {
                    name: toolName,
                    variant,
                    binary,
                    schema: { type: 'object', ...schema },
                  },
                ]
              : [];
          })
        : [],
      listed: pick('listed'),
      ledger: pick('ledger'),
      discovered: new Set(strings(pick('discovered'))),
      scanned: [...files.keys()],
      read: (repo) => {
        const file = files.get(repo);
        return file === undefined ? undefined : fs.readFileSync(file, 'utf8');
      },
    },
    expect: typeof expected === 'string' ? [checkNamed(expected)] : [],
    spec,
  };
}

/** A fixture's expected check, as the case names it. */
function checkNamed(name: string): Check {
  const known: readonly Check[] = [
    'served-mismatch',
    'missing-row',
    'extra-row',
    'missing-system',
    'extra-system',
    'unit-not-discovered',
    'unit-no-pin',
    'live-not-integration',
    'live-missing',
    'orphan',
    'not-executable',
    'skipped',
    'only',
    'failing',
    'concurrent',
    'skip-option',
    'todo-option',
    'only-option',
    'concurrency-option',
    'context-skip',
    'context-todo',
    'runner-renamed',
    'bind-key-field',
    'typeless-part-typed',
    'expected-empty',
    'request-not-literal',
    'request-keys',
    'url-not-literal',
    'none-not-allowed',
    'live-not-awaited',
    'live-in-hook',
    'live-nested-function',
    'live-outside-suite',
    'delete-no-check',
    'delete-wrong-check',
    'delete-check-other-object',
    'delete-check-wrong-tool',
    'debt-shape',
    'debt-new',
    'debt-covered',
    'debt-removed',
  ];
  const found = known.find((check) => check === name);
  if (found === undefined) throw new Error(`no check is named ${name}`);
  return found;
}

const CASES = fs
  .readdirSync(FIXTURES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'base')
  .map((entry) => entry.name)
  .sort();

describe('each refusal fixture is refused by its own check alone', () => {
  it('there is a clean fixture and a refused one per check named in the spec', () => {
    expect(CASES).toContain('clean');
    expect(CASES.length).toBeGreaterThan(40);
  });

  it.each(CASES)('%s', (name) => {
    const { input, expect: expected } = fixtureInput(name);
    const found = checkLedger(input);
    expect({ name, checks: [...new Set(codes(found))] }).toEqual({
      name,
      checks: expected,
    });
    if (expected.length > 0) expect(found.length).toBeGreaterThan(0);
  });
});

const DEBT_CASES = fs
  .readdirSync(DEBT_FIXTURES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe('each ratchet fixture is refused by its own check alone', () => {
  it('there is an equal fixture and one per way the debt can drift', () => {
    expect(DEBT_CASES).toEqual([
      'covered-listed',
      'equal',
      'new-missing',
      'removed',
      'repeated',
    ]);
  });

  it.each(DEBT_CASES)('%s', (name) => {
    const { input, expect: expected, spec } = fixtureInput(name, DEBT_FIXTURES);
    // The ledger checks find nothing but the keys without a row.
    expect(
      codes(checkLedger(input)).filter((check) => check !== 'missing-row'),
    ).toEqual([]);
    const found = checkDebt(input, member(spec, 'debt'));
    expect({ name, checks: [...new Set(codes(found))] }).toEqual({
      name,
      checks: expected,
    });
  });
});

describe('the declared key tables', () => {
  /** The onprem listing of a compact tool in the listed-schema fixture. */
  function onpremEnums(tool: string) {
    const listed = member(member(readJson(LISTED_SCHEMAS), 'schemas'), tool);
    const onprem = Array.isArray(listed)
      ? listed.find((each) => {
          const by = member(each, 'listedBy');
          return (
            Array.isArray(by) && by.includes('onprem mcp-abap-adt-compact')
          );
        })
      : undefined;
    return schemaEnums(member(onprem, 'value'));
  }

  it('every HandlerUpdate combination outside the table is refused', async () => {
    const entry = compactModifyEntries().find(
      (each) => each.toolDefinition.name === 'HandlerUpdate',
    );
    if (entry === undefined) throw new Error('HandlerUpdate is not served');
    const enums = onpremEnums('HandlerUpdate');
    const types = enums.get('object_type') ?? [];
    const parts = enums.get('part') ?? [];
    expect(types.length).toBeGreaterThan(10);
    expect(parts).toEqual([...INCLUDE_PARTS]);
    const keys = requiredKeys([
      {
        name: 'HandlerUpdate',
        variant: 'onprem',
        binary: 'mcp-abap-adt-compact',
        schema: {
          type: 'object',
          properties: { object_type: { enum: types }, part: { enum: parts } },
        },
      },
    ]);
    let refused = 0;
    for (const type of types) {
      for (const part of parts) {
        if (keys.has(`HandlerUpdate#${type}#${part}`)) continue;
        const connection = recordingConnection();
        declareSystemKind(connection, 'onprem');
        const answer = toolAnswer(
          await entry.call(
            { connection },
            { object_type: type, part, lock_handle: 'LOCK_HANDLE' },
          ),
        );
        expect({
          type,
          part,
          isError: answer.isError,
          requests: connection.requests,
        }).toEqual({
          type,
          part,
          isError: true,
          requests: [],
        });
        expect(answer.content[0]?.text).toContain(
          `part is taken only by ${PART_TYPES.join(', ')} (${INCLUDE_PARTS.join(' or ')}); leave it out for ${type}`,
        );
        refused += 1;
      }
    }
    expect(refused).toBe((types.length - PART_TYPES.length) * parts.length);
  });
});
