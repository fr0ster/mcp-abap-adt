# Goal: ATC results by Display ID

## Goal

A model can find an ATC result that already exists and read its findings, without running ATC
again. Today the server reads findings only from the worklist a `RunATC` call answered. A
result made earlier is out of reach: by the server's own runs in another session, by a person
in ADT, or by a central or baseline run. SAP keeps these results, each named by a Display ID.

Two reads:

- **The list of results.** The results SAP holds for the filters given: whose (`createdBy`,
  required, `*` for everyone), which kind (central or active), how old (`ageMin` / `ageMax`, in
  days) and, where SAP offers them, `contactPerson` and `sysId`. Each entry gives its Display
  ID, title, check variant, run series, creation time and the count of findings per priority
  and of failures.
- **One result.** The result named by its Display ID: its objects, and each object's findings
  as `GetATCFindings` answers a worklist's (location, priority, check, message, exemption, the
  link to the finding's documentation). Exempted findings are included only when asked for
  (`includeExemptedFindings`).

## What SAP answers (Measured, on premise and cloud)

- `GET /sap/bc/adt/atc/results?createdBy=…&centralResult=true|activeResult=true&ageMin=…&ageMax=…`
  → `200`, `application/xml`, `atcresult:resultList` of `atcresult:result` entries. Without
  `createdBy`: `400` "Parameter createdBy could not be found" (SADT_RESOURCE 017).
- `GET /sap/bc/adt/atc/results/{displayId}?activeResult=false&includeExemptedFindings=false`
  → `200`, `application/xml`, the same `resultList` holding one result with its `objects` and
  their `findings`.
- Discovery declares both templates and no `app:accept` on either collection.
- On premise, `createdBy=*` with central results over ten years gave 110 entries, most of them
  made by other users. On the cloud system the list held the server's own `RunATC` runs.

## Invariants

- **The caller states the scope.** `createdBy` is required and has no default, so no call asks
  for every user's results by omission and loads the system.
- **Read-only.** Both reads change nothing. They are offered in the read-only servers as well.
- **Nothing the system cannot serve is offered.** A read is offered where it was measured: on
  premise and cloud now; legacy only after it is measured there.
- **Every answer as SAP gave it, read by a strategy.** The parsing lives in adt-clients' result
  strategies like every other read. The tool answers what the strategy read, with no
  re-interpretation of its own.
- **Contract first, from the registry.** The reads are declared in `@mcp-abap-adt/interfaces-adt`,
  implemented in adt-clients and used by mcp-abap-adt. Each package is published before its
  consumer depends on it.
- **Tools are explainable.** Each tool's description says what it reads, its parameters and its
  answer, in functional words only.

## Open for the spec

- The tool names and whether the compact set carries them as their own tools or as a part of an
  existing one.
- The semver of each package. A new contract next to the existing ones would be a minor; a
  required member added to an existing one would be a major.
- The answer's size: whether the list takes a count limit of its own, beyond `ageMin` / `ageMax`.
