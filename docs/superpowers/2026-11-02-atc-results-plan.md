# Plan: ATC results by Display ID

Goal: `2026-11-02-atc-results-goal.md`. Spec: `2026-11-02-atc-results-spec.md`. The spec binds;
each step names the spec section it carries out.

## Part A — `@mcp-abap-adt/interfaces-adt` 25.1.0 (its own PR, in mcp-abap-adt-interfaces)

1. In `runtime/IAtcRun.ts`, add `IAtcResultListOptions` and `IAtcResultsReadable` (spec §2), with
   the `analyse` overload pair of `IAtcFindings`. Export them from the index.
2. Add a typecheck under `__typechecks__/` proving that `createdBy` is required and that neither
   method takes a parameter the spec leaves out.
3. Bump to 25.1.0 and write the CHANGELOG entry and README line. Run the package's lint,
   test:check, build and test.
4. Run Codex review and CI, then wait for the owner's merge, tag and publish. Check the registry.

## Part B — adt-clients 42.1.0, legacy (its own PR, in mcp-abap-adt-clients)

5. Depend on interfaces-adt `^25.1.0` from the registry. Regenerate the lockfile with npm and
   check that it holds no link.
6. Add `runtime/atc/results.ts` with `listAtcResults` and `getAtcResult` (spec §3):
   - only the parameters given;
   - `centralOnly` sends `centralResult=true`;
   - the Display ID is URI-encoded;
   - `Accept: application/xml`;
   - an empty or blank `createdBy` is refused before any request.

   Add the endpoint constants beside the existing ATC ones.
7. Add the `resultList` and `result` slots to `IAtcResults` and `atcDocuments` (`rawDocument`).
   `AdtAtc` implements `IAtcResultsReadable`. adt-strategies takes the same `interfaces-adt`
   range (the two packages share their ranges).
8. In the legacy package, list both reads in `LEGACY.md` among the runtime families with no
   legacy variant (spec §3). Docs only, on adt-clients `^42.1.0`.
9. Unit tests (TDD, each test written first and seen red):
   - each request's path, query and `Accept`;
   - the blank `createdBy` refusal;
   - both slots answering through a custom result set;
10. Live test in the ATC integration suite, on E19 and the trial: list central results with
    `createdBy: '*'` and ages 0–3650, then read the first by its Display ID. The test is guarded and skipped
    with a reason where it cannot run. Do a realm check before each run.
11. Write the CHANGELOG entries (adt-clients 42.1.0, the legacy minor) and the README. Run every
    package's lint, test:check, build and test.
12. Run Codex review and CI, then wait for the owner's merge, tag and publish. Check the registry.

## Part C — mcp-abap-adt 23.1.0 (this PR)

13. Depend on adt-clients `^42.1.0` from the registry. Regenerate the lockfile with npm.
14. Read the documents (spec §4):
    - In `atcFindings.ts`, factor the reading of an `objects` element out of `parseAtcWorklist`.
      Its answers stay unchanged, proven by the existing tests.
    - Add `atcResults.ts` with `parseAtcResultList` and `parseAtcResult` over that shared
      reading.
15. Capture one list, one result over one object and one over three objects, and one empty list. Scrub every
    user name, package and host so the identity allowlist test passes. Write the parsers' unit
    tests over them first.
16. Add the handlers `ListATCResults` and `GetATCResult` in `src/handlers/atc/high/`, with
    functional descriptions and the parameters of spec §4. Each reads through `ourAtc` with the
    two new slots as documents. A `404` passes as SAP gave it.
17. Register them everywhere `GetATCFindings` is:
    - the system handler group;
    - `TOOL_NEEDS` / `TOOLS_WITHOUT_NEED`;
    - `batch-handlers.json`, `tool-search.json`;
    - `NOT_A_READ` for `/atc/results`;
    - the surface fixtures (`WRITE_TRANSPORT_SURFACE=1` / `WRITE_VARIANT_SURFACE=1`) with the
      deliberate-addition comment;
    - the counts in the launcher and parity tests.

    Check that the compact sets carry neither.
18. Live integration test, on E19 and the trial (spec §5):
    1. `RunATC` on the shared function group;
    2. `ListATCResults` `created_by: '*'`, `age_min: 0`, `age_max: 1`, finding the newest result
       titled with that group's name;
    3. `GetATCResult`;
    4. comparing its findings with `GetATCFindings` of the run's worklist.

    Do a realm check before each run, and add the template config case.
19. Docs:
    - the README tool lists;
    - `AVAILABLE_TOOLS*.md`, `HANDLERS_MANAGEMENT.md`;
    - `npm run docs:tools`;
    - the CHANGELOG entry for 23.1.0;
    - the version bump across the manifests, server json files and Dockerfiles, per the release
      mechanics.
20. Run CI's full step list locally. Then run Codex review and CI, and get the owner's review.
21. Delete the goal, spec and plan before the release commit. Then wait for the owner's merge
    and tag, the publish, the registry check and the nine wrapper+base pairs.
