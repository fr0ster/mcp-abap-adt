# @mcp-abap-adt/background-runs-memory

The in-memory store of the MCP ABAP ADT server's **background runs**: an `IBackgroundRuns` — the
contract of [`@mcp-abap-adt/lib`](https://www.npmjs.com/package/@mcp-abap-adt/lib) — that keeps
each caller's runs and their answers in the process's memory.

A class or program run (`RuntimeRunClass`, `RuntimeRunProgram`, compact `HandlerProfileRun`) called
with `background: true` answers at once with a `run_handle`; lib runs it on an ABAP session of its
own, waits for SAP's answer, logs that session off and hands the answer to the store. The
launchers of `mcp-abap-adt`, `mcp-abap-adt-http` and `mcp-abap-adt-sse` create this store; lib
ships none, so a consumer that keeps runs elsewhere implements `IBackgroundRuns` itself and never
installs this package.

```ts
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import { EmbeddableMcpServer } from '@mcp-abap-adt/lib/embeddable';

const backgroundRuns = new InMemoryBackgroundRuns({ prefix: 'replica-1.' }); // one per process
const server = new EmbeddableMcpServer({ connection, freshConnection, backgroundRuns });
```

- **Whose run:** each run is its caller's — the URL, the client and the backend user. Another
  caller's handle reads exactly as an unknown one.
- **16 runs per caller** (`BACKGROUND_RUNS_PER_CALLER`), running and kept together; the start of
  a 17th is refused. No process-wide limit.
- **No timeouts:** a finished run's answer stays until its caller discards it; every answer ends
  with the process.
- **Handles:** 128 random bits as hex, after the optional `prefix` (an instance id, when the host
  routes handles between instances — the routing is the host's).

License: Apache-2.0.
