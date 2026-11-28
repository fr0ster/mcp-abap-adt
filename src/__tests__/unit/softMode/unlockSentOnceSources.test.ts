/**
 * Every soft-mode suite that sends an unlock itself sends it once (#394,
 * second review): before the unlock leaves, the suite hands it over — to the
 * registry (`unlockSending`, `run.unlock`, `locks.unlockSent`) or by
 * clearing the handle its after hook would release — so no cleanup sends
 * it again. Plain code over our own sources.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { repositoryRoot } from '../../helpers/repoRoot';

const INTEGRATION = path.join(
  repositoryRoot(__dirname),
  'src',
  '__tests__',
  'integration',
);
const read = (relative: string) =>
  fs.readFileSync(path.join(INTEGRATION, relative), 'utf8');

describe('a suite sends its own unlock once', () => {
  it('the top-level package suite clears its after-hook handle before the unlock in soft mode', () => {
    const text = read('coverage/topLevelPackage.live.test.ts');
    const cleared = text.indexOf('if (!isHardModeEnabled()) held = undefined;');
    const unlock = text.indexOf(
      "succeeded('HandlerUnlock', await unlock(handle));",
    );
    assert.ok(cleared > 0 && unlock > cleared);
  });

  it('the text-element and table-settings suites mark the unlock before it leaves', () => {
    for (const file of [
      'coverage/textElements.live.test.ts',
      'coverage/tableSettings.live.test.ts',
    ]) {
      const text = read(file);
      const unlocks = text.split("action: 'unlock'").length - 1;
      const marked = text.split('unlockSending(String(handle));').length - 1;
      assert.equal(marked, unlocks, file);
    }
  });
});
