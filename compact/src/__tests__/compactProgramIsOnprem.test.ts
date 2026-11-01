import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';

/**
 * A compact tool offered on cloud must not offer PROGRAM without saying where
 * it works.
 *
 * ABAP Cloud has no programs — `RuntimeRunProgram` and its profiling sibling
 * are `['onprem']`, and nothing creates, locks or checks one there. The
 * compact tools are nevertheless declared for both, deliberately: the pattern
 * is to declare broad and let the platform-specific path fail on the server
 * rather than hide a whole tool from a system where most of it works.
 *
 * **That pattern only holds up if the description says so.** A caller reading
 * `PROGRAM(object_name*)` on a cloud system has been told it is available and
 * finds out otherwise from a refusal. `HandlerCreate` and `HandlerGet` marked
 * it; `HandlerLock`, `HandlerUnlock`, `HandlerCheckRun`, `HandlerValidate`
 * and (as added) `HandlerProfileRun` did not — the convention was applied to
 * half the tools that needed it, which is how a convention stops being one.
 *
 * Read from the sources rather than from a list kept here, so a new compact
 * tool offering PROGRAM is covered the day it is written.
 */
// The compact tools live in two packages now, so the scan covers both halves.
const COMPACT_DIRS = [
  join(__dirname, '../../../compact-readonly-entries/src/handlers'),
  join(__dirname, '../../../compact-modify/src/handlers'),
];

/** Every compact tool file, as `[label, absolute path]`. */
const handlers: Array<[string, string]> = COMPACT_DIRS.flatMap((dir) =>
  readdirSync(dir)
    .filter((name) => name.startsWith('handleHandler') && name.endsWith('.ts'))
    .map((name) => [name, join(dir, name)] as [string, string]),
);

/** The `description:` string of a tool definition, as written. */
function descriptionOf(source: string): string {
  const found = source.match(/description:\s*\n?\s*'((?:[^'\\]|\\.)*)'/);
  return found ? found[1] : '';
}

function availabilityOf(source: string): string {
  const found = source.match(/available_in:\s*\[([^\]]*)\]/);
  return found ? found[1] : '';
}

describe('compact tools that mention PROGRAM', () => {
  it('finds the tools to check, so the assertion is not vacuous', () => {
    expect(handlers.length).toBeGreaterThan(10);
  });

  it.each(handlers)(
    '%s says where PROGRAM works, if it offers one',
    (name, file) => {
      const source = readFileSync(file, 'utf8');
      const description = descriptionOf(source);
      // `\bPROGRAM\b`, not `PROGRAM\(`. The first version of this test looked
      // for the parenthesised form every lifecycle tool uses —
      // `PROGRAM(object_name*)` — and silently skipped `HandlerProfileRun`,
      // which writes `target_type*(CLASS|PROGRAM)`. It passed with the marker
      // removed: a guard that checks nothing, in a file about guards that check
      // nothing.
      const offersProgram = /\bPROGRAM\b/.test(description);
      const onCloud = availabilityOf(source).includes('cloud');
      if (!offersProgram || !onCloud) return;

      expect({ name, marked: /onprem only/.test(description) }).toEqual({
        name,
        marked: true,
      });
    },
  );
});

/**
 * An include on ABAP cloud is read, checked for deletion and asked where it
 * is used — and nothing else: no create, write, lock, validation or
 * activation of one is offered there. Read from the tools' own cloud
 * statements, so a member a cloud list gains is caught the day it is added.
 */
describe('compact tools that offer INCLUDE on ABAP cloud', () => {
  // No handler runs here: only the definitions are read.
  const context = (): HandlerContext => {
    throw new Error('no handler runs in this test');
  };
  const entries = [
    ...compactReadOnlyEntries(context),
    ...compactModifyEntries(context),
  ];

  /** The enum values of the tool's `object_type` on `variant`, if it has one. */
  const membersOn = (
    entry: (typeof entries)[number],
    variant: 'onprem' | 'cloud',
  ): readonly string[] => {
    const stated = entry.toolDefinition.variants?.[variant];
    const values: unknown = stated?.inputSchema?.properties?.object_type?.enum;
    return Array.isArray(values)
      ? values.filter((value) => typeof value === 'string')
      : [];
  };

  it('finds tools that offer INCLUDE on premise, so the check is not vacuous', () => {
    expect(
      entries.filter((entry) => membersOn(entry, 'onprem').includes('INCLUDE'))
        .length,
    ).toBeGreaterThan(5);
  });

  it('offers it only where cloud serves it', () => {
    expect(
      entries
        .filter((entry) => membersOn(entry, 'cloud').includes('INCLUDE'))
        .map((entry) => entry.toolDefinition.name)
        .sort(),
    ).toEqual(['HandlerDeletionCheck', 'HandlerWhereUsed']);
  });
});
