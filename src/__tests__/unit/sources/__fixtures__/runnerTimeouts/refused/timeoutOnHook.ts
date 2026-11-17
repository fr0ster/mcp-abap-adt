// `{ timeout }` on each hook, and on a hook of the test context.
import { after, afterEach, before, beforeEach, test } from 'node:test';

before(() => {}, { timeout: 1000 });
after(() => {}, { timeout: 1000 });
beforeEach(() => {}, { timeout: 1000 });
afterEach(() => {}, { timeout: 1000 });
test('with a hook of its own', async (t) => {
  t.beforeEach(() => {}, { timeout: 1000 });
  await t.test('inner', () => {});
});
