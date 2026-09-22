import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
const COMPACT = join(__dirname, '../../handlers/compact/high');

const handlers = readdirSync(COMPACT).filter(
  (name) => name.startsWith('handleHandler') && name.endsWith('.ts'),
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

  it.each(handlers)('%s says where PROGRAM works, if it offers one', (name) => {
    const source = readFileSync(join(COMPACT, name), 'utf8');
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
  });
});
