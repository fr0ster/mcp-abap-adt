# Spec: ATC results by Display ID

Goal: `2026-11-02-atc-results-goal.md`. This spec decides what the goal left open and fixes the
shape of each package's change.

## 1. What SAP answers (Measured, on premise and cloud)

Every answer is `application/xml`. A request sends `Accept: application/xml`, since discovery
declares no `app:accept` on either collection.

**The list.** `GET /sap/bc/adt/atc/results`, `atcresult:resultList` of `atcresult:result`. Each
result carries `displayId`, `title`, `checkVariant`, `runSeries` (empty element when none),
`createdAt` (ISO time) and `aggregates` with `numPrio1`…`numPrio4` and `numFailure`. The list
carries no objects and no findings.

| Query | On premise | Cloud |
|---|---|---|
| no parameter | `400` SADT_RESOURCE 017, "Parameter createdBy could not be found" | — |
| `createdBy=*` and `ageMin=0&ageMax=3650` | 186 results, 108 KB | 22 |
| `centralResult=true&createdBy=*` and the same ages | 110 | 6 |
| `centralResult=true&createdBy=*`, no ages | 26 | 5 |
| `centralResult=true`, the ages, no `createdBy` | 0 | 0 |
| `centralResult=true&createdBy=<own user>`, the ages | 0 (own runs are not central there) | — |
| `activeResult=true&createdBy=*` | 0 | 0 |
| `centralResult=false&activeResult=false&createdBy=*` | 0 | — |

Read from the table:

- With no kind, the list holds every kind: central runs and the users' own runs.
- With no ages, SAP applies a window of its own, narrower than ten years.
- `createdBy` absent next to a kind matches nobody.
- Active results were empty on both systems, so their content is unmeasured.

**One result.** `GET /sap/bc/adt/atc/results/{displayId}` answers the same `resultList`, holding
one `result` that also carries `objects`. Below that it has the worklist's shape:
`atcobject:object` (`adtcore:name`, `adtcore:type`, `adtcore:packageName`, `atcobject:author`)
with `atcobject:findings` of `atcfinding:finding`, whose attributes are the ones the worklist's
findings carry, plus `processor`, `lastChangedBy`, `checksum`, `remarkText`, `remarkLink` and
`quickfixInfo`.

- `activeResult=true|false` and `includeExemptedFindings=true` changed nothing for a result
  without exemptions.
- An unknown Display ID gets `404 ExceptionResourceNotFound`.

## 2. Contract: `@mcp-abap-adt/interfaces-adt` 25.1.0 (minor)

A new capability next to `IAtcFindings`, in `runtime/IAtcRun.ts`, exported from the index:

```ts
export interface IAtcResultListOptions {
  /** Whose results: a user name, or `*` for every user. */
  createdBy: string;
  /** Central results only (`centralResult=true`); absent, every kind. */
  centralOnly?: boolean;
  /** Age in days. */
  ageMin?: number;
  ageMax?: number;
}

export interface IAtcResultsReadable<TResultList, TResult> {
  listResults(options: IAtcResultListOptions & IAdtAnalyseOptions<E> & …): …;
  getResult(displayId: string, options?: IAdtAnalyseOptions<E> & …): …;
}
```

Both methods have the `analyse` overload pair that `getFindings` has. `createdBy` is required by
type.

**Only what was measured to act.** The templates also declare `activeResult`, `contactPerson`,
`sysId` and `includeExemptedFindings`, and none of them is offered:

- `activeResult` answered only empty lists, and made no difference to one result.
- `contactPerson` and `sysId` were not measured.
- `includeExemptedFindings` changed nothing on a result without exemptions. Measuring it needs an
  exemption, which is a change to the system.

Any of them is added once it is measured to act.

Types only; minor, because nothing existing changes.

## 3. Implementation: adt-clients 42.1.0 (minor)

- `runtime/atc/results.ts`: `listAtcResults(connection, options)` and
  `getAtcResult(connection, displayId, options)`.
  - Each is one GET, `Accept: application/xml`, with only the parameters given.
  - `centralOnly: true` sends `centralResult=true`, and the Display ID is URI-encoded.
  - `createdBy` that is empty or only spaces is refused before anything is sent. That is a
    value rule: SAP matches nobody for it.
- `IAtcResults` gains `resultList` and `result`, both `rawDocument` in `atcDocuments`.
  `AdtAtc` implements `IAtcResultsReadable<T['resultList'], T['result']>`.
- Minor, as `mainPrograms` in 40.1.0. A consumer that wrote its own complete `IAtcResults`
  must add the two slots. Spreading `atcDocuments` covers it, as it did for `mainPrograms`.
- **Legacy.** `AdtAtc` on the legacy client refuses both reads until they are measured on 7.40,
  as `readMainPrograms` does.
- Manifest, shape atoms, behaviour guard and variant gates as for `mainPrograms`.
- Unit tests:
  - the request each call sends: path, query and `Accept`;
  - the empty-`createdBy` refusal;
  - both slots answering through a custom result set.
- Live test: list central results with `createdBy=*` on both systems, then read the first by its
  Display ID.

## 4. Tools: mcp-abap-adt 23.1.0 (minor)

Two tools, beside `RunATC`, `GetATCRunStatus` and `GetATCFindings`.

**Where they are offered:**
- The tools are offered in the same binaries as those (core and core-ro, and their http/sse
  siblings), `available_in: ['onprem', 'cloud']`.
- The compact sets carry no ATC tool today, and they get none now.
- Every name enters every list of the ATC tools:
  - `TOOL_NEEDS` or `TOOLS_WITHOUT_NEED`;
  - `batch-handlers.json`, as `GetATCFindings` is;
  - `tool-search.json`, the surface fixtures and the counts.

**`ListATCResults`.**
- Parameters:
  - `created_by` (required: a user name, or `*` for every user);
  - `central_only` (central results only; absent = every kind);
  - `age_min` and `age_max` (days).
- Answers `results`, newest first as SAP sends them. Each entry has `display_id`, `title`,
  `check_variant`, `run_series` (absent when empty), `created_at`, `by_priority` (keyed `"1"`…`"4"`)
  and `failures`.
- No limit of its own: SAP takes no count. The largest list measured is 186 entries, 108 KB, and
  the ages are the bound.

**`GetATCResult`.**
- Parameters: `display_id` (required), `detail` (as `GetATCFindings`).
- Answers `display_id`, `title`, `check_variant`, `created_at`, `objects_checked`, `by_priority`
  and `findings`, each finding as `GetATCFindings` gives it, terse or full.
- `objects_checked` and `by_priority` are counted from the objects and findings the result
  carries, as `GetATCFindings` counts them.
- A `404` reaches the model as SAP gave it.

**Reading.**
- The server reads the result's `objects` with the code that reads the worklist's.
  `parseAtcWorklist` and the new `parseAtcResult` share one function over an `objects` element.
- The list is read by `parseAtcResultList` in a new `atcResults.ts` beside `atcFindings.ts`.
- `ourAtc` keeps both new slots as the documents, as it does `findings`.

**Versions.** An ATC result is not an object's source, so there is no version to state.
`/atc/results` goes into `NOT_A_READ`, as `/mainprograms` did.

## 5. Tests

- Server unit tests read captured documents:
  - one list;
  - one result with findings on two objects;
  - the empty list.

  The documents are scrubbed of every user name, package and host, and the identity check is
  the existing allowlist test.
- Live integration test, on both systems:
  1. `RunATC` on the shared function group;
  2. `ListATCResults` with `created_by: '*'`, `age_min: 0`, `age_max: 1`, finding the newest
     result titled with that group's name;
  3. `GetATCResult` on its Display ID;
  4. checking that its findings equal `GetATCFindings` for the run's worklist: the same checks
     on the same lines.
- `descriptionsFunctional`, `readsStateTheirVersion` and the surface tests cover the two new
  tools.

## 6. Docs and order

- README tool lists, `docs/user-guide/AVAILABLE_TOOLS*.md`, `HANDLERS_MANAGEMENT.md`,
  `npm run docs:tools`, and the CHANGELOG of each package.
- Order:
  1. interfaces-adt 25.1.0;
  2. adt-clients 42.1.0 and legacy (its refusal);
  3. mcp-abap-adt 23.1.0.

  Each is published before its consumer moves to it. The contract and the client each have
  their own PR in their repository. This PR holds the goal, the spec, the plan and the server's
  change.

## 7. For the owner

- **No count limit.** The list has no limit of its own. The ages bound it, and SAP's own window
  bounds it when they are absent.
