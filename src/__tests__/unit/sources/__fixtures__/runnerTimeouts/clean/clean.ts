// What the scan accepts in a node:test file: options without `timeout`, a
// `timeout` given to work that is not a test or a hook — a function, a method
// named like a test function on an object that is not node:test's —, a timer,
// and the word in a string or a name.
import { after, describe, it, test } from 'node:test';

function send(_url: string, _options: { timeout: number }): void {}
const client = {
  test(_options: { timeout: number }): void {},
  before(_options: { timeout: number }): void {},
};

const words = 'no { timeout } and no --test-timeout here';

describe('cases', { concurrency: 1 }, () => {
  it('passes a timeout to its own work', () => {
    send('http://localhost/', { timeout: 1000 });
    const bound = { timeout: 1000 };
    client.test(bound);
    client.before({ timeout: 1000 });
  });
  it('waits on a timer', async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
  });
  it('names the word', { skip: false }, () => {
    const timeout = words.length;
    send(words, { timeout });
  });
});
test('a subtest', async (t) => {
  await t.test('inner', { only: false }, () => {});
  await t.waitFor(() => true, { timeout: 1000 });
});
after(() => {});
