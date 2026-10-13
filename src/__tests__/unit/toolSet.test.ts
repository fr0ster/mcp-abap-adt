/**
 * The tool-set contract (spec §3.4, §3.5, D37, D49, C23): a launcher serves
 * the groups its `ToolSet` builds, and the binary fixes the set — no flag
 * chooses it.
 *
 * - the four sets, one per kind of binary: `fullToolSet` (core: readonly
 *   with system and search, high, debug, every leftover-session tool,
 *   background runs), `fullReadOnlyToolSet` (core-ro: readonly with system
 *   and search, the leftover-session list and logoff),
 *   `compactToolSetOf` (compact: both halves, the compact debugger, every
 *   compact leftover-session tool, background runs) and
 *   `compactReadOnlyToolSetOf` (compact-ro: the read-only half, the
 *   leftover-session list and logoff);
 * - no `-ro` set holds a write, debugger, background-run or resume tool;
 *   each write set holds every tool of its `-ro` set;
 * - the binaries duplicate no tool: the full sets carry no low tool and no
 *   compact one, the compact sets no high or low one (readonly alone may be
 *   in both);
 * - `--exposition` and YAML `exposition` are removed parameters of every
 *   set: each word stops the start with its own sentence, naming the binary
 *   of the binary's own transport that serves what it asked for.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CompactModifyHandlersGroup,
  compactModifyEntries,
} from '@mcp-abap-adt/compact-modify';
import {
  CompactReadOnlyHandlersGroup,
  compactReadOnlyEntries,
} from '@mcp-abap-adt/compact-readonly-entries';
import { TOOL_DEFINITION as ResumeLeftoverSession } from '../../handlers/leftover_session/session/handleResumeLeftoverSession';
import { compactBackgroundRunEntries } from '../../lib/compact/backgroundRuns/group';
import { compactDebugEntries } from '../../lib/compact/debug/group';
import { TOOL_DEFINITION as HandlerLeftoverSessionResume } from '../../lib/compact/session/handleHandlerLeftoverSessionResume';
import {
  ParameterRefusal,
  refuseRemovedParameters,
} from '../../lib/config/index';
import {
  BackgroundRunHandlersGroup,
  DebugHandlersGroup,
  HighLevelHandlersGroup,
  LeftoverSessionHandlersGroup,
  ReadOnlyHandlersGroup,
  SearchHandlersGroup,
  SystemHandlersGroup,
} from '../../lib/handlers';
import { ReadVsGetDedupStrategy } from '../../lib/handlers/groups/strategies';
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

const toolsOf = (set: ToolSet) => namesOf(set.groups(context));

const compact = compactToolSetOf({
  readOnly: compactReadOnlyEntries,
  modify: compactModifyEntries,
});
const compactRo = compactReadOnlyToolSetOf(compactReadOnlyEntries);

/** The four sets, by the kind of binary that serves them. */
const SETS: ReadonlyArray<readonly [string, ToolSet]> = [
  ['core', fullToolSet],
  ['core-ro', fullReadOnlyToolSet],
  ['compact', compact],
  ['compact-ro', compactRo],
];

describe('the four tool sets', () => {
  it('core: readonly (with system), background runs, high, debug, search, every leftover-session tool', () => {
    const overriding = [
      new HighLevelHandlersGroup(context),
      new DebugHandlersGroup(context),
    ];
    expect(shape(fullToolSet.groups(context))).toEqual(
      shape([
        new ReadOnlyHandlersGroup(
          context,
          new Set(namesOf(overriding)),
          new ReadVsGetDedupStrategy(),
        ),
        new SystemHandlersGroup(context),
        new BackgroundRunHandlersGroup(context),
        ...overriding,
        new SearchHandlersGroup(context),
        new LeftoverSessionHandlersGroup(context, { resume: true }),
      ]),
    );
  });

  it('core-ro: readonly (with system), search, the leftover-session list and logoff', () => {
    expect(shape(fullReadOnlyToolSet.groups(context))).toEqual(
      shape([
        new ReadOnlyHandlersGroup(
          context,
          new Set(),
          new ReadVsGetDedupStrategy(),
        ),
        new SystemHandlersGroup(context),
        new SearchHandlersGroup(context),
        new LeftoverSessionHandlersGroup(context, { resume: false }),
      ]),
    );
  });

  it('compact: both halves in one group, the debugger, background runs, every leftover-session tool', () => {
    const both = namesOf([
      new CompactReadOnlyHandlersGroup(context),
      new CompactModifyHandlersGroup(context),
    ]);
    expect(both).toHaveLength(27);
    expect(shape(compact.groups(context))).toEqual([
      { group: 'CompactHandlers', tools: both },
      {
        group: 'CompactDebugHandlers',
        tools: [
          'HandlerDebugStart',
          'HandlerDebugWait',
          'HandlerDebugView',
          'HandlerDebugStep',
        ],
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
        tools: [
          'HandlerLeftoverSessionList',
          'HandlerLeftoverSessionResume',
          'HandlerLeftoverSessionLogoff',
        ],
      },
    ]);
  });

  it('compact-ro: the 16 that change nothing, the leftover-session list and logoff', () => {
    const half = namesOf([new CompactReadOnlyHandlersGroup(context)]);
    expect(half).toHaveLength(16);
    expect(shape(compactRo.groups(context))).toEqual([
      { group: 'CompactReadOnlyHandlers', tools: half },
      {
        group: 'CompactLeftoverSessionHandlers',
        tools: ['HandlerLeftoverSessionList', 'HandlerLeftoverSessionLogoff'],
      },
    ]);
  });

  it('a registry of a set lists the same tools', () => {
    for (const [, set] of SETS) {
      expect(namesOf(registryOf(set).getHandlerGroups())).toEqual(toolsOf(set));
    }
  });

  it('only a write set serves background runs, so only its launcher creates a store', () => {
    expect(
      SETS.map(([kind, set]) => [kind, set.kind, set.backgroundRuns]),
    ).toEqual([
      ['core', 'core', true],
      ['core-ro', 'core-ro', false],
      ['compact', 'compact', true],
      ['compact-ro', 'compact-ro', false],
    ]);
  });

  it('no set lists a tool twice', () => {
    for (const [kind, set] of SETS) {
      const names = toolsOf(set);
      expect({
        kind,
        twice: names.filter((n, i) => names.indexOf(n) !== i),
      }).toEqual({ kind, twice: [] });
    }
  });
});

/**
 * What a `-ro` set must not hold: every tool that writes (the high group,
 * the compact modify half), debugs (the debugger groups), runs in the
 * background (the background-run tools) or resumes a leftover session.
 */
describe('a -ro set holds no write, debugger, background-run or resume tool; a write set holds its -ro set', () => {
  // A high tool the readonly group also defines reads (GetUnitTestResult):
  // the high group's copy replaces it in core, and it is no write.
  const readonlyNames = namesOf([
    new ReadOnlyHandlersGroup(context, new Set(), new ReadVsGetDedupStrategy()),
  ]);
  const FORBIDDEN = {
    write: [
      ...namesOf([new HighLevelHandlersGroup(context)]).filter(
        (n) => !readonlyNames.includes(n),
      ),
      ...compactModifyEntries(() => context).map((e) => e.toolDefinition.name),
    ],
    debug: [
      ...namesOf([new DebugHandlersGroup(context)]),
      ...compactDebugEntries().map((e) => e.toolDefinition.name),
    ],
    background: [
      ...namesOf([new BackgroundRunHandlersGroup(context)]),
      ...compactBackgroundRunEntries().map((e) => e.toolDefinition.name),
    ],
    resume: [
      ResumeLeftoverSession.name,
      HandlerLeftoverSessionResume.name,
    ] as string[],
  };

  it('knows tools of each kind, so the checks below are not vacuous', () => {
    expect(FORBIDDEN.write.length).toBeGreaterThan(9);
    expect(FORBIDDEN.debug.length).toBeGreaterThan(4);
    expect(FORBIDDEN.background).toHaveLength(6);
    expect(FORBIDDEN.resume).toEqual([
      'ResumeLeftoverSession',
      'HandlerLeftoverSessionResume',
    ]);
  });

  it.each([
    ['core-ro', fullReadOnlyToolSet],
    ['compact-ro', compactRo],
  ] as const)('%s holds none of them', (kind, set) => {
    const names = toolsOf(set);
    expect({
      kind,
      write: names.filter((n) => FORBIDDEN.write.includes(n)),
      debug: names.filter((n) => FORBIDDEN.debug.includes(n)),
      background: names.filter((n) => FORBIDDEN.background.includes(n)),
      resume: names.filter((n) => FORBIDDEN.resume.includes(n)),
    }).toEqual({ kind, write: [], debug: [], background: [], resume: [] });
  });

  it.each([
    ['core', fullToolSet],
    ['compact', compact],
  ] as const)('%s holds each kind of them', (kind, set) => {
    const names = toolsOf(set);
    for (const tools of Object.values(FORBIDDEN)) {
      expect({ kind, any: names.some((n) => tools.includes(n)) }).toEqual({
        kind,
        any: true,
      });
    }
  });

  // Writing needs reading. In core a `Read<X>` gives way to the high
  // group's `Get<X>` of the same object (ReadVsGetDedupStrategy), so the
  // read is there under that name.
  it.each([
    ['core', fullToolSet, fullReadOnlyToolSet],
    ['compact', compact, compactRo],
  ] as const)(
    '%s holds every tool of its -ro set, or its high Get<X> for a Read<X>',
    (kind, write, readOnly) => {
      const names = toolsOf(write);
      const held = (n: string) =>
        names.includes(n) ||
        (n.startsWith('Read') &&
          names.includes(`Get${n.slice('Read'.length)}`));
      expect({
        kind,
        missing: toolsOf(readOnly).filter((n) => !held(n)),
      }).toEqual({ kind, missing: [] });
    },
  );
});

/**
 * The run tools in a -ro set (C23, the owner's decision: running code changes
 * no code, as in SAP): served, but without `background` — a -ro set keeps no
 * background run, so the parameter, and its pointer to GetBackgroundRun, do
 * not exist there. The write set's run tools keep it; the shared
 * definitions are not changed.
 */
describe('the run tools of a -ro set offer no background', () => {
  const RUN_TOOLS = ['RuntimeRunClass', 'RuntimeRunProgram'];
  const runTools = (set: ToolSet) =>
    set
      .groups(context)
      .flatMap((g) => g.getHandlers())
      .filter((e) => RUN_TOOLS.includes(e.toolDefinition.name))
      .map((e) => ({
        name: e.toolDefinition.name,
        background: Object.hasOwn(
          (e.toolDefinition.inputSchema as { properties: object }).properties,
          'background',
        ),
        pointer: JSON.stringify(e.toolDefinition).includes('GetBackgroundRun'),
      }));

  it('core-ro: both run tools, neither with background nor its pointer', () => {
    expect(runTools(fullReadOnlyToolSet)).toEqual([
      { name: 'RuntimeRunClass', background: false, pointer: false },
      { name: 'RuntimeRunProgram', background: false, pointer: false },
    ]);
  });

  it('core: both run tools with background, still after core-ro was built', () => {
    runTools(fullReadOnlyToolSet);
    expect(runTools(fullToolSet)).toEqual([
      { name: 'RuntimeRunClass', background: true, pointer: true },
      { name: 'RuntimeRunProgram', background: true, pointer: true },
    ]);
  });
});

/**
 * The binaries duplicate no tool (the owner, C14): the full sets carry no
 * low tool — the fixed list of every tool the low set registered, the three
 * System `*Low` reads included — and no compact tool; the compact sets carry
 * none of the full set's high or low tools. Readonly alone may be in both.
 */
describe('the full and the compact binaries duplicate no tool', () => {
  const LOW_TOOLS = (
    JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '..', '..', '..', 'tools', 'low-to-compact.json'),
        'utf-8',
      ),
    ) as { rows: Array<{ tool: string }> }
  ).rows.map((row) => row.tool);

  const compactNames = new Set([...toolsOf(compact), ...toolsOf(compactRo)]);
  const highNames = namesOf([new HighLevelHandlersGroup(context)]);

  it('knows the 112 low tools and some compact tools, so the checks below are not vacuous', () => {
    expect(LOW_TOOLS).toHaveLength(112);
    expect(LOW_TOOLS).toEqual(
      expect.arrayContaining([
        'GetVirtualFoldersLow',
        'GetNodeStructureLow',
        'GetObjectStructureLow',
      ]),
    );
    expect(compactNames.size).toBeGreaterThan(27);
    expect(highNames.length).toBeGreaterThan(0);
  });

  it.each([
    ['core', fullToolSet],
    ['core-ro', fullReadOnlyToolSet],
  ] as const)('%s carries no low and no compact tool', (kind, set) => {
    const names = toolsOf(set);
    expect(names.length).toBeGreaterThan(0);
    expect({
      kind,
      // The fixed list, and any name in the low set's style: a surviving
      // `…Low` TOOL_DEFINITION registered again under a new name.
      low: names.filter((n) => LOW_TOOLS.includes(n) || n.endsWith('Low')),
      compact: names.filter((n) => compactNames.has(n)),
    }).toEqual({ kind, low: [], compact: [] });
  });

  it('the compact sets carry none of the full set’s high or low tools', () => {
    const names = [...compactNames];
    expect({
      high: names.filter((n) => highNames.includes(n)),
      low: names.filter((n) => LOW_TOOLS.includes(n)),
    }).toEqual({ high: [], low: [] });
  });
});

/** Every binary's own name, by transport and kind. */
const TRANSPORTS: readonly ServedTransport[] = ['stdio', 'http', 'sse'];

/**
 * The removed `--exposition`: one sentence per word, naming the binary of the
 * binary's own transport (C23). Asserted verbatim for every transport.
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
    expect(
      TRANSPORTS.map((t) =>
        Object.values(BINARIES[t]).map((b) => `${b.bin} ${b.pkg}`),
      ),
    ).toEqual([
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
    ]);
  });

  it('the words of each binary (stdio, one per word, verbatim)', () => {
    const words = (family: 'core' | 'compact', value: string) =>
      expositionGoneWords(family, 'stdio', '--exposition', value);
    expect({
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
    }).toEqual({
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
    });
  });

  // Several words: the one asking for the most decides (writes before reads).
  it.each([
    ['readonly,high', 'high'],
    ['readonly,high,debug', 'high'],
    ['readonly,debug', 'debug'],
    ['ro,debug', 'debug'],
    ['rw,debug', 'rw'],
    ['readonly,low', 'low'],
    ['readonly,compact', 'compact'],
    ['readonly,search', 'readonly'],
    [' RO ', 'ro'],
  ])('%j is answered as %s', (value, word) => {
    for (const family of ['core', 'compact'] as const) {
      expect(expositionGoneWords(family, 'http', '--exposition', value)).toBe(
        expected(family, 'http', '--exposition', word),
      );
    }
  });

  // Every set refuses the flag, in both spellings, and the YAML key, before
  // anything is read — each with its family's words and its transport's
  // binaries.
  describe.each(SETS)('%s', (kind, set) => {
    const family = kind.startsWith('compact') ? 'compact' : 'core';
    it.each(TRANSPORTS)(
      '%s: the flag, either spelling, and the YAML key',
      (transport) => {
        const table = {
          program: 'x',
          rows: [],
          removed: [set.expositionRemoved(transport)],
        };
        const refusal = (
          argv: string[],
          yaml: Record<string, unknown> | null = null,
        ) => {
          try {
            refuseRemovedParameters(table, argv, {}, yaml);
          } catch (error) {
            return error instanceof ParameterRefusal ? error.words : 'other';
          }
          return 'started';
        };
        for (const word of ['readonly', 'high', 'debug', 'ro', 'rw', 'low']) {
          expect(refusal([`--exposition=${word}`])).toBe(
            expected(family, transport, '--exposition', word),
          );
          expect(refusal(['--exposition', word])).toBe(
            expected(family, transport, '--exposition', word),
          );
          expect(refusal([], { exposition: word })).toBe(
            expected(family, transport, 'exposition (config file)', word),
          );
        }
        // A YAML list, a bare flag and an empty value stop the start too.
        expect(refusal([], { exposition: ['readonly', 'high'] })).toBe(
          expected(family, transport, 'exposition (config file)', 'high'),
        );
        expect(refusal(['--exposition'])).toBe(
          expected(family, transport, '--exposition', undefined),
        );
        expect(refusal(['--exposition='])).toBe(
          expected(family, transport, '--exposition', undefined),
        );
        expect(refusal(['--exposition', '--mcp=X'])).toBe(
          expected(family, transport, '--exposition', undefined),
        );
        expect(refusal([])).toBe('started');
      },
    );
  });
});

describe('the TOOLS section of each set’s help', () => {
  it.each(TRANSPORTS)(
    '%s: names the binary, what it serves and the other binaries of its transport',
    (transport) => {
      const b = BINARIES[transport];
      for (const [kind, set] of SETS) {
        const help = set.toolsHelp(transport);
        const own = b[kind as keyof typeof b];
        expect(help).toContain(
          `\nTOOLS:\n  ${own.bin} serves one fixed tool set`,
        );
        expect(help).toContain('--exposition is gone in 19.0.0');
        // Every other binary it points at is of the same transport.
        for (const other of Object.values(b)) {
          if (other === own) continue;
          if (help.includes(`${other.pkg},`)) {
            expect(help).toContain(
              `npm i -g ${other.pkg}, then ${other.bin}\n`,
            );
          }
        }
        for (const t of TRANSPORTS) {
          if (t === transport) continue;
          for (const other of Object.values(BINARIES[t])) {
            expect(help).not.toContain(`npm i -g ${other.pkg},`);
          }
        }
      }
    },
  );

  it('a -ro help names its write binary; a write help its -ro binary', () => {
    expect(fullToolSet.toolsHelp('stdio')).toContain(
      'npm i -g @mcp-abap-adt/core-ro, then mcp-abap-adt-ro',
    );
    expect(fullReadOnlyToolSet.toolsHelp('sse')).toContain(
      'npm i -g @mcp-abap-adt/sse, then mcp-abap-adt-sse',
    );
    expect(compact.toolsHelp('http')).toContain(
      'npm i -g @mcp-abap-adt/compact-http-ro, then mcp-abap-adt-compact-http-ro',
    );
    expect(compactRo.toolsHelp('stdio')).toContain(
      'npm i -g @mcp-abap-adt/compact, then mcp-abap-adt-compact',
    );
  });
});
