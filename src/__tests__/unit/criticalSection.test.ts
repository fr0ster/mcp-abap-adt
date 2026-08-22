/**
 * Unit tests: withCriticalSection / isMutatingToolName.
 * The wrapper must bracket a mutating handler with the connection's
 * begin/endCriticalSection() — including on throw — so a lock → modify →
 * unlock chain runs uninterruptibly. Feature-detected: a connection without
 * the methods is a no-op.
 */
import {
  isMutatingToolName,
  withCriticalSection,
} from '../../lib/criticalSection';

describe('isMutatingToolName', () => {
  it('matches Create/Update/Delete tools', () => {
    for (const n of [
      'CreateDomain',
      'UpdateMessageClass',
      'DeleteMessageClassMessage',
    ]) {
      expect(isMutatingToolName(n)).toBe(true);
    }
  });
  it('does not match read/activate tools', () => {
    for (const n of ['GetDomain', 'ReadTable', 'ActivateClass', 'GetSession']) {
      expect(isMutatingToolName(n)).toBe(false);
    }
  });
});

describe('withCriticalSection', () => {
  it('calls begin before and end after the handler (success path)', async () => {
    const calls: string[] = [];
    const conn = {
      beginCriticalSection: () => calls.push('begin'),
      endCriticalSection: () => calls.push('end'),
    };
    const handler = async (_ctx: unknown, _args: unknown) => {
      calls.push('handler');
      return { ok: true };
    };

    const wrapped = withCriticalSection(handler, () => conn);
    const res = await wrapped({} as any, {});

    expect(res).toEqual({ ok: true });
    expect(calls).toEqual(['begin', 'handler', 'end']);
  });

  it('still calls end when the handler throws', async () => {
    const calls: string[] = [];
    const conn = {
      beginCriticalSection: () => calls.push('begin'),
      endCriticalSection: () => calls.push('end'),
    };
    const handler = async (_ctx: unknown, _args: unknown) => {
      calls.push('handler');
      throw new Error('boom');
    };

    const wrapped = withCriticalSection(handler, () => conn);
    await expect(wrapped({} as any, {})).rejects.toThrow('boom');
    expect(calls).toEqual(['begin', 'handler', 'end']);
  });

  it('is a no-op on a connection lacking the methods (older connection)', async () => {
    const handler = async () => 'ok';
    const wrapped = withCriticalSection(handler, () => ({}) as unknown);
    await expect(wrapped()).resolves.toBe('ok');
  });

  it('tolerates a null/undefined connection', async () => {
    const handler = async () => 'ok';
    const wrapped = withCriticalSection(handler, () => undefined);
    await expect(wrapped()).resolves.toBe('ok');
  });
});
