import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';

/** A success carrying whatever a result strategy would have produced. */
export function okResponse<T>(value: T): IAdtResponse<T, IAdtError> {
  return {
    ok: true,
    getResult: () => ({ value }),
    getError: () => {
      throw new Error('asked for the error of a success');
    },
  } as unknown as IAdtResponse<T, IAdtError>;
}

/** A refusal shaped the way a strategy from the package builds one. */
export function refusedResponse(
  message: string,
  extra: Partial<IAdtError> = {},
): IAdtResponse<never, IAdtError> {
  return {
    ok: false,
    getResult: () => {
      throw new Error('asked for the result of a failure');
    },
    getError: () => ({ message, origin: 'refusal', ...extra }),
  } as unknown as IAdtResponse<never, IAdtError>;
}

/** A reading, mirroring what invoking one of the result strategies produces. */
export const reading = <T>(
  value: T,
  raw = String(value ?? ''),
  status = 200,
) => ({ value, raw, status });

type Members = Record<string, (...args: unknown[]) => unknown>;

/**
 * A client whose every factory answers the same member table.
 *
 * Handlers reach members through `client.getX(results)`, and a test does not
 * care which X. Anything not named answers a success with `undefined`, so a
 * test says only what it is about.
 *
 * **Known limitation:** The outer proxy ignores the factory name (getX), so every
 * factory accessor returns the same member table. A test can therefore exercise
 * a handler that calls the wrong factory, or calls a member never named, without
 * the test failing — only an explicit assertion on the call will catch it.
 */
export function fakeClientOf(members: Members) {
  const object = new Proxy(members, {
    get: (target, name: string) =>
      target[name] ?? (async () => okResponse(undefined)),
  });
  return new Proxy({} as Record<string, unknown>, {
    get: () => () => object,
  });
}

/** A client that refuses whatever it is asked. */
export function refusingClient(
  message: string,
  extra: Partial<IAdtError> = {},
) {
  return new Proxy({} as Record<string, unknown>, {
    get: () => () =>
      new Proxy({} as Members, {
        get: () => async () => refusedResponse(message, extra),
      }),
  });
}

/**
 * Which `analyse` the handler passed, and how often a member was called.
 *
 * What goes wrong at the scale of a hundred handlers is a handler taking the
 * wrong strategy, and that is visible from the call rather than from the answer.
 */
export function recordAnalyse() {
  const calls: Array<{
    member: string;
    analyse: unknown;
    carriedAnalyse: boolean;
    args: unknown[];
  }> = [];
  const client = new Proxy({} as Record<string, unknown>, {
    get: () => () =>
      new Proxy({} as Members, {
        get:
          (_t, member: string) =>
          async (...args: unknown[]) => {
            const lastArg = args.at(-1);
            const carriedAnalyse =
              typeof lastArg === 'object' &&
              lastArg !== null &&
              'analyse' in lastArg;
            calls.push({
              member,
              analyse: carriedAnalyse ? (lastArg as any).analyse : undefined,
              carriedAnalyse,
              args,
            });
            return okResponse(reading(undefined, '', 200));
          },
      }),
  });
  return {
    client,
    calls,
    get last() {
      const lastCall = calls.at(-1);
      return lastCall
        ? { analyse: lastCall.analyse, carriedAnalyse: lastCall.carriedAnalyse }
        : undefined;
    },
    countOf: (member: string) =>
      calls.filter((c) => c.member === member).length,
  };
}
