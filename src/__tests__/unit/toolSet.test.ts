/**
 * The tool-set contract (spec §3.4, §3.5, D37, D49): a launcher serves the
 * groups its `ToolSet` builds for the exposition, and nothing else of the
 * tools is a launcher's.
 *
 * - `fullToolSet` builds today's groups: readonly (with system), high, low,
 *   debug and search, in today's order and with today's tools, and the
 *   leftover-session tools last, on every exposition;
 * - `compactToolSetOf({ readOnly, modify })`, given the two halves' entry
 *   builders, builds today's compact groups — `ro` the read-only half, `rw`
 *   both, `debug` the four verbs beside either, the three leftover-session
 *   tools beside every exposition — and refuses an empty or an
 *   unknown `--exposition` in today's words, verbatim.
 */

import {
  CompactModifyHandlersGroup,
  compactModifyEntries,
} from '@mcp-abap-adt/compact-modify';
import {
  CompactReadOnlyHandlersGroup,
  compactReadOnlyEntries,
} from '@mcp-abap-adt/compact-readonly';
import { CompactLeftoverSessionHandlersGroup } from '../../lib/compact/session/group';
import { ParameterRefusal } from '../../lib/config/index';
import {
  DebugHandlersGroup,
  HighLevelHandlersGroup,
  LeftoverSessionHandlersGroup,
  LowLevelHandlersGroup,
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
  compactToolSetOf,
  fullToolSet,
  registryOf,
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

/** The groups the launchers built before A7, for an exposition of the full set. */
function todaysFullGroups(exposition: readonly string[]): IHandlerGroup[] {
  const overriding: IHandlerGroup[] = [];
  if (exposition.includes('high'))
    overriding.push(new HighLevelHandlersGroup(context));
  if (exposition.includes('low'))
    overriding.push(new LowLevelHandlersGroup(context));
  if (exposition.includes('debug'))
    overriding.push(new DebugHandlersGroup(context));
  const names = new Set<string>();
  for (const group of overriding) {
    for (const entry of group.getHandlers())
      names.add(entry.toolDefinition.name);
  }
  const groups: IHandlerGroup[] = [];
  if (exposition.includes('readonly')) {
    groups.push(
      new ReadOnlyHandlersGroup(context, names, new ReadVsGetDedupStrategy()),
    );
    groups.push(new SystemHandlersGroup(context));
  }
  groups.push(
    ...overriding,
    new SearchHandlersGroup(context),
    new LeftoverSessionHandlersGroup(context),
  );
  return groups;
}

/** The exposition a set reads from `argv` alone (no config file). */
const exposed = (set: ToolSet, argv: string[]) =>
  set.exposition(undefined, argv, 'stdio');

describe('fullToolSet', () => {
  it.each([
    [['readonly', 'high']],
    [['readonly']],
    [['readonly', 'low']],
    [['high']],
    [['readonly', 'debug']],
    [['readonly', 'high', 'debug']],
  ])('builds today’s groups for %j', (exposition) => {
    expect(shape(fullToolSet.groups(context, exposition))).toEqual(
      shape(todaysFullGroups(exposition)),
    );
  });

  it('a registry of its groups lists the same tools', () => {
    const registry = registryOf(fullToolSet, ['readonly', 'high']);
    expect(
      registry
        .getHandlerGroups()
        .flatMap((group) =>
          group.getHandlers().map((entry) => entry.toolDefinition.name),
        ),
    ).toEqual(
      shape(todaysFullGroups(['readonly', 'high'])).flatMap((g) => g.tools),
    );
  });

  it('defaults to readonly,high, as today', () => {
    expect(fullToolSet.expositionRow.default).toEqual(['readonly', 'high']);
    expect(fullToolSet.exposition(['readonly', 'high'], [], 'stdio')).toEqual([
      'readonly',
      'high',
    ]);
  });

  it('refuses high beside low in today’s words', () => {
    expect(() => fullToolSet.exposition(['high', 'low'], [], 'stdio')).toThrow(
      new ParameterRefusal(
        "Invalid exposition: 'high' and 'low' are mutually exclusive",
      ),
    );
  });

  // Each transport's compact binary (D49): never the stdio one for HTTP or SSE.
  it.each([
    ['stdio', 'mcp-abap-adt-compact', '@mcp-abap-adt/compact'],
    ['http', 'mcp-abap-adt-compact-http', '@mcp-abap-adt/compact-http'],
    ['sse', 'mcp-abap-adt-compact-sse', '@mcp-abap-adt/compact-sse'],
  ] as const)(
    '%s: compact, ro and rw name %s; the help names it too',
    (transport, bin, pkg) => {
      expect(() => fullToolSet.exposition(['compact'], [], transport)).toThrow(
        new ParameterRefusal(
          `Invalid exposition: 'compact' is served by ${pkg}, which is its own command with the compact tool list as its default. Install it and run \`${bin}\`, or drop \`compact\` from this exposition.`,
        ),
      );
      for (const word of ['ro', 'rw']) {
        expect(() =>
          fullToolSet.exposition(['readonly', word], [], transport),
        ).toThrow(
          new ParameterRefusal(
            `Invalid exposition: '${word}' is not a set of this command, which takes readonly, high, low and debug, comma-separated. 'ro' and 'rw' are the sets of \`${bin}\` (${pkg}).`,
          ),
        );
      }
      const help = fullToolSet.expositionHelp(transport);
      expect(help).toContain(`npm i -g ${pkg}\n`);
      expect(help).toContain(`  ${bin}\n`);
    },
  );

  // 17.x dropped an unknown word silently: `--exposition=ro` served readonly,high.
  it.each(['search', 'system', 'all', 'readonly-x'])(
    'refuses an unknown word (%s) instead of dropping it',
    (word) => {
      expect(() => fullToolSet.exposition([word], [], 'http')).toThrow(
        new ParameterRefusal(
          `Invalid exposition: '${word}' is not a set of this command, which takes readonly, high, low and debug, comma-separated.`,
        ),
      );
    },
  );

  it('its examples name the binary and its sets', () => {
    const examples = fullToolSet.expositionExamples('mcp-abap-adt-http');
    expect(examples).toContain('mcp-abap-adt-http --exposition=readonly\n');
    expect(examples).not.toContain('--exposition=ro\n');
  });
});

/** The compact leftover-session group, beside every compact exposition. */
const LEFTOVER = {
  group: 'CompactLeftoverSessionHandlers',
  tools: [
    'HandlerLeftoverSessionList',
    'HandlerLeftoverSessionResume',
    'HandlerLeftoverSessionLogoff',
  ],
};

describe('compactToolSetOf, with the two halves', () => {
  const compact = compactToolSetOf({
    readOnly: compactReadOnlyEntries,
    modify: compactModifyEntries,
  });
  const groupsFor = (argv: string[]) =>
    compact.groups(context, exposed(compact, argv));

  it('ro: today’s read-only half, alone', () => {
    expect(shape(groupsFor(['--exposition=ro']))).toEqual(
      shape([
        new CompactReadOnlyHandlersGroup(context),
        new CompactLeftoverSessionHandlersGroup(context),
      ]),
    );
    expect(
      groupsFor(['--exposition=ro'])[0]
        .getHandlers()
        .map((e) => e.toolDefinition.name),
    ).toHaveLength(16);
  });

  it('rw, and no flag: both halves, all 27, in one group', () => {
    const both = [
      ...new CompactReadOnlyHandlersGroup(context).getHandlers(),
      ...new CompactModifyHandlersGroup(context).getHandlers(),
    ].map((entry) => entry.toolDefinition.name);
    for (const argv of [['--exposition=rw'], []]) {
      expect(shape(groupsFor(argv))).toEqual([
        { group: 'CompactHandlers', tools: both },
        LEFTOVER,
      ]);
    }
    expect(both).toHaveLength(27);
  });

  it('debug beside either: the four verbs after the half, and no search', () => {
    expect(
      shape(groupsFor(['--exposition=ro,debug'])).map((g) => g.group),
    ).toEqual([
      'CompactReadOnlyHandlers',
      'CompactDebugHandlers',
      'CompactLeftoverSessionHandlers',
    ]);
    expect(shape(groupsFor(['--exposition=rw,debug']))[1]).toEqual({
      group: 'CompactDebugHandlers',
      tools: [
        'HandlerDebugStart',
        'HandlerDebugWait',
        'HandlerDebugView',
        'HandlerDebugStep',
      ],
    });
  });

  it('defaults to rw', () => {
    expect(compact.expositionRow.default).toEqual(['rw']);
    expect(compact.exposition(undefined, [], 'stdio')).toEqual(['rw']);
  });

  it.each([
    ['--exposition='],
    ['--exposition', ''],
    ['--exposition'],
    ['--exposition=ro', '--exposition='],
  ])('refuses an empty value in today’s words: %j', (...argv) => {
    expect(() => exposed(compact, argv)).toThrow(
      new ParameterRefusal(
        "--exposition was given no value. This command takes 'ro' (the 16 tools that change nothing) or 'rw' (all 27), and 'debug' beside either. An empty value is refused rather than defaulted: an unset shell variable must not silently open the write tools.",
      ),
    );
  });

  it.each(['readonly', 'high', 'low', 'compact', 'all'])(
    'refuses %s in today’s words',
    (word) => {
      expect(() => exposed(compact, [`--exposition=${word}`])).toThrow(
        new ParameterRefusal(
          `--exposition=${word} is not a compact set. This command takes 'ro' (the 16 tools that change nothing) or 'rw' (all 27, the default), and 'debug' beside either. The sets readonly/high/low belong to \`mcp-abap-adt\`.`,
        ),
      );
    },
  );

  it('refuses debug alone in today’s words', () => {
    expect(() => exposed(compact, ['--exposition=debug'])).toThrow(
      new ParameterRefusal(
        "--exposition=debug alone names no half of the facade: add 'ro' or 'rw' beside it (for example ro,debug).",
      ),
    );
  });

  it('reads the config file’s value with the same parser when no flag is given', () => {
    expect(compact.exposition(['ro', 'debug'], [], 'stdio')).toEqual([
      'ro',
      'debug',
    ]);
    expect(() => compact.exposition(['readonly', 'high'], [], 'stdio')).toThrow(
      /--exposition=readonly is not a compact set/,
    );
    // The flag, when given, wins over the file.
    expect(compact.exposition(['ro'], ['--exposition=rw'], 'stdio')).toEqual([
      'rw',
    ]);
  });

  it('its examples name the binary and its sets, never the full ones', () => {
    const examples = compact.expositionExamples('mcp-abap-adt-compact-sse');
    expect(examples).toContain('mcp-abap-adt-compact-sse --exposition=ro\n');
    expect(examples).toContain(
      'mcp-abap-adt-compact-sse --exposition=rw,debug\n',
    );
    expect(examples).not.toContain('readonly');
  });

  it('its row validates a config file’s value with the same parser', () => {
    const parse = compact.expositionRow.parse;
    expect(parse?.('ro,debug', 'exposition (config file)')).toEqual([
      'ro',
      'debug',
    ]);
    expect(parse?.(['rw'], 'exposition (config file)')).toEqual(['rw']);
    expect(() => parse?.('readonly,high', 'exposition (config file)')).toThrow(
      /is not a compact set/,
    );
  });
});
