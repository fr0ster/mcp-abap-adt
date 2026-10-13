/**
 * @mcp-abap-adt/background-runs-memory — the in-memory store of background
 * runs: an `IBackgroundRuns` (the contract of `@mcp-abap-adt/lib`) keeping
 * each caller's runs and their answers in the process's memory. The
 * launchers of `mcp-abap-adt`, `mcp-abap-adt-http` and `mcp-abap-adt-sse`
 * create one and hand it to their server instances; an embedder takes it,
 * or implements `IBackgroundRuns` itself.
 */
export {
  BACKGROUND_RUNS_PER_CALLER,
  InMemoryBackgroundRuns,
  type InMemoryBackgroundRunsOptions,
} from './InMemoryBackgroundRuns';
