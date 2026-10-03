import http from 'node:http';
import net from 'node:net';
import { browserCallbackStrategy } from '@mcp-abap-adt/auth-providers';
import type {
  AuthorizationRequest,
  IAuthorizationStrategy,
} from '@mcp-abap-adt/interfaces-auth';
import { LoginLock, oneLoginAtATime } from '../../../lib/auth/loginLock';

const request = {} as AuthorizationRequest;

function controlled(log: string[], name: string) {
  let settle!: (ok: boolean) => void;
  const strategy: IAuthorizationStrategy<string> = {
    authorize: () => {
      log.push(`start ${name}`);
      return new Promise((resolve, reject) => {
        settle = (ok) => {
          log.push(`end ${name}`);
          ok
            ? resolve({ payload: name, redirectUri: 'r' })
            : reject(new Error(name));
        };
      });
    },
  };
  return { strategy, settle: (ok: boolean) => settle(ok) };
}

const tick = () => new Promise((r) => setTimeout(r, 15));

describe('oneLoginAtATime', () => {
  it('starts the second login only after the first settles (resolve), a third behind the second (reject)', async () => {
    const log: string[] = [];
    const lock = new LoginLock();
    const a = controlled(log, 'a');
    const b = controlled(log, 'b');
    const c = controlled(log, 'c');
    const pa = oneLoginAtATime(a.strategy, lock).authorize(request);
    const pb = oneLoginAtATime(b.strategy, lock).authorize(request);
    const pc = oneLoginAtATime(c.strategy, lock).authorize(request);
    const rb = expect(pb).rejects.toThrow('b');
    await tick();
    expect(log).toEqual(['start a']);
    a.settle(true);
    await pa;
    await tick();
    expect(log).toEqual(['start a', 'end a', 'start b']);
    b.settle(false);
    await rb;
    await tick();
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c']);
    c.settle(true);
    await pc;
  });

  it('passes dispose through when the strategy has one, and has none otherwise', async () => {
    const lock = new LoginLock();
    const dispose = jest.fn(async () => undefined);
    const withDispose = oneLoginAtATime(
      { authorize: async () => ({ payload: '', redirectUri: '' }), dispose },
      lock,
    );
    await withDispose.dispose?.();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(
      oneLoginAtATime(
        { authorize: async () => ({ payload: '', redirectUri: '' }) },
        lock,
      ).dispose,
    ).toBeUndefined();
  });
});

// The port, asserted on the socket: no log line proves a socket was released.
describe('oneLoginAtATime on a real port', () => {
  function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const s = net.createServer();
      s.once('error', reject);
      s.listen(0, () => {
        const { port } = s.address() as net.AddressInfo;
        s.close(() => resolve(port));
      });
    });
  }

  /** Binds the port; resolves when it is free to bind, then releases it. */
  function bindAndRelease(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const s = net.createServer();
      s.once('error', reject);
      s.listen(port, () => s.close(() => resolve()));
    });
  }

  function get(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      http
        .get(url, (res) => {
          res.resume();
          res.on('end', () => resolve());
        })
        .on('error', reject);
    });
  }

  /** A real strategy whose "browser" requests the callback itself. */
  function strategyOn(port: number, code: string, log: string[]) {
    return browserCallbackStrategy({
      port,
      timeoutMs: 5000,
      browser: 'system',
      openUrl: async (_url, _browser, redirectUri) => {
        log.push(`open ${code}`);
        await get(`${redirectUri}?code=${code}`);
      },
    });
  }

  const request = {
    buildAuthorizationUrl: async (redirectUri: string) => redirectUri,
  } as AuthorizationRequest;

  it('two logins on one port both succeed, and the port is free between them', async () => {
    const port = await freePort();
    const lock = new LoginLock();
    const log: string[] = [];
    const first = oneLoginAtATime(strategyOn(port, 'one', log), lock);
    const second = oneLoginAtATime(strategyOn(port, 'two', log), lock);

    const a = await first.authorize(request);
    expect(a.payload).toBe('one');
    await bindAndRelease(port); // would reject with EADDRINUSE if still held

    const b = await second.authorize(request);
    expect(b.payload).toBe('two');
    await bindAndRelease(port);
    expect(log).toEqual(['open one', 'open two']);
  });

  it('started together, the second binds only after the first released', async () => {
    const port = await freePort();
    const lock = new LoginLock();
    const log: string[] = [];
    const results = await Promise.all([
      oneLoginAtATime(strategyOn(port, 'one', log), lock).authorize(request),
      oneLoginAtATime(strategyOn(port, 'two', log), lock).authorize(request),
    ]);
    expect(results.map((r) => r.payload)).toEqual(['one', 'two']);
    expect(log).toEqual(['open one', 'open two']);
    await bindAndRelease(port);
  });
});
