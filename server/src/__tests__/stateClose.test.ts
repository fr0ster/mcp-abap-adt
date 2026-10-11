import { closeInstanceState } from '../stateClose.js';

describe('closeInstanceState (the stdio close)', () => {
  it('resolves when nothing is left', async () => {
    await expect(
      closeInstanceState({ shutdownState: async () => [] }),
    ).resolves.toBeUndefined();
  });
  it('rejects with state cleanup failed and what was left', async () => {
    await expect(
      closeInstanceState({ shutdownState: async () => ['a', 'b'] }),
    ).rejects.toThrow('state cleanup failed: a; b');
  });
});
