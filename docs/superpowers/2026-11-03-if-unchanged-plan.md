# Plan: write only if the object is unchanged

Goal: `2026-11-03-if-unchanged-goal.md`. Spec: `2026-11-03-if-unchanged-spec.md`. The spec
binds, and each step names the spec section it carries out.

**The write paths** (from adt-clients' update members). The live tests prove one object of
each:

| Path | Example | Systems |
|---|---|---|
| main source | program (on premise), class (cloud) | both |
| class include | local implementations | both |
| function module source | under its group's lock | both |
| CDS source | DDL source | both |
| DDIC source | structure | both |
| XML metadata | domain, data element, message class | both |
| the remaining source and XML updates | interface, BDEF, metadata extension, service definition, table type, package, … | unit tests only; offered because each sends `If-Match` through the same request builder as its path's proven member |

## Part A — `@mcp-abap-adt/interfaces-adt` (minor; its own PR, in mcp-abap-adt-interfaces)

1. Add `IAdtUpdateOptions` (`IAdtOperationOptions` with `ifMatch?: string`, the doc comment of spec §2) and type `update` and `updateMetadata` with it.
2. Add a typecheck proving that an update takes it and that a create does not.
3. Bump the minor and write the CHANGELOG entry and README line. Run the package's lint,
   test:check, build and test.
4. Run Codex review and CI, then wait for the owner's merge, tag and publish. Check the registry.

## Part B — adt-clients, adt-strategies, legacy (minor; its own PR, in mcp-abap-adt-clients)

5. Depend on the new interfaces-adt from the registry. Regenerate the lockfile with npm and
   check that it holds no link.
6. Unit tests first (TDD, each seen red), for every update member: `If-Match` is present with
   the value exactly when `ifMatch` is given (spec §3).
7. Send `If-Match` from the shared request-header builder beside `lockHandle`. Each update
   passes `ifMatch` through.
8. **Legacy.**
   - Measure on E77 (realm check first; a `$TMP` program created and deleted): a stale
     `If-Match` on a source write.
   - If it answers `412`, each legacy update override passes `ifMatch` on, with unit tests.
   - If it does not, `LEGACY.md` lists the guard among what 7.40 lacks, and the overrides
     ignore nothing silently: they take no `ifMatch` by type.
9. Live tests in the integration suite, on premise and cloud, one per path in the table above:
   1. read;
   2. write with the ETag (`200`);
   3. write again with the first ETag (`412`);
   4. write with the new ETag (`200`).

   Each test is guarded, with fresh names and its objects deleted. On premise they use
   `$TMP`; on the cloud, the trial's test package without a transport.
10. CHANGELOG entries for the three packages, and the README. Run every package's lint,
    test:check, build and test.
11. Run Codex review and CI, then wait for the owner's merge, tag and publish. Check the
    registry.

## Part C — mcp-abap-adt (minor; this PR)

12. Depend on the published adt-clients, adt-strategies and interfaces-adt. Regenerate the
    lockfile with npm.
13. **Reads.**
    - `AdtReading.etag` is set by `reading()` from the answer's `etag` header (spec §4).
    - Unit tests: with and without the header.
14. **Read tools.**
    - List every `Get*` tool (high, low, compact) whose document an update tool writes,
      against the update tools. The list goes into this plan as a table before any code.
    - Each listed tool adds `etag` to its answer, with a unit test per tool.
15. **Update tools.**
    - Every high and low `Update*` tool and compact `HandlerUpdate` take `etag` and pass it as
      `ifMatch`.
    - An update that did not activate answers the write's `etag`; one that activated answers
      none.
    - Unit tests per tool: passed when given and absent when not, the `etag` answered, and a
      `412` reaching the answer.
    - If step 8 found 7.40 lacking the guard, the legacy server's tools do not offer `etag`, and
      a test proves its absence there.
16. Descriptions per spec §4, in functional words. Run `descriptionsFunctional`. Rewrite the
    surface fixtures (`WRITE_TRANSPORT_SURFACE=1`, `WRITE_VARIANT_SURFACE=1`) with the
    deliberate-change comment, and update the counts.
17. **Live test**, on premise and cloud:
    1. read with the tool and update with its `etag` (`200`, a new `etag`);
    2. update again with the first `etag` (`412` reaching the model);
    3. update with the new one (`200`).

    Use one source tool and one XML tool. Do a realm check before each run.
18. **Docs:**
    - the README;
    - `npm run docs:tools`;
    - the user guide's section "Writing over a change";
    - the CHANGELOG;
    - the version bump across the manifests, server json files and Dockerfiles.
19. Run CI's full step list locally. Then run Codex review and CI, and get the owner's review.
20. Delete the goal, spec and plan before the release commit. Put anything they still owe into
    the PR description. Then wait for the owner's merge and tag, the publish, and the
    registry check.
