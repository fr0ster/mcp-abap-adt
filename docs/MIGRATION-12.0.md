# Migrating to 12.0.0

Two breaking changes, both in the contract underneath rather than in this
project's own surface. **No MCP tool changed** — a tool name, a parameter, an
answer shape: none of them. If you talk to this server over MCP, there is
nothing to do here.

What follows is for a consumer that imports `@mcp-abap-adt/lib` or
`@mcp-abap-adt/core` in TypeScript.

## 1. The contract packages replace the `@mcp-abap-adt/interfaces` umbrella

`@mcp-abap-adt/interfaces` last published 51.0.0 and nothing further ships
there. The contracts live in the packages that declare them, and this project
depends on four of them directly.

Install what you name:

```bash
npm install @mcp-abap-adt/interfaces-adt @mcp-abap-adt/interfaces-utils \
            @mcp-abap-adt/interfaces-auth @mcp-abap-adt/interfaces-auth-sap
npm uninstall @mcp-abap-adt/interfaces
```

Then change the import path. Nothing was renamed, so the names are the ones you
already use:

| you imported | it lives in |
|---|---|
| `IAbapConnection`, `IAdtError`, `IAdtResponse`, `IAdtWireResponse`, `IAdtOperationOptions`, `IAdtVersionable`, `IObjectReference`, `IResultStrategy`, `ISearchObjectsParams`, `ITraceEntry`, `IMessageClassMessageConfig`, `AdtObjectErrorCodes`, `AtcObjectType`, `BehaviorDefinitionImplementationType`, `ADT_NO_FAILURE`, `SERVICE_BINDING_VARIANT_MAP`, `ServiceBindingVariant`, `TRANSPORT_SEARCH_CONFIGURATIONS_URL` | `@mcp-abap-adt/interfaces-adt` |
| `ILogger`, `LogLevel`, `XmlNode` | `@mcp-abap-adt/interfaces-utils` |
| `ITokenProvider`, `ITokenRefresher`, `ITokenResult` | `@mcp-abap-adt/interfaces-auth` |
| `SapAuthType`, `ISapConfig`, `IServiceKeyStore`, `ISessionStore`, `IAuthorizationConfig`, `IConnectionConfig` | `@mcp-abap-adt/interfaces-auth-sap` |
| `HttpError`, `IHttpWireResponse`, every `HEADER_*` constant and the header groups | `@mcp-abap-adt/interfaces-network` |

```diff
- import type { IAbapConnection, ILogger } from '@mcp-abap-adt/interfaces';
+ import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt';
+ import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
```

**Do not keep the umbrella beside the new packages.** It carries its own ranges
(`interfaces-adt@^7`), so a tree holding both installs two majors of the same
contract and the compiler reports a mismatch at a package boundary far from the
skew that caused it.

### `@mcp-abap-adt/lib/utils` no longer re-exports the contract

It used to end with `export * from '@mcp-abap-adt/interfaces'`, so a few names
— the `HEADER_*` constants among them — could be reached through it. Take them
from the package that declares them: the header names are in
`@mcp-abap-adt/interfaces-network`.

`getSystemContext`, `setSystemContext` and `IAdtSystemContext` are this
project's own and are still exported from `@mcp-abap-adt/lib/utils`.

## 2. A write's body goes in `options.source`

If you call `@mcp-abap-adt/adt-clients` members yourself — directly, or through
a handler you wrote against them — there is one body channel now.
`interfaces-adt@9` merged `options.sourceCode`, `config.document`,
`config.ddlCode`, `config.ddlSource` and `config.testClassCode` into
`options.source`, and dropped the `options.xmlContent` that nothing read.

```diff
- await domain.updateMetadata({ domainName, document: patched }, { lockHandle });
+ await domain.updateMetadata({ domainName }, { source: patched, lockHandle });

- await program.update({ programName }, { sourceCode: text, lockHandle });
+ await program.update({ programName }, { source: text, lockHandle });
```

**Check every such call rather than trusting the compiler.** In this repository
the compiler flagged 8 of about 38 call sites — the members whose signature has
two overloads. The rest compiled and would have sent an empty body: a `200`
back, an object unchanged, and nothing said. A `check` or `validate` still takes
its source in the config, now as `config.source`, because it compiles text the
server does not hold yet.

## Licensing, for completeness

The packages underneath are LGPL-3.0-only, and that is now the whole
`@mcp-abap-adt` scope rather than four of them — libraries LGPL, servers AGPL or
GPL. `@mcp-abap-adt/lib` stays Apache-2.0 and `@mcp-abap-adt/core` stays
AGPL-3.0-only. Linking LGPL packages does not reach your own code; their terms
travel with them regardless of this repository's notice. See the Licensing
section of [`README.md`](../README.md).
