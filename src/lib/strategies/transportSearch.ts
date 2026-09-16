/**
 * How many saved transport searches one listing will run.
 *
 * **The request itself is the client's again.** This module used to hold it:
 * `AdtRequest.list()` resolved a saved search internally, behind a
 * `protected` member no `analyse` of ours could reach, and threw outright on
 * a system holding several — advice to "pass configUri explicitly" that
 * `ListTransports` had no parameter to follow. So the consumer made the call
 * itself, with a raw request to an endpoint whose URL and `Accept` it had to
 * know. `@mcp-abap-adt/adt-clients` 19.1.0 answers that properly:
 * `getRequest().searchConfigurations(options)` is one request, with our
 * `analyse` over it and the shipped parse behind it, and the raw request is
 * gone from here.
 *
 * What stays is the decision the client deliberately does not make: **what to
 * do when a system holds more than one.** Not guess, and not refuse either —
 * run each of them and merge, capped. A saved search is a filter, so merging
 * can only widen the candidate set, and the caller's own `user` and
 * `modifiable_only` narrow it again afterwards: a request that belongs in the
 * answer cannot be lost by looking in more than one place, and one that does
 * not is filtered out either way. Duplicates collapse by request number
 * downstream, in `parseTransportListValue`.
 *
 * A bound rather than a principle, in the same spirit as `MAX_STATUS_POLLS`:
 * the only system this has been run against holds one configuration
 * (measured 2026-09-16), so no measurement justifies a particular number.
 * Five is enough that a system with a handful is served completely, and small
 * enough that a system with fifty does not turn one tool call into fifty
 * round trips. The answer says when the cap was reached, so a caller is never
 * quietly given a partial list.
 */
export const MAX_SEARCH_CONFIGURATIONS = 5;
