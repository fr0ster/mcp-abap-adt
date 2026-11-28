/**
 * The tool-set contract: a launcher serves
 * the groups its `ToolSet` builds, and the binary fixes the set — no flag
 * chooses it.
 *
 * - the four sets, one per kind of binary: `fullToolSet` (core: readonly
 *   with system and search, high, debug, the leftover-session list and
 *   logoff, background runs, the debugger batch), `fullReadOnlyToolSet`
 *   (core-ro: readonly with system and search, the leftover-session list
 *   and logoff), `compactToolSetOf` (compact: both halves, the compact
 *   debugger, the compact leftover-session list and logoff, background
 *   runs, `HandlerBatch`) and `compactReadOnlyToolSetOf` (compact-ro: the
 *   read-only half, the leftover-session list and logoff, `HandlerBatch`);
 *   batch mode is the compact sets';
 * - no `-ro` set holds a write, debugger or background-run tool, and no
 *   set a resume tool (a stdio process is born on its one leftover session
 *   at its start); each write set holds every tool of its `-ro` set;
 * - the binaries duplicate no tool: the full sets carry no low tool and no
 *   compact one, the compact sets no high or low one (readonly alone may be
 *   in both);
 * - `--exposition` and YAML `exposition` are removed parameters of every
 *   set: each word stops the start with its own sentence, naming the binary
 *   of the binary's own transport that serves what it asked for.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { format, isDeepStrictEqual } from 'node:util';
import {
  CompactModifyHandlersGroup,
  compactModifyEntries,
} from '@mcp-abap-adt/compact-modify';
import {
  CompactReadOnlyHandlersGroup,
  compactDataEntries,
  compactReadOnlyEntries,
} from '@mcp-abap-adt/compact-readonly-entries';
import { compactBackgroundRunEntries } from '../../lib/compact/backgroundRuns/group';
import { compactDebugEntries } from '../../lib/compact/debug/group';
import {
  ParameterRefusal,
  refuseRemovedParameters,
} from '../../lib/config/index';
import type { YamlConfig } from '../../lib/config/yamlConfig';
import {
  AbapGitHandlersGroup,
  BackgroundRunHandlersGroup,
  DebugBatchHandlersGroup,
  DebugHandlersGroup,
  EnvelopeHandlersGroup,
  HighLevelHandlersGroup,
  LeftoverSessionHandlersGroup,
  LeftoverSessionListHandlersGroup,
  ReadOnlyHandlersGroup,
  RuntimeRunHandlersGroup,
  SearchHandlersGroup,
  SystemHandlersGroup,
} from '../../lib/handlers';
import type {
  HandlerContext,
  IHandlerGroup,
} from '../../lib/handlers/interfaces';
import {
  BINARIES,
  compactReadOnlyToolSetOf,
  compactToolSetOf,
  expositionGoneWords,
  fullReadOnlyToolSet,
  fullToolSet,
  LOW_SET_GONE,
  registryOf,
  type ServedTransport,
  type ToolSet,
} from '../../lib/toolSet';
import { listedJson } from '../helpers/listedJson';
import { repositoryRoot } from '../helpers/repoRoot';

const context = {
  connection: undefined as never,
  logger: undefined,
} satisfies HandlerContext;

/** Each group's name and its tools, in order: what a server registers. */
function shape(groups: readonly IHandlerGroup[]) {
  return groups.map((group) => ({
    group: group.getName(),
    tools: group.getHandlers().map((entry) => entry.toolDefinition.name),
  }));
}

const namesOf = (groups: readonly IHandlerGroup[]) =>
  groups.flatMap((g) => g.getHandlers().map((e) => e.toolDefinition.name));

const toolsOf = (set: ToolSet, transport: ServedTransport = 'stdio') =>
  namesOf(set.groups(context, transport, { dataTools: false }));

const compact = compactToolSetOf({
  readOnly: compactReadOnlyEntries,
  data: compactDataEntries,
  modify: compactModifyEntries,
});
const compactRo = compactReadOnlyToolSetOf({
  readOnly: compactReadOnlyEntries,
  data: compactDataEntries,
});

/** The four sets, by the kind of binary that serves them. */
const SETS: ReadonlyArray<readonly [string, ToolSet]> = [
  ['core', fullToolSet],
  ['core-ro', fullReadOnlyToolSet],
  ['compact', compact],
  ['compact-ro', compactRo],
];

describe('the four tool sets', () => {
  it('core: readonly (with system), background runs, high, debug, search, the leftover-session list and logoff, the debugger batch, the read envelopes; no batch mode', () => {
    const overriding = [
      new HighLevelHandlersGroup(context),
      new DebugHandlersGroup(context),
    ];
    assert.deepStrictEqual(
      shape(fullToolSet.groups(context, 'stdio', { dataTools: false })),
      shape([
        new ReadOnlyHandlersGroup(context, new Set(namesOf(overriding))),
        new SystemHandlersGroup(context),
        new RuntimeRunHandlersGroup(context),
        new BackgroundRunHandlersGroup(context),
        ...overriding,
        new SearchHandlersGroup(context),
        new LeftoverSessionHandlersGroup(context),
        new DebugBatchHandlersGroup(context),
        new EnvelopeHandlersGroup(context),
        new AbapGitHandlersGroup(context),
      ]),
    );
  });

  it('core-ro: readonly (with system), search, background runs, the read envelopes, the leftover-session list; no batch mode', () => {
    assert.deepStrictEqual(
      shape(fullReadOnlyToolSet.groups(context, 'stdio', { dataTools: false })),
      shape([
        new ReadOnlyHandlersGroup(context),
        new SystemHandlersGroup(context),
        new SearchHandlersGroup(context),
        new AbapGitHandlersGroup(context, 'reads'),
        new BackgroundRunHandlersGroup(context),
        new EnvelopeHandlersGroup(context),
        new LeftoverSessionListHandlersGroup(context),
      ]),
    );
  });

  it('compact: both halves in one group, the debugger, the debugger batch, background runs, the leftover-session list and logoff, HandlerBatch', () => {
    const both = namesOf([
      new CompactReadOnlyHandlersGroup(context),
      new CompactModifyHandlersGroup(context),
    ]);
    // The 28 compact tools but the data tool (HandlerGetData, opt-in).
    assert.equal(both.length, 26);
    assert.deepStrictEqual(
      shape(compact.groups(context, 'stdio', { dataTools: false })),
      [
        { group: 'CompactHandlers', tools: both },
        {
          group: 'CompactDebugHandlers',
          tools: [
            'HandlerDebugBreakpoints',
            'HandlerDebugSession',
            'HandlerDebugStep',
            'HandlerDebugMaintain',
          ],
        },
        { group: 'CompactDebugBatchHandlers', tools: ['HandlerDebugBatch'] },
        {
          group: 'CompactAbapGitHandlers',
          tools: ['HandlerAbapGitGet', 'HandlerAbapGit'],
        },
        {
          group: 'CompactBackgroundRunHandlers',
          tools: [
            'HandlerBackgroundRunGet',
            'HandlerBackgroundRunList',
            'HandlerBackgroundRunDiscard',
          ],
        },
        {
          group: 'CompactLeftoverSessionHandlers',
          tools: ['HandlerLeftoverSessionList', 'HandlerLeftoverSessionLogoff'],
        },
        { group: 'CompactBatchHandlers', tools: ['HandlerBatch'] },
      ],
    );
  });

  it('compact-ro: the 16 that change nothing, background runs, the leftover-session list, HandlerBatch', () => {
    const half = namesOf([new CompactReadOnlyHandlersGroup(context)]);
    // The 16 that change nothing but the data tool (HandlerGetData, opt-in).
    assert.equal(half.length, 15);
    assert.deepStrictEqual(
      shape(compactRo.groups(context, 'stdio', { dataTools: false })),
      [
        { group: 'CompactReadOnlyHandlers', tools: half },
        { group: 'CompactAbapGitHandlers', tools: ['HandlerAbapGitGet'] },
        {
          group: 'CompactBackgroundRunHandlers',
          tools: [
            'HandlerBackgroundRunGet',
            'HandlerBackgroundRunList',
            'HandlerBackgroundRunDiscard',
          ],
        },
        {
          group: 'CompactLeftoverSessionListHandlers',
          tools: ['HandlerLeftoverSessionList'],
        },
        { group: 'CompactBatchHandlers', tools: ['HandlerBatch'] },
      ],
    );
  });

  it('a registry of a set lists the same tools', () => {
    for (const [, set] of SETS) {
      for (const transport of ['stdio', 'http', 'sse'] as const) {
        assert.deepStrictEqual(
          namesOf(
            registryOf(set, transport, { dataTools: false }).getHandlerGroups(),
          ),
          toolsOf(set, transport),
        );
      }
    }
  });

  it('every set serves background runs (a -ro set those of its long reads), so every launcher creates a store', () => {
    assert.deepStrictEqual(
      SETS.map(([kind, set]) => [kind, set.kind, set.backgroundRuns]),
      [
        ['core', 'core', true],
        ['core-ro', 'core-ro', true],
        ['compact', 'compact', true],
        ['compact-ro', 'compact-ro', true],
      ],
    );
  });

  it('no set lists a tool twice', () => {
    for (const [kind, set] of SETS) {
      const names = toolsOf(set);
      assert.deepStrictEqual(
        {
          kind,
          twice: names.filter((n, i) => names.indexOf(n) !== i),
        },
        { kind, twice: [] },
      );
    }
  });
});

/**
 * The leftover-session tools are stdio's only (the owner): the
 * runtime files exist for stdio, where the process serves one user. An http
 * or sse server holds many sessions of different users, so none of its
 * binaries — compact ones included — lists a leftover-session tool, and its
 * help names none. stdio keeps the list and the logoff on every set, and no
 * set serves a resume: a stdio process is born on the one leftover session
 * of its destination at its start, before any tool call.
 */
describe('the leftover-session tools are served on stdio only', () => {
  const LEFTOVER = [
    'ListLeftoverSessions',
    'ResumeLeftoverSession',
    'LogoffLeftoverSession',
    'HandlerLeftoverSessionList',
    'HandlerLeftoverSessionResume',
    'HandlerLeftoverSessionLogoff',
  ];
  const leftoverOf = (set: ToolSet, transport: ServedTransport) =>
    toolsOf(set, transport).filter((n) => LEFTOVER.includes(n));

  it('stdio: each set keeps the list, a full set the logoff too, and no set a resume', () => {
    assert.deepStrictEqual(
      SETS.map(([kind, set]) => [kind, leftoverOf(set, 'stdio')]),
      [
        ['core', ['ListLeftoverSessions', 'LogoffLeftoverSession']],
        ['core-ro', ['ListLeftoverSessions']],
        [
          'compact',
          ['HandlerLeftoverSessionList', 'HandlerLeftoverSessionLogoff'],
        ],
        ['compact-ro', ['HandlerLeftoverSessionList']],
      ],
    );
    for (const [kind, set] of SETS) {
      for (const transport of ['stdio', 'http', 'sse'] as const) {
        assert.deepStrictEqual(
          {
            kind,
            transport,
            resume: toolsOf(set, transport).filter((n) =>
              n.toLowerCase().includes('resume'),
            ),
          },
          { kind, transport, resume: [] },
        );
      }
    }
  });

  for (const transport of ['http', 'sse'] as const) {
    it(
      format(
        '%s: no set lists a leftover-session tool, and no help names one',
        transport,
      ),
      () => {
        for (const [kind, set] of SETS) {
          assert.deepStrictEqual(
            { kind, tools: leftoverOf(set, transport) },
            {
              kind,
              tools: [],
            },
          );
          assert.deepStrictEqual(
            {
              kind,
              named: set.toolsHelp(transport).includes('leftover'),
            },
            { kind, named: false },
          );
          // The rest of the set is stdio's, unchanged; on http beside its
          // long-session tools, which are Streamable HTTP's.
          assert.deepStrictEqual(
            {
              kind,
              rest: toolsOf(set, transport).filter(
                (n) =>
                  n !== 'SessionOpen' &&
                  n !== 'SessionClose' &&
                  n !== 'HandlerSession',
              ),
            },
            {
              kind,
              rest: toolsOf(set, 'stdio').filter((n) => !LEFTOVER.includes(n)),
            },
          );
        }
      },
    );
  }

  it('stdio: each help names the leftover sessions', () => {
    for (const [kind, set] of SETS) {
      assert.deepStrictEqual(
        {
          kind,
          named: set.toolsHelp('stdio').includes('the leftover SAP sessions'),
        },
        { kind, named: true },
      );
    }
  });
});

/**
 * What a `-ro` set must not hold: every tool that writes (the high group,
 * the compact modify half) or debugs (the debugger groups). Since 24.0.0
 * (D24, the owner) it serves the background-run tools: its long reads run
 * in the background, and only reads run there.
 */
describe('a -ro set holds no write or debugger tool, and the background-run tools; a write set holds its -ro set', () => {
  // A high tool the readonly group also defines reads (GetUnitTestResult,
  // the Get<Type> object reads): the high group's copy replaces it in core,
  // and it is no write.
  const readonlyNames = namesOf([new ReadOnlyHandlersGroup(context)]);
  const FORBIDDEN = {
    write: [
      ...namesOf([new HighLevelHandlersGroup(context)]).filter(
        (n) => !readonlyNames.includes(n),
      ),
      ...compactModifyEntries().map((e) => e.toolDefinition.name),
    ],
    debug: [
      ...namesOf([new DebugHandlersGroup(context)]),
      ...compactDebugEntries().map((e) => e.toolDefinition.name),
    ],
    background: [
      ...namesOf([new BackgroundRunHandlersGroup(context)]),
      ...compactBackgroundRunEntries().map((e) => e.toolDefinition.name),
    ],
  };

  it('knows tools of each kind, so the checks below are not vacuous', () => {
    assert.ok(FORBIDDEN.write.length > 9);
    assert.ok(FORBIDDEN.debug.length > 4);
    assert.equal(FORBIDDEN.background.length, 6);
  });

  for (const [kind, set] of [
    ['core-ro', fullReadOnlyToolSet],
    ['compact-ro', compactRo],
  ] as const) {
    it(format('%s holds none of them', kind), () => {
      const names = toolsOf(set);
      assert.deepStrictEqual(
        {
          kind,
          write: names.filter((n) => FORBIDDEN.write.includes(n)),
          debug: names.filter((n) => FORBIDDEN.debug.includes(n)),
        },
        { kind, write: [], debug: [] },
      );
    });
  }

  for (const [kind, set, get] of [
    ['core-ro', fullReadOnlyToolSet, 'GetBackgroundRun'],
    ['compact-ro', compactRo, 'HandlerBackgroundRunGet'],
  ] as const) {
    it(
      format('%s serves the background-run tools of its long reads', kind),
      () => {
        const names = toolsOf(set);
        const own = FORBIDDEN.background.filter((n) =>
          get === 'GetBackgroundRun'
            ? !n.startsWith('Handler')
            : n.startsWith('Handler'),
        );
        assert.deepStrictEqual(
          { kind, missing: own.filter((n) => !names.includes(n)) },
          {
            kind,
            missing: [],
          },
        );
      },
    );
  }

  for (const [kind, set] of [
    ['core', fullToolSet],
    ['compact', compact],
  ] as const) {
    it(format('%s holds each kind of them', kind), () => {
      const names = toolsOf(set);
      for (const tools of Object.values(FORBIDDEN)) {
        assert.deepStrictEqual(
          { kind, any: names.some((n) => tools.includes(n)) },
          {
            kind,
            any: true,
          },
        );
      }
    });
  }

  // Writing needs reading: every tool of the -ro set is in the write set,
  // under the same name.
  for (const [kind, write, readOnly] of [
    ['core', fullToolSet, fullReadOnlyToolSet],
    ['compact', compact, compactRo],
  ] as const) {
    it(format('%s holds every tool of its -ro set', kind), () => {
      const names = toolsOf(write);
      const held = (n: string) => names.includes(n);
      assert.deepStrictEqual(
        {
          kind,
          missing: toolsOf(readOnly).filter((n) => !held(n)),
        },
        { kind, missing: [] },
      );
    });
  }
});

/**
 * The ATC tools read and run checks, and change no object: the
 * read-only object-oriented binaries serve them on every transport, as the
 * full ones do. No compact set has an ATC route.
 */
describe('the ATC tools', () => {
  const ATC = [
    'RunATC',
    'GetATCRunStatus',
    'GetATCFindings',
    'ListATCResults',
    'GetATCResult',
  ];
  const transports: ServedTransport[] = ['stdio', 'http', 'sse'];

  for (const [kind, set] of [
    ['core', fullToolSet],
    ['core-ro', fullReadOnlyToolSet],
  ] as const) {
    it(format('%s serves all of them on every transport', kind), () => {
      for (const transport of transports) {
        const names = toolsOf(set, transport);
        assert.deepStrictEqual(
          {
            kind,
            transport,
            served: ATC.filter((n) => names.includes(n)),
          },
          { kind, transport, served: ATC },
        );
      }
    });
  }

  for (const [kind, set] of [
    ['compact', compact],
    ['compact-ro', compactRo],
  ] as const) {
    it(format('%s serves none of them', kind), () => {
      const names = toolsOf(set);
      assert.deepStrictEqual(
        { kind, served: ATC.filter((n) => names.includes(n)) },
        {
          kind,
          served: [],
        },
      );
    });
  }
});

/**
 * The run tools change the system (the code they run can change data), so
 * only the full set serves them, with `background` and its pointer to
 * GetBackgroundRun; a -ro set serves neither them nor the trace parameters
 * they schedule (the owner's decision: a read-only set changes nothing).
 */
describe('the run tools are the full set’s alone', () => {
  const RUN_TOOLS = [
    'RuntimeCreateProfilerTraceParameters',
    'RuntimeRunClass',
    'RuntimeRunProgram',
  ];
  const runTools = (set: ToolSet) =>
    set
      .groups(context, 'stdio', { dataTools: false })
      .flatMap((g) => g.getHandlers())
      .filter((e) => RUN_TOOLS.includes(e.toolDefinition.name))
      .map((e) => ({
        name: e.toolDefinition.name,
        background: Object.hasOwn(
          listedJson(e.toolDefinition.inputSchema).properties ?? {},
          'background',
        ),
      }));

  it('core-ro: none of them', () => {
    assert.deepStrictEqual(runTools(fullReadOnlyToolSet), []);
  });

  it('core: all three, the two runs with background', () => {
    assert.deepStrictEqual(runTools(fullToolSet), [
      { name: 'RuntimeCreateProfilerTraceParameters', background: false },
      { name: 'RuntimeRunClass', background: true },
      { name: 'RuntimeRunProgram', background: true },
    ]);
  });
});

/**
 * The binaries duplicate no tool (the owner): the full sets carry no
 * low tool — the fixed list of every tool the low set registered, the three
 * System `*Low` reads included — and no compact tool; the compact sets carry
 * none of the full set's high or low tools. Readonly alone may be in both.
 */
describe('the full and the compact binaries duplicate no tool', () => {
  const LOW_TOOLS = (
    JSON.parse(
      fs.readFileSync(
        path.join(repositoryRoot(__dirname), 'tools', 'low-to-compact.json'),
        'utf-8',
      ),
    ) as { rows: Array<{ tool: string }> }
  ).rows.map((row) => row.tool);

  const compactNames = new Set([...toolsOf(compact), ...toolsOf(compactRo)]);
  const highNames = namesOf([new HighLevelHandlersGroup(context)]);

  it('knows the 112 low tools and some compact tools, so the checks below are not vacuous', () => {
    assert.equal(LOW_TOOLS.length, 112);
    {
      const actual = LOW_TOOLS;
      for (const expected of [
        'GetVirtualFoldersLow',
        'GetNodeStructureLow',
        'GetObjectStructureLow',
      ]) {
        assert.ok(actual.some((e) => isDeepStrictEqual(e, expected)));
      }
    }
    assert.ok(compactNames.size > 27);
    assert.ok(highNames.length > 0);
  });

  for (const [kind, set] of [
    ['core', fullToolSet],
    ['core-ro', fullReadOnlyToolSet],
  ] as const) {
    it(format('%s carries no low and no compact tool', kind), () => {
      const names = toolsOf(set);
      assert.ok(names.length > 0);
      assert.deepStrictEqual(
        {
          kind,
          // The fixed list, and any name in the low set's style: a surviving
          // `…Low` TOOL_DEFINITION registered again under a new name.
          low: names.filter((n) => LOW_TOOLS.includes(n) || n.endsWith('Low')),
          compact: names.filter((n) => compactNames.has(n)),
        },
        { kind, low: [], compact: [] },
      );
    });
  }

  it('the compact sets carry none of the full set’s high or low tools', () => {
    const names = [...compactNames];
    assert.deepStrictEqual(
      {
        high: names.filter((n) => highNames.includes(n)),
        low: names.filter((n) => LOW_TOOLS.includes(n)),
      },
      { high: [], low: [] },
    );
  });
});

/** Every binary's own name, by transport and kind. */
const TRANSPORTS: readonly ServedTransport[] = ['stdio', 'http', 'sse'];

/**
 * The removed `--exposition`: one sentence per word, naming the binary of the
 * binary's own transport. Asserted verbatim for every transport.
 */
describe('--exposition is gone: each word stops the start with its sentence', () => {
  const expected = (
    family: 'core' | 'compact',
    transport: ServedTransport,
    form: string,
    word: string | undefined,
  ): string => {
    const b = BINARIES[transport];
    const n = (kind: keyof typeof b) =>
      `\`${b[kind].bin}\` (\`${b[kind].pkg}\`)`;
    const gone = `${form} is gone (19.0.0): the binary fixes its tool set, so remove it`;
    switch (word) {
      case 'low':
        return family === 'core'
          ? LOW_SET_GONE
          : `${gone}; the low set is gone from mcp-abap-adt / -http / -sse, and this binary serves its analogue, the compact tools`;
      case 'compact':
        return `${gone}; the compact tools are served by ${n('compact')}, those that change nothing by ${n('compact-ro')}`;
      case 'high':
        return `${gone}; the high tools are served, beside the readonly ones, by ${n('core')}`;
      case 'rw':
        return `${gone}; all compact tools are served by ${n('compact')}`;
      case 'debug':
        return family === 'core'
          ? `${gone}; the debugger is always served by ${n('core')}, and by no -ro binary`
          : `${gone}; the compact debugger is always served by ${n('compact')}, and by no -ro binary`;
      case 'readonly':
        return `${gone}; the readonly tools alone (with system and search) are served by ${n('core-ro')}`;
      case 'ro':
        return `${gone}; the compact tools that change nothing are served by ${n('compact-ro')}`;
      default:
        return family === 'core'
          ? `${gone}; ${n('core')} serves readonly, high and debug, ${n('core-ro')} the readonly tools alone`
          : `${gone}; ${n('compact')} serves all compact tools, ${n('compact-ro')} those that change nothing`;
    }
  };

  it('the binaries are the owner’s names', () => {
    assert.deepStrictEqual(
      TRANSPORTS.map((t) =>
        Object.values(BINARIES[t]).map((b) => `${b.bin} ${b.pkg}`),
      ),
      [
        [
          'mcp-abap-adt @mcp-abap-adt/core',
          'mcp-abap-adt-ro @mcp-abap-adt/core-ro',
          'mcp-abap-adt-compact @mcp-abap-adt/compact',
          'mcp-abap-adt-compact-ro @mcp-abap-adt/compact-ro',
        ],
        [
          'mcp-abap-adt-http @mcp-abap-adt/http',
          'mcp-abap-adt-http-ro @mcp-abap-adt/http-ro',
          'mcp-abap-adt-compact-http @mcp-abap-adt/compact-http',
          'mcp-abap-adt-compact-http-ro @mcp-abap-adt/compact-http-ro',
        ],
        [
          'mcp-abap-adt-sse @mcp-abap-adt/sse',
          'mcp-abap-adt-sse-ro @mcp-abap-adt/sse-ro',
          'mcp-abap-adt-compact-sse @mcp-abap-adt/compact-sse',
          'mcp-abap-adt-compact-sse-ro @mcp-abap-adt/compact-sse-ro',
        ],
      ],
    );
  });

  it('the words of each binary (stdio, one per word, verbatim)', () => {
    const words = (family: 'core' | 'compact', value: string) =>
      expositionGoneWords(family, 'stdio', '--exposition', value);
    assert.deepStrictEqual(
      {
        readonly: words('core', 'readonly'),
        high: words('core', 'high'),
        debug: words('core', 'debug'),
        ro: words('compact', 'ro'),
        rw: words('compact', 'rw'),
        compactDebug: words('compact', 'debug'),
        compact: words('core', 'compact'),
        low: words('core', 'low'),
        compactLow: words('compact', 'low'),
        other: words('core', 'search'),
        compactOther: words('compact', ''),
      },
      {
        readonly:
          '--exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the readonly tools alone (with system and search) are served by `mcp-abap-adt-ro` (`@mcp-abap-adt/core-ro`)',
        high: '--exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the high tools are served, beside the readonly ones, by `mcp-abap-adt` (`@mcp-abap-adt/core`)',
        debug:
          '--exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the debugger is always served by `mcp-abap-adt` (`@mcp-abap-adt/core`), and by no -ro binary',
        ro: '--exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the compact tools that change nothing are served by `mcp-abap-adt-compact-ro` (`@mcp-abap-adt/compact-ro`)',
        rw: '--exposition is gone (19.0.0): the binary fixes its tool set, so remove it; all compact tools are served by `mcp-abap-adt-compact` (`@mcp-abap-adt/compact`)',
        compactDebug:
          '--exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the compact debugger is always served by `mcp-abap-adt-compact` (`@mcp-abap-adt/compact`), and by no -ro binary',
        compact:
          '--exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the compact tools are served by `mcp-abap-adt-compact` (`@mcp-abap-adt/compact`), those that change nothing by `mcp-abap-adt-compact-ro` (`@mcp-abap-adt/compact-ro`)',
        low: 'the low set is gone from mcp-abap-adt / -http / -sse; use mcp-abap-adt-compact (or -compact-http / -compact-sse)',
        compactLow:
          '--exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the low set is gone from mcp-abap-adt / -http / -sse, and this binary serves its analogue, the compact tools',
        other:
          '--exposition is gone (19.0.0): the binary fixes its tool set, so remove it; `mcp-abap-adt` (`@mcp-abap-adt/core`) serves readonly, high and debug, `mcp-abap-adt-ro` (`@mcp-abap-adt/core-ro`) the readonly tools alone',
        compactOther:
          '--exposition is gone (19.0.0): the binary fixes its tool set, so remove it; `mcp-abap-adt-compact` (`@mcp-abap-adt/compact`) serves all compact tools, `mcp-abap-adt-compact-ro` (`@mcp-abap-adt/compact-ro`) those that change nothing',
      },
    );
  });

  // Several words: the one asking for the most decides (writes before reads).
  for (const [value, word] of [
    ['readonly,high', 'high'],
    ['readonly,high,debug', 'high'],
    ['readonly,debug', 'debug'],
    ['ro,debug', 'debug'],
    ['rw,debug', 'rw'],
    ['readonly,low', 'low'],
    ['readonly,compact', 'compact'],
    ['readonly,search', 'readonly'],
    [' RO ', 'ro'],
  ]) {
    it(format('%j is answered as %s', value, word), () => {
      for (const family of ['core', 'compact'] as const) {
        assert.equal(
          expositionGoneWords(family, 'http', '--exposition', value),
          expected(family, 'http', '--exposition', word),
        );
      }
    });
  }

  // Every set refuses the flag, in both spellings, and the YAML key, before
  // anything is read — each with its family's words and its transport's
  // binaries.
  for (const [kind, set] of SETS) {
    describe(format('%s', kind), () => {
      const family = kind.startsWith('compact') ? 'compact' : 'core';
      for (const transport of TRANSPORTS) {
        it(
          format('%s: the flag, either spelling, and the YAML key', transport),
          () => {
            const table = {
              program: 'x',
              rows: [],
              removed: [set.expositionRemoved(transport)],
            };
            const refusal = (
              argv: string[],
              yaml: YamlConfig | null = null,
            ) => {
              try {
                refuseRemovedParameters(table, argv, {}, yaml);
              } catch (error) {
                return error instanceof ParameterRefusal
                  ? error.words
                  : 'other';
              }
              return 'started';
            };
            for (const word of [
              'readonly',
              'high',
              'debug',
              'ro',
              'rw',
              'low',
            ]) {
              assert.equal(
                refusal([`--exposition=${word}`]),
                expected(family, transport, '--exposition', word),
              );
              assert.equal(
                refusal(['--exposition', word]),
                expected(family, transport, '--exposition', word),
              );
              assert.equal(
                refusal([], { exposition: word }),
                expected(family, transport, 'exposition (config file)', word),
              );
            }
            // A YAML list, a bare flag and an empty value stop the start too.
            assert.equal(
              refusal([], { exposition: ['readonly', 'high'] }),
              expected(family, transport, 'exposition (config file)', 'high'),
            );
            assert.equal(
              refusal(['--exposition']),
              expected(family, transport, '--exposition', undefined),
            );
            assert.equal(
              refusal(['--exposition=']),
              expected(family, transport, '--exposition', undefined),
            );
            assert.equal(
              refusal(['--exposition', '--mcp=X']),
              expected(family, transport, '--exposition', undefined),
            );
            assert.equal(refusal([]), 'started');
          },
        );
      }
    });
  }
});

describe('the TOOLS section of each set’s help', () => {
  for (const transport of TRANSPORTS) {
    it(
      format(
        '%s: names the binary, what it serves and the other binaries of its transport',
        transport,
      ),
      () => {
        const b = BINARIES[transport];
        for (const [kind, set] of SETS) {
          const help = set.toolsHelp(transport);
          const own = b[kind as keyof typeof b];
          assert.ok(
            help.includes(`\nTOOLS:\n  ${own.bin} serves one fixed tool set`),
          );
          assert.ok(help.includes('--exposition is gone in 19.0.0'));
          // Every other binary it points at is of the same transport.
          for (const other of Object.values(b)) {
            if (other === own) continue;
            if (help.includes(`${other.pkg},`)) {
              assert.ok(
                help.includes(`npm i -g ${other.pkg}, then ${other.bin}\n`),
              );
            }
          }
          for (const t of TRANSPORTS) {
            if (t === transport) continue;
            for (const other of Object.values(BINARIES[t])) {
              assert.ok(!help.includes(`npm i -g ${other.pkg},`));
            }
          }
        }
      },
    );
  }

  it('a -ro help names its write binary; a write help its -ro binary', () => {
    assert.ok(
      fullToolSet
        .toolsHelp('stdio')
        .includes('npm i -g @mcp-abap-adt/core-ro, then mcp-abap-adt-ro'),
    );
    assert.ok(
      fullReadOnlyToolSet
        .toolsHelp('sse')
        .includes('npm i -g @mcp-abap-adt/sse, then mcp-abap-adt-sse'),
    );
    assert.ok(
      compact
        .toolsHelp('http')
        .includes(
          'npm i -g @mcp-abap-adt/compact-http-ro, then mcp-abap-adt-compact-http-ro',
        ),
    );
    assert.ok(
      compactRo
        .toolsHelp('stdio')
        .includes('npm i -g @mcp-abap-adt/compact, then mcp-abap-adt-compact'),
    );
  });
});
