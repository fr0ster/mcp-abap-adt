// `{ timeout }` on an `it`, plain and on its modifiers.
import { describe, it } from 'node:test';

describe('cases', () => {
  it('plain', { timeout: 1000 }, () => {});
  it.skip('skipped', { timeout: 1000 }, () => {});
  it.todo('to do', { timeout: 1000 });
});
