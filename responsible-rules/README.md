# @mcp-abap-adt/responsible-rules

The rules of the MCP ABAP ADT servers that name a call's **responsible**, **user** and **system**:
a `SystemContextRules` — the hook of [`@mcp-abap-adt/lib`](https://www.npmjs.com/package/@mcp-abap-adt/lib)
— that makes each connection's parameters from its system's `systeminformation`, once, when the
connection is created; and the system type the binaries require.

lib applies no rule of its own: it keeps the mechanism (the `systeminformation` reader, the
resolver hook, the per-destination store, the main flow). The launchers of `mcp-abap-adt`,
`mcp-abap-adt-http` and `mcp-abap-adt-sse` (and the compact and `-ro` binaries through them) pass
these rules; an embedder gets them only when it passes them too.

```ts
import { EmbeddableMcpServer } from '@mcp-abap-adt/lib/embeddable';
import { defaultSystemContextResolver } from '@mcp-abap-adt/lib/request-context';
import { responsibleRules } from '@mcp-abap-adt/responsible-rules';

const server = new EmbeddableMcpServer({
  connection,
  systemType: 'onprem',
  systemContextResolver: defaultSystemContextResolver,
  systemContextRules: responsibleRules,
});
```

`HandlerExporter` takes the same two options; a handler group registered on its own reads them
from its `HandlerContext`.

## The rules

A destination is the credentials and the ABAP system. Its parameters — the responsible and master
system every call takes, which also name the debugger's request user and a background run's
caller — are made once, with the connection (stdio: at the start; SSE: once per stream; Streamable
HTTP: when the pooled instance's connection is created), and kept for the destination.

- **`systeminformation` names the user**: the user is the responsible, the system id the master
  system — over anything configured.
- **No information on ABAP Cloud** (which always has `systeminformation`) — one step to the error:
  a `404` is `cloud_without_systeminformation` (the configuration or the headers are
  inconsistent); anything else `system_lookup_failed` (the ABAP system's problem).
- **No information on-premise** (a `404`, an answer without the user, an error) — two steps: the
  stated responsible (`x-sap-responsible`, `SAP_RESPONSIBLE`), else the login (`x-sap-login`,
  `SAP_USERNAME`), with the stated master system; neither is `system_user_unknown`.
- **No kind stated** is `system_type_required`: the kind is never guessed.
- **A `401`** never reaches the rules: lib passes the credential failure through as it came.

A refusal keeps nothing: the connection ends and the next call that creates one asks again. The
refusals' codes and words are lib's (`ServerRefusal`).

## The system type

`SYSTEM_TYPE_ROW` is the binaries' `--system-type` / `SAP_SYSTEM_TYPE` / `system-type` row,
required; `listenerSystemTypeRequiredWords()` the words a listener (Streamable HTTP, SSE) ends its
start with when no parameter states it.

License: Apache-2.0.
