// `{ timeout }` on a `test`, in each form node:test takes options in: after a
// name, alone, on a modifier, spread, shorthand, a quoted key, through an
// alias and the default import, and on a subtest of the test context.
import nodeTest, { test as check, test } from 'node:test';

const timeout = 1000;

test('named', { timeout: 1000 }, () => {});
test({ timeout: 1000 }, () => {});
test.skip('skipped', { timeout: 1000 });
test.only('focused', { ...{ timeout: 1000 } }, () => {});
test('shorthand', { timeout }, () => {});
check('aliased', { timeout: 1000 }, () => {});
nodeTest('default import', { 'timeout': 1000 }, () => {});
test('a subtest', async (t) => {
  await t.test('inner', { timeout: 1000 }, () => {});
});
