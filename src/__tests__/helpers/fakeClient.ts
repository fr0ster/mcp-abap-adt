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

/** A reading, as `resultsFor` would have built it. */
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
  const calls: Array<{ member: string; analyse: unknown; args: unknown[] }> =
    [];
  const client = new Proxy({} as Record<string, unknown>, {
    get: () => () =>
      new Proxy({} as Members, {
        get:
          (_t, member: string) =>
          async (...args: unknown[]) => {
            const options = args.at(-1) as { analyse?: unknown } | undefined;
            calls.push({ member, analyse: options?.analyse, args });
            return okResponse(reading(undefined, '', 200));
          },
      }),
  });
  return {
    client,
    calls,
    get last() {
      return calls.at(-1)?.analyse;
    },
    countOf: (member: string) =>
      calls.filter((c) => c.member === member).length,
  };
}
