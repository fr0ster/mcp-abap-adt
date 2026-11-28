/**
 * No soft-mode suite keeps a lock handle or a created name of its own
 * (#394, spec §3, §5): the lock registry and the owned-object record are the
 * one place, so a handle is never dropped before its release reached SAP and
 * a delete is never sent twice. Plain code over our own sources.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { repositoryRoot } from '../../helpers/repoRoot';

const ROOT = repositoryRoot(__dirname);
const INTEGRATION = path.join(ROOT, 'src', '__tests__', 'integration');

/** Every `.ts` file under `dir`. */
function sources(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sources(full));
    else if (entry.name.endsWith('.ts')) found.push(full);
  }
  return found;
}

/** The suites and fixtures this task moved onto the records. */
const MOVED = [
  'high/include/IncludeHighHandlers.test.ts',
  'high/table_type/TableTypeHighHandlers.test.ts',
  'helpers/rapFixtures.ts',
];

describe('soft-mode bookkeeping lives in the records', () => {
  it('no integration source keeps a `heldLock` variable of its own', () => {
    const offenders = sources(INTEGRATION).filter((file) =>
      fs.readFileSync(file, 'utf8').includes('let heldLock'),
    );
    assert.deepEqual(offenders, []);
  });

  it('the moved suites keep no created list and no forget', () => {
    for (const relative of MOVED) {
      const text = fs.readFileSync(path.join(INTEGRATION, relative), 'utf8');
      assert.equal(text.includes('created.push('), false, relative);
      assert.equal(text.includes('forget('), false, relative);
    }
  });

  it('the moved suites go through the records', () => {
    const suites = MOVED.filter((relative) => relative.endsWith('.test.ts'));
    for (const relative of suites) {
      const text = fs.readFileSync(path.join(INTEGRATION, relative), 'utf8');
      assert.equal(text.includes('softSteps('), true, relative);
    }
    const fixtures = fs.readFileSync(
      path.join(INTEGRATION, 'helpers/rapFixtures.ts'),
      'utf8',
    );
    assert.equal(fixtures.includes('heldLocksOf('), true);
    assert.equal(fixtures.includes('ownedObjectsOf('), true);
  });
});
