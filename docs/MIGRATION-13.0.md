# Migrating to 13.0.0

One change underneath, and it is a large one: **`@mcp-abap-adt/adt-clients` 23
interprets nothing.** Every member takes an `options.analyse`, no member applies
a verdict of its own any more, and the readings that used to be built into four
of them now ship as named strategies in `@mcp-abap-adt/adt-strategies`.

**No MCP tool changed** — not a name, not a parameter, not an answer shape. If
you talk to this server over MCP, the only difference you will see is that some
refusals now arrive as refusals where they used to arrive as success; the
[Fixed](../CHANGELOG.md) entries name them. There is nothing to do here.

What follows is for a consumer that imports `@mcp-abap-adt/lib` or
`@mcp-abap-adt/core` in TypeScript, or that calls `@mcp-abap-adt/adt-clients`
members itself.

## 1. Every member takes an `analyse`, and none supplies its own

Until 22.x a handful of members judged their own answers: `options?.analyse ??
someDefault`. In 23 the right-hand side is gone everywhere — the member reads
`options?.analyse` and nothing else. A call that passes no strategy therefore
has **no verdict at all**: whatever HTTP succeeded is a success, including the
refusals ADT embeds in a `200`.

79 more members grew the parameter in the same release. In this repository that
took the number of call sites accepting an `analyse` from 275 to 526, of which
188 were passing none. All 188 pass one now, and `handlerInvariants.test.ts`
fails the build if a new call does not.

```diff
- await ddl.lock({ ddlName });
+ await ddl.lock({ ddlName }, { analyse: analyseException });

- await ddl.unlock({ ddlName }, lockHandle);
+ await ddl.unlock({ ddlName }, lockHandle, { analyse: analyseException });

- await utils.getInactiveObjects();
+ await utils.getInactiveObjects({ analyse: analyseException });
```

`analyseException` is the general one — it reads an `exc:exception` element, a
non-2xx and a broken connection, and nothing else. Use a named reading where the
refusal has a known shape; the four below are the ones whose absence is silent.

## 2. Five calls lost a tailored default. Pass it explicitly.

These had readings of their own, and passing nothing used to be the *correct*
call. Now it loses the verdict, and the compiler says nothing because the
parameter is optional.

| member | pass | what is lost otherwise |
|---|---|---|
| `getServiceBinding().update` | `analysePublication` | `<SEVERITY>` in the publication job's own document — a failed publication reads as a success |
| `getServiceBinding().lock` | `analysePublicationLock` | a `403` here means an editor holds the binding and the job can still be posted; `analyseException` refuses the whole publication for it |
| `getMessageClassMessage().read` | `analyseMessageClassMessage(msgno)` | the msgno-presence check — a request for a message that does not exist answers the whole-class document as success |
| `getUnitTest().run` | `analyseUnitTestStart` | a run that started without saying which run it is — every later poll is then about nothing |
| `getPackage().delete` | `analyseDeletion` | `del:isDeleted="false"` — a refused delete reads as done (this repository already passed it) |

`getRunId()`, `getStatusResponse()`, `getResultResponse()`, `getClassName()` and
`getCdsViewName()` are gone from `AdtUnitTest` with them: the client remembers
nothing, and every member takes the run it is about. A caller who needs the wire
response asks for it through the result set — `wireItself` for that slot, or a
reading of its own composed over the library's:

```ts
const runIdWithWire = (answer: IAdtWireResponse) => ({
  runId: unitTestRunId(answer),
  status: Number(answer.status ?? 0),
  location: answer.headers?.location ?? null,
});
const unitTest = client.getUnitTest({ ...unitTestDocuments, run: runIdWithWire });
```

**`lockTestClasses` and `unlockTestClasses` answer an `IAdtResponse` too.** They
used to answer the bare handle and throw when the answer carried none. A call
site that `await`s them for a string now gets the response object — truthy, so
an emptiness guard passes it, and the handle is lost.

## 3. A result set left to its default answers the document

This is the same change seen from the other side, and it is the one that bites
without a word: a member built with no result set — `client.getFeeds()`,
`getDumps()`, `getProfiler()` — used to answer a parsed shape and now answers the
document. Nothing throws, and nothing fails to compile, because the shipped
default is typed `unknown`.

It cost this project two tools. `RuntimeListFeeds` projected `entries.length`,
and a document has a length too, so it answered `count: 4021` with raw Atom XML
where a caller expected entries.

```diff
- const feeds = new AdtRuntimeClient(connection, logger).getFeeds();
+ const feeds = new AdtRuntimeClient(connection, logger).getFeeds(ourFeeds);
```

Name the readings you need — `feedDescriptors`, `feedEntries`,
`profilerTraceEntries`, … from `@mcp-abap-adt/adt-strategies` — in a set you pass
at construction. Check every accessor you call without one.

**And `AuthBroker` takes an `IRefreshableTokenProvider`.** It requires
`refreshTokens` beside `getTokens` and refuses the provider otherwise
(*"AuthBroker: provider.refreshTokens must be a function"*); `getConnectionConfig`
is asked of the service key store now, not of the provider. A consumer that
wrapped its provider to add `getConnectionConfig` — as this project did — must
stop wrapping, or carry `refreshTokens` through the wrapper.

## 4. Contract packages

`@mcp-abap-adt/interfaces-adt` goes 9 → 11 and a new package splits out of it:

```bash
npm install @mcp-abap-adt/interfaces-adt-connection
```

`IAbapConnection`, `IAdtWireResponse` and `IAdtHeaderValue` live there now; the
rest of `interfaces-adt` is unchanged.

```diff
- import type { IAbapConnection, IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt';
+ import type { IAbapConnection, IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
```

`@mcp-abap-adt/interfaces-auth` goes 1 → 2 and `@mcp-abap-adt/auth-broker`
2 → 3: the broker's constructor takes one options object, with the token
provider inside it.

```diff
- new AuthBroker({ ...options }, tokenProvider, 'system', logger);
+ new AuthBroker({ ...options, provider: tokenProvider }, logger);
```

`@mcp-abap-adt/auth-providers` goes 2 → 4 with no change this project had to
make.

## 5. One removal from `@mcp-abap-adt/lib/utils`

`fetchNodeStructure` is gone. It was a deprecated stub that threw
`fetchNodeStructure not implemented in AdtClient yet` on every call, and the
member it was waiting for has existed for several majors:
`client.getUtils(results).fetchNodeStructure(parentType, parentName, options)`.

## 6. The errata is where the ambiguity is written down

`@mcp-abap-adt/adt-clients` ships `docs/usage/ERRATA.md` — 25 entries of measured
SAP behaviour with an object tree over them. It is not a defect list: it records
where the platform is **ambiguous**, and every entry is a decision a consumer
encodes in the `analyse` it passes.

The clearest case is the one above: `403` on a service binding's LOCK is neither
an error nor a success. It means an editing session holds the binding, and Eclipse
ADT ignores it and posts the publication job, because the job needs no lock of the
caller's. The errata hands the choice over in as many words — *"If the `403`
should stop you, pass `analyseException` instead."*

So when an ADT answer surprises you, look there before measuring it again; and if
you choose differently from Eclipse, say why at the call site, because that is
your decision about an ambiguous answer rather than the system's behaviour.

## Licensing, for completeness

Unchanged from 12.0.0: the `@mcp-abap-adt` scope is LGPL-3.0-only,
`@mcp-abap-adt/lib` is Apache-2.0 and `@mcp-abap-adt/core` is AGPL-3.0-only. See
the Licensing section of [`README.md`](../README.md).
