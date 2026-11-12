// `{ timeout }` on a `describe`, its alias `suite`, and a modifier.
import { describe, it, suite } from 'node:test';

describe('a suite', { timeout: 1000 }, () => {
  it('runs', () => {});
});
suite('its alias', { timeout: 1000 }, () => {
  it('runs', () => {});
});
describe.only('focused', { timeout: 1000 }, () => {
  it('runs', () => {});
});
