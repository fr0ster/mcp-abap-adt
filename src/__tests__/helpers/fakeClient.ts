import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';

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

/**
 * `fakeClientOf`, with the one thing its own doc comment names as missing:
 * which factory (`getX`) was actually asked for.
 *
 * A read-modify-write handler (`readMetadata` then `updateMetadata`) is
 * exactly the shape `fakeClientOf`'s blindness can hide a real defect
 * behind: two families can carry the identical `{readMetadata,
 * updateMetadata}` member pair, so a handler that called the wrong factory
 * — `getPackage()` where `getDataElement()` belonged — would still read and
 * write through this double without a single assertion noticing, because
 * every factory name resolves to the same table. `factory` is filled in as
 * soon as any accessor is read, the same way `recordAnalyse`'s `calls[].
 * factory` is, but here the caller still controls each member's answer
 * directly instead of taking the recorder's canned one — which is what a
 * document-driven read-modify-write test needs.
 */
export function fakeClientOfWithFactory(members: Members) {
  let factory: string | undefined;
  const object = new Proxy(members, {
    get: (target, name: string) =>
      target[name] ?? (async () => okResponse(undefined)),
  });
  const client = new Proxy({} as Record<string, unknown>, {
    get: (_target, name: string) => () => {
      factory = name;
      return object;
    },
  });
  return {
    client,
    get factory() {
      return factory;
    },
  };
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
 * A client that throws (not refuses) whatever it is asked.
 *
 * A structured refusal (`refusingClient`) is `IAdtResponse.ok === false` —
 * `answer()` reads its `getError()` straight into the failure payload, and
 * that payload never carries `ctx.tool`. A throw is a different path
 * entirely: `answer()`'s own try/catch names it `client_threw` and builds
 * the payload from the answer's own context, `tool` included. Use this
 * client when the assertion is about that path, not about a refusal's
 * message.
 */
export function throwingClient(message: string) {
  return new Proxy({} as Record<string, unknown>, {
    get: () => () =>
      new Proxy({} as Members, {
        get: () => async () => {
          throw new Error(message);
        },
      }),
  });
}

/**
 * Which `analyse` the handler passed, and how often a member was called.
 *
 * What goes wrong at the scale of a hundred handlers is a handler taking the
 * wrong strategy, and that is visible from the call rather than from the answer.
 *
 * **`factory` is captured too, unlike `fakeClientOf`'s outer proxy.** Two
 * families can share an identical result-set shape — same slot names, so
 * `resultsFor` hands both the same reading functions — while addressing the
 * object with the same config key (`name`). Swapping which family's factory
 * gets called is then invisible to every reading and every projection; only
 * the factory name itself proves which one ran. `getX` is captured as asked
 * for, not resolved against the client's real method names, so a call
 * through a factory this double was never told about still shows up as
 * whatever string the handler used.
 */
/**
 * `answers` supplies what a named member resolves to, for the handlers that
 * read one call's value to make the next. Everything else keeps the default
 * empty reading: a recorder exists to record, and a member whose value nobody
 * reads should not need one stated.
 */
/**
 * The call's own arguments, without the strategy.
 *
 * Since interfaces-adt 10/11 every member takes `options.analyse`, and where a
 * member had no options it is a new last parameter. The strategy is recorded
 * apart (`analyse`, `carriedAnalyse`), so `args` stays what the caller asked
 * for: `analyse` is taken out of the last argument, and a last argument that
 * held nothing else is dropped.
 */
function ownArguments(args: unknown[], carriedAnalyse: boolean): unknown[] {
  if (!carriedAnalyse) return args;
  const { analyse: _analyse, ...rest } = args.at(-1) as Record<string, unknown>;
  return Object.keys(rest).length === 0
    ? args.slice(0, -1)
    : [...args.slice(0, -1), rest];
}

export function recordAnalyse(answers: Record<string, () => unknown> = {}) {
  const calls: Array<{
    member: string;
    factory: string;
    analyse: unknown;
    carriedAnalyse: boolean;
    args: unknown[];
  }> = [];
  const client = new Proxy({} as Record<string, unknown>, {
    get: (_target, factory: string) => () =>
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
              factory,
              analyse: carriedAnalyse ? (lastArg as any).analyse : undefined,
              carriedAnalyse,
              args: ownArguments(args, carriedAnalyse),
            });
            const supplied = answers[member];
            return okResponse(
              supplied ? supplied() : reading(undefined, '', 200),
            );
          },
      }),
  });
  return {
    client,
    calls,
    get last() {
      const lastCall = calls.at(-1);
      return lastCall
        ? {
            analyse: lastCall.analyse,
            carriedAnalyse: lastCall.carriedAnalyse,
            factory: lastCall.factory,
          }
        : undefined;
    },
    countOf: (member: string) =>
      calls.filter((c) => c.member === member).length,
  };
}
