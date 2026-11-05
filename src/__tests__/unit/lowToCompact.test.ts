/**
 * The low set left the full binaries in 19.0.0; compact is its analogue.
 * `tools/low-to-compact.json` holds, for every tool the low set registered,
 * the compact call that replaces it and the ADT requests the low tool sent
 * for that call (`low_requests`, captured from the low handler before it was
 * removed).
 *
 * Each row's compact call runs here against the ADT stand-in — real
 * adt-clients code, the requests recorded — with its arguments cut to what
 * the compact tool's schema declares, as the SDK cuts them. It must send the
 * low tool's requests: the same, in the same order. A row marked `accepted`
 * differs as its kind says, and only so:
 *
 * - `activation-run`: compact activates the same object through the
 *   activation run instead of the inline activation the low tool sent.
 * - `version-stated` (23.0.0): every read names its version, so the compact
 *   read sends the low request with `version=active` beside its query; the
 *   low read sent none.
 * - `language-unstated` (24.0.0, #348): a create given no language states
 *   none, so the compact create sends the low request without the
 *   `adtcore:language` and `adtcore:masterLanguage` the low create wrote.
 * - `program-type-removed` (24.0.0): the same, and without the
 *   `program:programType` the low program create wrote.
 * - `language-sent` (24.0.0, #348): a create given a language sends it as
 *   `sap-language` too, and writes the two language attributes together:
 *   the low request with the header, its body the same once the language
 *   attributes are taken out of both, and the compact body writing both.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import type {
  HandlerContext,
  HandlerEntry,
} from '../../lib/handlers/interfaces';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../lib/systemContext';
import { listedJson } from '../helpers/listedJson';
import {
  type LowToCompactRow,
  type ParityRequest,
  parityConnection,
  parityRequests,
  renderLowToCompactTable,
  silentLogger,
  TABLE_END,
  TABLE_START,
} from '../helpers/lowToCompact';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

const TABLE = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'tools', 'low-to-compact.json'),
    'utf-8',
  ),
) as { rows: LowToCompactRow[] };

/**
 * Every tool the low set registered before its removal — the list taken from
 * `LowLevelHandlersGroup` and `SystemHandlersGroup` on the branch, fixed here.
 */
const LOW_TOOLS_BEFORE_REMOVAL = [
  'ActivateObjectLow',
  'UpdatePackageLow',
  'UnlockPackageLow',
  'CheckPackageLow',
  'DeletePackageLow',
  'LockPackageLow',
  'ValidatePackageLow',
  'CreatePackageLow',
  'UpdateDomainLow',
  'CheckDomainLow',
  'DeleteDomainLow',
  'LockDomainLow',
  'UnlockDomainLow',
  'ValidateDomainLow',
  'CreateDomainLow',
  'ActivateDomainLow',
  'UpdateDataElementLow',
  'CheckDataElementLow',
  'DeleteDataElementLow',
  'LockDataElementLow',
  'UnlockDataElementLow',
  'ValidateDataElementLow',
  'CreateDataElementLow',
  'ActivateDataElementLow',
  'CreateTransportLow',
  'UpdateTableLow',
  'DeleteTableLow',
  'LockTableLow',
  'UnlockTableLow',
  'CreateTableLow',
  'CheckTableLow',
  'ValidateTableLow',
  'ActivateTableLow',
  'UpdateStructureLow',
  'CheckStructureLow',
  'DeleteStructureLow',
  'LockStructureLow',
  'UnlockStructureLow',
  'ValidateStructureLow',
  'CreateStructureLow',
  'ActivateStructureLow',
  'UpdateDdlLow',
  'CheckDdlLow',
  'DeleteDdlLow',
  'LockDdlLow',
  'UnlockDdlLow',
  'ValidateDdlLow',
  'CreateDdlLow',
  'ActivateDdlLow',
  'UpdateClassLow',
  'DeleteClassLow',
  'LockClassLow',
  'UnlockClassLow',
  'CreateClassLow',
  'ValidateClassLow',
  'CheckClassLow',
  'ActivateClassLow',
  'UpdateProgramLow',
  'CheckProgramLow',
  'DeleteProgramLow',
  'LockProgramLow',
  'UnlockProgramLow',
  'ValidateProgramLow',
  'CreateProgramLow',
  'ActivateProgramLow',
  'UpdateInterfaceLow',
  'CheckInterfaceLow',
  'DeleteInterfaceLow',
  'LockInterfaceLow',
  'UnlockInterfaceLow',
  'ValidateInterfaceLow',
  'CreateInterfaceLow',
  'ActivateInterfaceLow',
  'CheckFunctionGroupLow',
  'DeleteFunctionGroupLow',
  'DeleteFunctionModuleLow',
  'LockFunctionGroupLow',
  'LockFunctionModuleLow',
  'UnlockFunctionGroupLow',
  'UnlockFunctionModuleLow',
  'ValidateFunctionGroupLow',
  'CreateFunctionGroupLow',
  'CreateFunctionModuleLow',
  'UpdateFunctionModuleLow',
  'ValidateFunctionModuleLow',
  'CheckFunctionModuleLow',
  'ActivateFunctionModuleLow',
  'ActivateFunctionGroupLow',
  'CheckBdefLow',
  'DeleteBehaviorDefinitionLow',
  'LockBehaviorDefinitionLow',
  'UnlockBehaviorDefinitionLow',
  'ValidateBehaviorDefinitionLow',
  'CreateBehaviorDefinitionLow',
  'UpdateBehaviorDefinitionLow',
  'ActivateBehaviorDefinitionLow',
  'ValidateBehaviorImplementationLow',
  'CreateBehaviorImplementationLow',
  'LockBehaviorImplementationLow',
  'CheckMetadataExtensionLow',
  'DeleteMetadataExtensionLow',
  'LockMetadataExtensionLow',
  'UnlockMetadataExtensionLow',
  'ValidateMetadataExtensionLow',
  'CreateMetadataExtensionLow',
  'UpdateMetadataExtensionLow',
  'ActivateMetadataExtensionLow',
  'ActivateServiceDefinitionLow',
  'ActivateServiceBindingLow',
  'GetVirtualFoldersLow',
  'GetNodeStructureLow',
  'GetObjectStructureLow',
];

/** The compact tools, each given the stand-in's context at the call. */
function compactTools(): Map<string, HandlerEntry> {
  const entries = [...compactModifyEntries(), ...compactReadOnlyEntries()];
  return new Map(entries.map((e) => [e.toolDefinition.name, e]));
}

/** The arguments the SDK lets through: those the schema declares. */
function declared(
  entry: HandlerEntry,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const properties = listedJson(entry.toolDefinition.inputSchema).properties;
  const known = new Set(Object.keys(properties ?? {}));
  const undeclared = Object.keys(args).filter((k) => !known.has(k));
  if (undeclared.length > 0) {
    throw new Error(
      `${entry.toolDefinition.name} does not declare ${undeclared.join(', ')}`,
    );
  }
  return structuredClone(args);
}

/** The compact requests a row's call(s) send to the stand-in. */
async function compactRequests(row: LowToCompactRow): Promise<ParityRequest[]> {
  const connection = parityConnection();
  const context = {
    connection,
    logger: silentLogger,
  } as unknown as HandlerContext;
  const tools = compactTools();
  for (const call of row.compact) {
    const entry = tools.get(call.tool);
    if (!entry) throw new Error(`no compact tool ${call.tool}`);
    await entry.call(context, declared(entry, call.args));
  }
  return parityRequests(connection.requests);
}

describe('the low set → compact mapping table', () => {
  beforeEach(() => {
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
  });
  afterEach(() => resetSystemContextCache());

  it('has one row for every tool the low set registered, and no other', () => {
    expect(TABLE.rows.map((r) => r.tool).sort()).toEqual(
      [...LOW_TOOLS_BEFORE_REMOVAL].sort(),
    );
  });

  it('keeps no finding: every row names its compact call and the low requests', () => {
    for (const row of TABLE.rows) {
      expect(row.compact.length).toBeGreaterThan(0);
      expect(row.low_requests?.length).toBeGreaterThan(0);
      expect(row).not.toHaveProperty('finding');
    }
  });

  /** The activations whose function module's metadata is read first (#2). */
  const GROUP_READ_FIRST: ReadonlySet<string> = new Set([
    'ActivateFunctionModuleLow',
  ]);

  /** A function module's metadata read through `group`, as the stand-in records it. */
  const groupRead = (group: string, module: string) => ({
    method: 'GET',
    url: `/sap/bc/adt/functions/groups/${group.toLowerCase()}/fmodules/${module.toLowerCase()}?version=workingArea`,
    headers: {
      Accept:
        'application/vnd.sap.adt.functions.fmodules+xml, application/vnd.sap.adt.functions.fmodules.v2+xml, application/vnd.sap.adt.functions.fmodules.v3+xml',
    },
  });

  const mapped = TABLE.rows.filter((r) => !r.accepted);
  it.each(mapped.map((r) => [r.tool, r] as const))(
    '%s: the compact call sends the same requests',
    async (_tool, row) => {
      expect(await compactRequests(row)).toEqual(row.low_requests);
    },
  );

  const runs = TABLE.rows.filter((r) => r.accepted?.kind === 'activation-run');
  it.each(runs.map((r) => [r.tool, r] as const))(
    '%s (accepted, activation run): the same object through the activation run',
    async (_tool, row) => {
      const [low] = row.low_requests ?? [];
      expect(low?.url).toBe(
        '/sap/bc/adt/activation?method=activate&preauditRequested=true',
      );
      // A function module's metadata is read first (#2), the run after it.
      const all = await compactRequests(row);
      const checked = GROUP_READ_FIRST.has(row.tool);
      if (checked) expect(all[0]).toEqual(groupRead('FUGR_A', 'FM_A'));
      const sent = checked ? all.slice(1) : all;
      expect(sent[0]?.method).toBe('POST');
      expect(sent[0]?.url.startsWith('/sap/bc/adt/activation/runs?')).toBe(
        true,
      );
      const name = String(low?.data).match(/adtcore:name="([^"]+)"/)?.[1];
      expect(name).toBeDefined();
      expect(String(sent[0]?.data)).toContain(`adtcore:name="${name}"`);
      expect(sent.some((r) => r.url === low?.url)).toBe(false);
    },
  );

  const checkedFirst = TABLE.rows.filter(
    (r) => r.accepted?.kind === 'group-checked',
  );
  it.each(checkedFirst.map((r): [string, LowToCompactRow] => [r.tool, r]))(
    "%s (accepted, group checked): the module's metadata read, then the low requests",
    async (_tool, row) => {
      expect(await compactRequests(row)).toEqual([
        groupRead('FUGR_A', 'FM_A'),
        ...(row.low_requests ?? []),
      ]);
    },
  );

  const stated = TABLE.rows.filter(
    (r) => r.accepted?.kind === 'version-stated',
  );
  it.each(stated.map((r): [string, LowToCompactRow] => [r.tool, r]))(
    '%s (accepted, version stated): the low requests, each read with version=active',
    async (_tool, row) => {
      const withVersion = (row.low_requests ?? []).map((request) =>
        request.method === 'GET' && !request.url.includes('?')
          ? { ...request, url: `${request.url}?version=active` }
          : request,
      );
      expect(await compactRequests(row)).toEqual(withVersion);
    },
  );

  /**
   * `data` without the attribute `name="…"` and the space before it, when it
   * writes one: plain string code over the recorded body.
   */
  const withoutAttribute = (data: unknown, name: string): unknown => {
    if (typeof data !== 'string') return data;
    const start = data.indexOf(` ${name}="`);
    if (start < 0) return data;
    const end = data.indexOf('"', start + name.length + 3);
    return end < 0 ? data : data.slice(0, start) + data.slice(end + 1);
  };

  /** The low requests with `names`' attributes taken out of each body. */
  const withoutAttributes = (row: LowToCompactRow, names: string[]) =>
    (row.low_requests ?? []).map((request) => ({
      ...request,
      data: names.reduce(withoutAttribute, request.data),
    }));

  const LANGUAGE = ['adtcore:language', 'adtcore:masterLanguage'];

  const unstated = TABLE.rows.filter(
    (r) => r.accepted?.kind === 'language-unstated',
  );
  it.each(unstated.map((r): [string, LowToCompactRow] => [r.tool, r]))(
    '%s (accepted, language unstated): the low requests without the language attributes',
    async (_tool, row) => {
      expect(await compactRequests(row)).toEqual(
        withoutAttributes(row, LANGUAGE),
      );
    },
  );

  const untyped = TABLE.rows.filter(
    (r) => r.accepted?.kind === 'program-type-removed',
  );
  it.each(untyped.map((r): [string, LowToCompactRow] => [r.tool, r]))(
    '%s (accepted, program type removed): the low requests without the program type and the language attributes',
    async (_tool, row) => {
      expect(await compactRequests(row)).toEqual(
        withoutAttributes(row, [...LANGUAGE, 'program:programType']),
      );
    },
  );

  const sent = TABLE.rows.filter((r) => r.accepted?.kind === 'language-sent');
  it.each(sent.map((r): [string, LowToCompactRow] => [r.tool, r]))(
    '%s (accepted, language sent): the low requests with sap-language, the attributes together',
    async (_tool, row) => {
      const given = row.compact[0]?.args.master_language;
      expect(typeof given).toBe('string');
      const compact = await compactRequests(row);
      const low = row.low_requests ?? [];
      expect(compact).toHaveLength(low.length);
      for (const [at, request] of compact.entries()) {
        const before = low[at];
        expect({
          ...request,
          data: withoutAttributes(
            { ...row, low_requests: [request] },
            LANGUAGE,
          )[0]?.data,
          headers: undefined,
        }).toEqual({
          ...before,
          data: withoutAttributes(
            { ...row, low_requests: before ? [before] : [] },
            LANGUAGE,
          )[0]?.data,
          headers: undefined,
        });
        expect(request.headers).toEqual({
          ...before?.headers,
          'sap-language': given,
        });
        expect(String(request.data)).toContain(
          ` adtcore:language="${String(given)}" adtcore:masterLanguage="${String(given)}"`,
        );
      }
    },
  );

  /**
   * The rows the owner accepted (2026-10-13), each with its kind — fixed
   * here, so a row cannot be marked accepted later, or change its kind,
   * without this test going red. 19.0.0: compact HandlerCreate is the create
   * request alone, so the five create rows accepted with extra requests send
   * exactly the low requests now and are accepted no more; compact
   * HandlerDelete is the deletion request alone, so the thirteen delete rows
   * accepted with the deletion check before it are accepted no more either.
   */
  const ACCEPTED: ReadonlyArray<[string, string]> = [
    ['ActivateFunctionModuleLow', 'activation-run'],
    ['ActivateServiceDefinitionLow', 'activation-run'],
    ['ActivateServiceBindingLow', 'activation-run'],
    // 23.0.0 (the owner's ruling): every read names its version.
    ['UpdateDomainLow', 'version-stated'],
    ['UpdateDataElementLow', 'version-stated'],
    // 24.0.0 (the owner, #348): a create given no language states none.
    ['CreateBehaviorDefinitionLow', 'language-unstated'],
    ['CreateBehaviorImplementationLow', 'language-unstated'],
    ['CreateClassLow', 'language-unstated'],
    ['CreateDataElementLow', 'language-unstated'],
    ['CreateDdlLow', 'language-unstated'],
    ['CreateDomainLow', 'language-unstated'],
    ['CreateFunctionGroupLow', 'language-unstated'],
    ['CreateInterfaceLow', 'language-unstated'],
    // A create given a language sends it as sap-language too.
    ['CreateMetadataExtensionLow', 'language-sent'],
    ['CreatePackageLow', 'language-unstated'],
    ['CreateStructureLow', 'language-unstated'],
    ['CreateTableLow', 'language-unstated'],
    // 24.0.0 (the owner): no program type on create, which SAP ignores.
    ['CreateProgramLow', 'program-type-removed'],
    // 24.0.0 (the owner, #2): a function module's group is checked first.
    ['CheckFunctionModuleLow', 'group-checked'],
    ['DeleteFunctionModuleLow', 'group-checked'],
    ['LockFunctionModuleLow', 'group-checked'],
    ['UnlockFunctionModuleLow', 'group-checked'],
    ['UpdateFunctionModuleLow', 'group-checked'],
  ];

  it('accepts exactly the 23 rows the owner accepted, each with its kind', () => {
    const accepted = TABLE.rows
      .filter((r) => r.accepted)
      .map((r) => [r.tool, r.accepted?.kind] as [string, string | undefined])
      .sort((x, y) => x[0].localeCompare(y[0]));
    expect(ACCEPTED).toHaveLength(23);
    expect(accepted).toEqual(
      [...ACCEPTED].sort((x, y) => x[0].localeCompare(y[0])),
    );
  });

  it('accepts no other kind of difference', () => {
    const kinds = new Set(
      TABLE.rows.flatMap((r) => (r.accepted ? [r.accepted.kind] : [])),
    );
    expect([...kinds].sort()).toEqual([
      'activation-run',
      'group-checked',
      'language-sent',
      'language-unstated',
      'program-type-removed',
      'version-stated',
    ]);
  });
});

/**
 * The current low → compact table, in MIGRATION-24.0, is rendered from the
 * JSON: the committed text must be the rendering. MIGRATION-19.0 is a released
 * note and keeps its table as released. `WRITE_LOW_TO_COMPACT_TABLE=1` writes it first (refused under CI).
 */
describe('docs/MIGRATION-24.0.md', () => {
  const file = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'docs',
    'MIGRATION-24.0.md',
  );
  it('holds the low → compact table rendered from tools/low-to-compact.json', () => {
    const text = fs.readFileSync(file, 'utf-8');
    const start = text.indexOf(TABLE_START);
    const end = text.indexOf(TABLE_END);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const rendered = renderLowToCompactTable(TABLE.rows);
    if (process.env.WRITE_LOW_TO_COMPACT_TABLE === '1' && !process.env.CI) {
      fs.writeFileSync(
        file,
        text.slice(0, start) + rendered + text.slice(end + TABLE_END.length),
      );
      return;
    }
    expect(text.slice(start, end + TABLE_END.length)).toBe(rendered);
  });
});
