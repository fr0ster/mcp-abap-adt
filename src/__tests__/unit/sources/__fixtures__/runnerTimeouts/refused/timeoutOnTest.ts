// `{ timeout }` on a `test`, in each form node:test takes options in: after a
// name, alone, on a modifier, spread, shorthand, a quoted key, through an
// alias and the default import, on a subtest of the test context, and held
// in a variable: an object, a union of objects, a function held in a
// variable.
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
const options = { timeout: 1000 };
test('held in a variable', options, () => {});
// A union not every member of which has `timeout`: as a parameter, so no
// assignment narrows it.
function withEither(either: { timeout: number } | { concurrency: number }) {
  test('held in a union', either, () => {});
}
withEither({ concurrency: 1 });
const held = test;
held('a test held in a variable', { timeout: 1000 }, () => {});
// An index signature the key `timeout` fits: the type names no `timeout`,
// the value holds one.
const indexed: { concurrency: number; [key: string]: number } = {
  concurrency: 1,
  timeout: 1000,
};
test('bounded through an index signature', indexed, () => {});
const patterned: { [key: `time${string}`]: number } = { timeout: 1000 };
test('bounded through a template index signature', patterned, () => {});
