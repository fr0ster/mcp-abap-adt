/**
 * The requests of every compact handler the access restrictions rebuild or
 * narrow (plan Task 12a), pinned as the base sent them.
 *
 * Each case calls the entry, as an embedder's raw call does, on the parity
 * stand-in (`parityConnection`: real adt-clients code, the requests
 * recorded), once per value of the tool's dispatching argument on each
 * variant, and records what was sent — method, URL with its query, headers,
 * body — and how the call ended. The expectation is
 * `tests/fixtures/tools/changed-handler-requests.json`, written from the
 * base before the definitions were rebuilt (`WRITE_CHANGED_HANDLER_REQUESTS=1
 * npm test -- <this file>`) and reviewed in its diff; every later change
 * must leave it equal.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import {
  compactDataEntries,
  compactReadOnlyEntries,
} from '@mcp-abap-adt/compact-readonly-entries';
import type {
  HandlerContext,
  HandlerEntry,
  ToolDefinition,
} from '../../../lib/handlers/interfaces';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../../lib/systemContext';
import { declareSystemKind } from '../../../lib/systemKind';
import { holdingLockOf } from '../../helpers/heldLocks';
import { listedJson } from '../../helpers/listedJson';
import {
  type ParityRequest,
  parityConnection,
  parityRequests,
  silentLogger,
} from '../../helpers/lowToCompact';
import { repositoryRoot } from '../../helpers/repoRoot';

const FIXTURE = path.join(
  repositoryRoot(__dirname),
  'tests',
  'fixtures',
  'tools',
  'changed-handler-requests.json',
);

const VARIANTS = ['onprem', 'cloud'] as const;
type Variant = (typeof VARIANTS)[number];

const LOCK_HANDLE = 'LOCK_HANDLE_PLACEHOLDER';

/** The value each argument takes in every case that declares it. */
const VALUES: Readonly<Record<string, unknown>> = {
  object_name: 'OBJ_A',
  package_name: 'PKG_A',
  super_package: 'SUP_A',
  domain_name: 'DOMA_A',
  data_element_name: 'DTEL_A',
  table_name: 'TAB_A',
  structure_name: 'STRU_A',
  table_type_name: 'TTYP_A',
  ddl_name: 'DDL_A',
  service_definition_name: 'SRVD_A',
  service_binding_name: 'SRVB_A',
  class_name: 'CLAS_A',
  program_name: 'PROG_A',
  include_name: 'INCL_A',
  interface_name: 'INTF_A',
  function_group_name: 'FUGR_A',
  function_module_name: 'FM_A',
  name: 'NAME_A',
  behavior_definition: 'BDEF_A',
  behavior_definition_name: 'BDEF_A',
  behavior_implementation_name: 'BIMP_A',
  metadata_extension_name: 'DDLX_A',
  root_entity: 'ROOT_A',
  superclass: 'SUPER_A',
  description: 'Description',
  transport_request: 'XXXK900001',
  transport_number: 'XXXK900001',
  run_id: 'RUN_A',
  lock_handle: LOCK_HANDLE,
  source_code: 'SOURCE',
  ddl_code: 'SOURCE',
  ddl_source: 'SOURCE',
  test_class_code: 'SOURCE',
  local_types_code: 'SOURCE',
  definitions_code: 'SOURCE',
  macros_code: 'SOURCE',
  test_class_source: 'SOURCE',
  implementation_code: 'SOURCE',
  service_name: 'SERVICE_A',
};

/** Enum arguments a case takes, each at the first value its schema lists. */
const FIRST_OF_ENUM = new Set([
  'implementation_type',
  'binding_variant',
  'desired_publication_state',
]);

/** The value of an enum argument a tool takes as a free string. */
const ENUM_FREE: Readonly<Record<string, string>> = {
  implementation_type: 'managed',
  binding_variant: 'ODATA_V4_UI',
  desired_publication_state: 'published',
};

/** The tools whose dispatching argument is projected, and that argument. */
const PROJECTED: ReadonlyArray<readonly [string, string]> = [
  ['HandlerActivate', 'object_type'],
  ['HandlerCheckRun', 'object_type'],
  ['HandlerCreate', 'object_type'],
  ['HandlerDelete', 'object_type'],
  ['HandlerDeletionCheck', 'object_type'],
  ['HandlerGet', 'object_type'],
  ['HandlerLock', 'object_type'],
  ['HandlerUnlock', 'object_type'],
  ['HandlerUpdate', 'object_type'],
  ['HandlerValidate', 'object_type'],
  ['HandlerWhereUsed', 'object_type'],
  ['HandlerProfileRun', 'target_type'],
];

interface Case {
  readonly key: string;
  readonly tool: string;
  readonly args: Readonly<Record<string, unknown>>;
}

/** What a case sent and how it ended. */
interface Recorded {
  readonly requests: ParityRequest[];
  readonly ended: string;
}

function entries(): ReadonlyMap<string, HandlerEntry> {
  return new Map(
    [
      ...compactModifyEntries(),
      ...compactReadOnlyEntries(),
      ...compactDataEntries(),
    ].map((entry) => [entry.toolDefinition.name, entry]),
  );
}

/** The properties a definition lists, as JSON Schema. */
function propertiesOf(definition: ToolDefinition) {
  return listedJson(definition.inputSchema).properties ?? {};
}

/** The first value of an enum property, if it is one. */
function firstEnum(definition: ToolDefinition, key: string): unknown {
  const node = propertiesOf(definition)[key];
  if (node === undefined || typeof node === 'boolean') return undefined;
  return node.enum?.[0];
}

/** Whether `c` may be part of an argument name. */
function nameCharacter(c: string): boolean {
  return (c >= 'a' && c <= 'z') || c === '_';
}

/**
 * The arguments the variant's description names for `member`: the text of
 * its `MEMBER(…)` token, each comma- or semicolon-separated piece read for
 * the argument name it starts with. Plain code.
 */
function tokenArguments(description: string, member: string): string[] {
  const opening = `${member}(`;
  let at = description.indexOf(opening);
  // A member name inside another (`TABLE` in `TABLE_TYPE`) is not its token.
  while (at > 0 && nameCharacter(description[at - 1]?.toLowerCase() ?? '')) {
    at = description.indexOf(opening, at + 1);
  }
  if (at === -1) return [];
  let depth = 0;
  let end = at + opening.length;
  for (; end < description.length; end += 1) {
    const c = description[end];
    if (c === '(') depth += 1;
    if (c === ')') {
      if (depth === 0) break;
      depth -= 1;
    }
  }
  const names: string[] = [];
  let piece = '';
  for (const c of `${description.slice(at + opening.length, end)},`) {
    if (c === ',' || c === ';') {
      let name = '';
      for (const d of piece.trim()) {
        if (!nameCharacter(d)) break;
        name += d;
      }
      if (name.length > 0) names.push(name);
      piece = '';
    } else {
      piece += c;
    }
  }
  return names;
}

/** What each tool takes beside its member's token. */
const BESIDE: Readonly<Record<string, readonly string[]>> = {
  HandlerCreate: ['description', 'transport_request'],
  HandlerUpdate: ['lock_handle'],
};

/**
 * The arguments of `member`'s case on `variant`: the arguments its token
 * names (else `object_name`), those the tool takes beside it, each at its
 * `VALUES` value or its enum's first, and the dispatching argument.
 */
function argsFor(
  tool: string,
  definition: ToolDefinition,
  variant: Variant,
  argument: string,
  member: string,
  given: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  const declared = propertiesOf(definition);
  const description =
    definition.variants?.[variant].description ?? definition.description;
  const named = tokenArguments(description, member);
  const wanted = [
    ...(named.length > 0 ? named : ['object_name']),
    ...(BESIDE[tool] ?? []),
    ...(member === 'FUNCTION_MODULE' ? ['function_group_name'] : []),
    ...(tool === 'HandlerProfileRun'
      ? [member === 'CLASS' ? 'class_name' : 'program_name']
      : []),
  ];
  const args: Record<string, unknown> = {};
  for (const key of wanted) {
    if (!(key in declared)) continue;
    if (key === 'object_name' && member === 'FUNCTION_MODULE') {
      args[key] = 'FUGR_A|FM_A';
    } else if (key in VALUES) {
      args[key] = VALUES[key];
    } else if (FIRST_OF_ENUM.has(key)) {
      args[key] = firstEnum(definition, key) ?? ENUM_FREE[key];
    }
  }
  return { ...args, [argument]: member, ...given };
}

/** A part of `HandlerGet`, as its schema lists them. */
function partsOf(definition: ToolDefinition): readonly string[] {
  const node = propertiesOf(definition).part;
  if (node === undefined || typeof node === 'boolean') return [];
  const values = node.enum ?? [];
  return values.filter((value): value is string => typeof value === 'string');
}

/** Every case of `variant`. */
function casesOf(
  variant: Variant,
  tools: ReadonlyMap<string, HandlerEntry>,
): Case[] {
  const cases: Case[] = [];
  const entryOf = (tool: string): HandlerEntry => {
    const entry = tools.get(tool);
    if (entry === undefined) throw new Error(`no compact tool ${tool}`);
    return entry;
  };
  for (const [tool, argument] of PROJECTED) {
    const definition = entryOf(tool).toolDefinition;
    const members = definition.variants?.[variant].members ?? [];
    for (const member of members) {
      if (tool === 'HandlerGet') {
        for (const part of partsOf(definition)) {
          if (
            part === 'object_structure' ||
            part === 'node_structure' ||
            part === 'virtual_folders' ||
            part === 'activation_status' ||
            part === 'activation_results'
          ) {
            continue;
          }
          cases.push({
            key: `${variant} ${tool} ${member} part=${part}`,
            tool,
            args: argsFor(tool, definition, variant, argument, member, {
              part,
            }),
          });
        }
        continue;
      }
      cases.push({
        key: `${variant} ${tool} ${member}`,
        tool,
        args: argsFor(tool, definition, variant, argument, member),
      });
    }
  }
  const get = entryOf('HandlerGet').toolDefinition;
  const getBare = (given: Record<string, unknown>) => {
    const args: Record<string, unknown> = { ...given };
    return args;
  };
  cases.push(
    {
      key: `${variant} HandlerGet part=object_structure CLAS/OC`,
      tool: 'HandlerGet',
      args: getBare({
        part: 'object_structure',
        object_adt_type: 'CLAS/OC',
        object_name: 'CLAS_A',
      }),
    },
    {
      key: `${variant} HandlerGet part=node_structure DEVC/K`,
      tool: 'HandlerGet',
      args: getBare({
        part: 'node_structure',
        object_adt_type: 'DEVC/K',
        object_name: 'PKG_A',
      }),
    },
    {
      key: `${variant} HandlerGet part=virtual_folders`,
      tool: 'HandlerGet',
      args: getBare({ part: 'virtual_folders', object_search_pattern: 'Z*' }),
    },
    {
      key: `${variant} HandlerGet part=activation_status`,
      tool: 'HandlerGet',
      args: getBare({ part: 'activation_status', run_id: 'RUN_A' }),
    },
    {
      key: `${variant} HandlerGet part=activation_results`,
      tool: 'HandlerGet',
      args: getBare({ part: 'activation_results', run_id: 'RUN_A' }),
    },
  );
  if (partsOf(get).length === 0) throw new Error('HandlerGet lists no part');
  const activate = (given: Record<string, unknown>) => given;
  cases.push(
    {
      key: `${variant} HandlerActivate object_adt_type CLAS/OC`,
      tool: 'HandlerActivate',
      args: activate({ object_adt_type: 'CLAS/OC', object_name: 'CLAS_A' }),
    },
    {
      key: `${variant} HandlerActivate objects one CLAS/OC`,
      tool: 'HandlerActivate',
      args: activate({ objects: [{ name: 'CLAS_A', type: 'CLAS/OC' }] }),
    },
    {
      key: `${variant} HandlerActivate objects two`,
      tool: 'HandlerActivate',
      args: activate({
        objects: [
          { name: 'CLAS_A', type: 'CLAS/OC' },
          { name: 'INTF_A', type: 'INTF/OI' },
        ],
      }),
    },
    {
      key: `${variant} HandlerActivate object_adt_type PROG/I`,
      tool: 'HandlerActivate',
      args: activate({ object_adt_type: 'PROG/I', object_name: 'INCL_A' }),
    },
    {
      key: `${variant} HandlerGetData object_name`,
      tool: 'HandlerGetData',
      args: { object_name: 'TAB_A' },
    },
    {
      key: `${variant} HandlerGetData sql_query`,
      tool: 'HandlerGetData',
      args: { sql_query: 'SELECT carrid FROM scarr' },
    },
  );
  return cases;
}

/** The words a thrown value carries, or its kind. */
function wordsOf(error: unknown): string {
  return error instanceof Error ? error.message : typeof error;
}

/** The text of an answer's first content item, if it has one. */
function firstText(answer: object): string {
  if (!('content' in answer) || !Array.isArray(answer.content)) return '';
  const [first] = answer.content;
  return typeof first === 'object' &&
    first !== null &&
    'text' in first &&
    typeof first.text === 'string'
    ? first.text
    : '';
}

/** How an answer ended: an error answer with its words, or a result. */
function endOf(answer: unknown): string {
  if (
    typeof answer === 'object' &&
    answer !== null &&
    'isError' in answer &&
    answer.isError === true
  ) {
    return `error answer: ${firstText(answer)}`;
  }
  return 'answered';
}

const BOUNDARY = 'batch_';
const UUID_LENGTH = 36;

/** Whether `text` is 36 characters of hex digits and dashes. */
function uuidShaped(text: string): boolean {
  if (text.length !== UUID_LENGTH) return false;
  for (const c of text) {
    if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || c === '-')) {
      return false;
    }
  }
  return true;
}

/** `text` with every `batch_<uuid>` boundary as `batch_<boundary>`. Plain code. */
function fixedBoundaries(text: string): string {
  let out = '';
  let at = 0;
  for (;;) {
    const found = text.indexOf(BOUNDARY, at);
    if (found === -1) return out + text.slice(at);
    const start = found + BOUNDARY.length;
    const id = text.slice(start, start + UUID_LENGTH);
    out += text.slice(at, start) + (uuidShaped(id) ? '<boundary>' : id);
    at = start + UUID_LENGTH;
  }
}

/**
 * A request as the pin compares it: a batch's random boundary and the
 * cache-busting `_` query parameter (a clock reading) stated as placeholders.
 */
function canonical(request: ParityRequest): ParityRequest {
  /** A value as JSON carries it, every boundary a placeholder. */
  const fixed = (value: unknown): unknown =>
    JSON.parse(fixedBoundaries(JSON.stringify(value)));
  const params = request.params;
  const fixedParams =
    typeof params === 'object' && params !== null && '_' in params
      ? { ...params, _: '<clock>' }
      : params;
  const headers = request.headers;
  return {
    method: fixedBoundaries(request.method),
    url: fixedBoundaries(request.url),
    ...(request.data !== undefined ? { data: fixed(request.data) } : {}),
    ...(fixedParams !== undefined ? { params: fixed(fixedParams) } : {}),
    ...(headers !== undefined
      ? {
          headers: Object.fromEntries(
            Object.entries(headers).map(([name, value]) => [
              name,
              fixedBoundaries(value),
            ]),
          ),
        }
      : {}),
  };
}

async function record(
  variant: Variant,
  entry: HandlerEntry,
  args: Readonly<Record<string, unknown>>,
): Promise<Recorded> {
  const connection = parityConnection();
  declareSystemKind(connection, variant);
  const context: HandlerContext = {
    connection,
    logger: silentLogger,
    heldLocks: holdingLockOf(args),
  };
  let ended: string;
  try {
    ended = endOf(await entry.call(context, structuredClone(args)));
  } catch (error) {
    ended = `threw: ${wordsOf(error)}`;
  }
  return {
    requests: parityRequests(connection.requests).map(canonical),
    ended,
  };
}

const WRITE = process.env.WRITE_CHANGED_HANDLER_REQUESTS === '1';

/** The committed expectation, read as JSON. */
function pinned(): Readonly<Record<string, unknown>> {
  if (WRITE) return {};
  const parsed: unknown = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('the fixture is not an object');
  }
  return Object.fromEntries(Object.entries(parsed));
}

describe('the requests of the handlers the access restrictions change', () => {
  const tools = entries();
  const expected = pinned();
  const recorded: Record<string, Recorded> = {};
  const cases = VARIANTS.flatMap((variant) =>
    casesOf(variant, tools).map((one) => ({ variant, one })),
  );

  before(() => {
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
  });
  after(() => {
    resetSystemContextCache();
    if (WRITE) {
      fs.writeFileSync(FIXTURE, `${JSON.stringify(recorded, null, 2)}\n`);
    }
  });

  it('pins exactly these cases', () => {
    if (WRITE) return;
    assert.deepEqual(
      cases.map(({ one }) => one.key),
      Object.keys(expected),
    );
  });

  for (const { variant, one } of cases) {
    it(one.key, async () => {
      const entry = tools.get(one.tool);
      if (entry === undefined) throw new Error(`no compact tool ${one.tool}`);
      const sent = await record(variant, entry, one.args);
      recorded[one.key] = sent;
      if (!WRITE) {
        assert.deepEqual(JSON.parse(JSON.stringify(sent)), expected[one.key]);
      }
    });
  }
});
