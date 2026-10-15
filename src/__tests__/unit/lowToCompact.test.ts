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
 * - `extra-requests`: the low tool's requests are among compact's, in order
 *   (the high create also validates, locks, checks);
 * - `deletion-check`: compact sends the deletion check, then exactly the low
 *   tool's requests;
 * - `activation-run`: compact activates the same object through the
 *   activation run instead of the inline activation the low tool sent.
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

/** The compact tools, each reading the stand-in's context at call time. */
function compactTools(
  getContext: () => HandlerContext,
): Map<string, HandlerEntry> {
  const entries = [
    ...compactModifyEntries(getContext),
    ...compactReadOnlyEntries(getContext),
  ];
  return new Map(entries.map((e) => [e.toolDefinition.name, e]));
}

/** The arguments the SDK lets through: those the schema declares. */
function declared(
  entry: HandlerEntry,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const properties = (
    entry.toolDefinition.inputSchema as { properties?: object }
  ).properties;
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
  const tools = compactTools(() => context);
  for (const call of row.compact) {
    const entry = tools.get(call.tool);
    if (!entry) throw new Error(`no compact tool ${call.tool}`);
    await (entry.handler as unknown as (args: unknown) => Promise<unknown>)(
      declared(entry, call.args),
    );
  }
  return parityRequests(connection.requests);
}

/** Whether `part` occurs in `whole` in order, each request equal. */
function inOrder(part: ParityRequest[], whole: ParityRequest[]): boolean {
  let at = 0;
  for (const request of whole) {
    if (
      at < part.length &&
      JSON.stringify(request) === JSON.stringify(part[at])
    )
      at += 1;
  }
  return at === part.length;
}

const isDeletionCheck = (r: ParityRequest) =>
  r.method === 'POST' && r.url === '/sap/bc/adt/deletion/check';

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

  const mapped = TABLE.rows.filter((r) => !r.accepted);
  it.each(mapped.map((r) => [r.tool, r] as const))(
    '%s: the compact call sends the same requests',
    async (_tool, row) => {
      expect(await compactRequests(row)).toEqual(row.low_requests);
    },
  );

  const extra = TABLE.rows.filter((r) => r.accepted?.kind === 'extra-requests');
  it.each(extra.map((r) => [r.tool, r] as const))(
    '%s (accepted, extra requests): the low requests are among the compact ones, in order',
    async (_tool, row) => {
      const sent = await compactRequests(row);
      expect(sent.length).toBeGreaterThan(row.low_requests?.length ?? 0);
      expect(inOrder(row.low_requests ?? [], sent)).toBe(true);
    },
  );

  const deletions = TABLE.rows.filter(
    (r) => r.accepted?.kind === 'deletion-check',
  );
  it.each(deletions.map((r) => [r.tool, r] as const))(
    '%s (accepted, deletion check): the check, then exactly the low requests',
    async (_tool, row) => {
      const [check, ...rest] = await compactRequests(row);
      expect(check && isDeletionCheck(check)).toBe(true);
      expect(rest).toEqual(row.low_requests);
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
      const sent = await compactRequests(row);
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

  /**
   * The rows the owner accepted (2026-10-13), each with its kind — fixed
   * here, so a row cannot be marked accepted later, or change its kind,
   * without this test going red.
   */
  const ACCEPTED: ReadonlyArray<[string, string]> = [
    ['CreateDomainLow', 'extra-requests'],
    ['CreateDataElementLow', 'extra-requests'],
    ['CreateStructureLow', 'extra-requests'],
    ['CreateBehaviorDefinitionLow', 'extra-requests'],
    ['CreateMetadataExtensionLow', 'extra-requests'],
    ['DeleteDomainLow', 'deletion-check'],
    ['DeleteDataElementLow', 'deletion-check'],
    ['DeleteTableLow', 'deletion-check'],
    ['DeleteStructureLow', 'deletion-check'],
    ['DeleteDdlLow', 'deletion-check'],
    ['DeleteClassLow', 'deletion-check'],
    ['DeleteProgramLow', 'deletion-check'],
    ['DeleteInterfaceLow', 'deletion-check'],
    ['DeleteFunctionGroupLow', 'deletion-check'],
    ['DeleteFunctionModuleLow', 'deletion-check'],
    ['DeleteBehaviorDefinitionLow', 'deletion-check'],
    ['DeleteMetadataExtensionLow', 'deletion-check'],
    ['DeletePackageLow', 'deletion-check'],
    ['ActivateFunctionModuleLow', 'activation-run'],
    ['ActivateServiceDefinitionLow', 'activation-run'],
    ['ActivateServiceBindingLow', 'activation-run'],
  ];

  it('accepts exactly the 21 rows the owner accepted, each with its kind', () => {
    const accepted = TABLE.rows
      .filter((r) => r.accepted)
      .map((r) => [r.tool, r.accepted?.kind] as [string, string | undefined])
      .sort((x, y) => x[0].localeCompare(y[0]));
    expect(ACCEPTED).toHaveLength(21);
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
      'deletion-check',
      'extra-requests',
    ]);
  });
});

/**
 * MIGRATION-19.0's table is rendered from the JSON: the committed text must be
 * the rendering. `WRITE_LOW_TO_COMPACT_TABLE=1` writes it first (refused under CI).
 */
describe('docs/MIGRATION-19.0.md', () => {
  const file = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'docs',
    'MIGRATION-19.0.md',
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
