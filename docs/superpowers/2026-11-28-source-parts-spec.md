# Spec: source code read whole or in parts

The design is `docs/architecture/SOURCE_PARTS.md`; this spec says what each package adds, how it
is tested and which documents change. Section references (§n) are to that document. Packages are
listed in release order; each is published to the registry before the next one consumes it.

Every new behaviour gets unit tests and, where it reaches SAP, live tests on onprem and cloud.
A live test states where it runs (`available_in` and the system kind) and skips elsewhere with
its reason. A test meant to protect a rule is proven load-bearing: the rule is broken on purpose,
the test goes red, the change is reverted.

## 1. `@mcp-abap-adt/interfaces-adt` (minor)

Types and constants only.

**Added**

- `IAdtObjectOutlineReadable<R>`: the atom of `getObjectOutline(objectType, objectName, options)`,
  with `AdtOutlineCode` (`CLAS/OC`, `INTF/OI`, `PROG/P`, `PROG/I`, `FUGR/F`) and the options
  `version`, `accept`, `analyse`, typed as adt-clients 48 declares them.
- `IAdtNavigationTargetReadable<R>`: the atom of `getNavigationTarget(uri, options)`, with the
  options `filter?`, `fullname?` (the discovery template's parameters), `accept?`, `analyse`.
- Slots `objectOutline` and `navigationTarget` in `IUtilResults`, so a result strategy can be
  given for both members.

**Tests**: the package's type tests: each atom accepts the adt-clients class shape and a
hand-written object, and refuses one missing a member.

**Docs**: the package's CHANGELOG and README atom list.

## 2. `@mcp-abap-adt/adt-clients` (minor)

**Added**

- `AdtUtils.getNavigationTarget(uri, options)`: one request,
  `POST /sap/bc/adt/navigation/target?uri=<uri>[&filter=…][&fullname=…]`, no body, `Accept` the
  caller's or `application/xml` by default, `timeout: 0`; the answer through the result slot
  `navigationTarget` (default `rawDocument`) and the caller's `analyse`. `uri` is sent as given,
  encoded once as a query value.
- The address in `src/endpoints/objects.ts` (a `NAVIGATION` record); no literal path in the module.
- `AdtUtils` implements both new atoms; `getObjectOutline` and `getNavigationTarget` leave
  `AwaitingItsAtom` in `factoryReturnsCoverClass.ts`.
- Nothing else: no partial-update member, no reading.

**Tests**

- Unit: the request's method, URL with each option combination, headers, no body, one request
  per call; the result slot and `analyse` applied as for every member; the regression checks
  (one member one request, no `analyse ??`) stay green.
- Integration, onprem and cloud (adt-clients' live suites, objects from the overlay):
  navigation of a form fragment and a local method's `implementationIdentifier` answers `200`
  with a `#start=` reference; a local method's `definitionIdentifier` answers as SAP answers,
  asserted per system as measured: cloud `400` (EU/061); onprem the same href as the
  implementation link and the same `200` start.
- Integration, onprem and cloud: three navigations through
  `AdtBatchConnection('communication')` answer the same references as alone (measured on both:
  `202`, every part equal).
- `HEAD` is not used: it answers `400` on both (measured).
- The answers are recorded into `corpus/adt/answers/` (sanitised) for adt-strategies.

**Docs**

- `docs/usage/ERRATA.md`, new entries with their evidence:
  - a block position's `end` column stops before the closing period;
  - a function group include's outline answers the whole group;
  - a local method's `definitionIdentifier` is refused by navigation (cloud), its
    `implementationIdentifier` resolves.
- `README.md` (the `AdtUtils` member list), `docs/usage/CLIENT_API_REFERENCE.md`,
  `docs/architecture/ARCHITECTURE.md` (cross-cutting utilities), CHANGELOG.

## 3. `@mcp-abap-adt/adt-strategies` (minor)

**Added**

- `readNavigationTarget`: the reading of the navigation answer, from the recorded corpus: the
  reference's include (the URI before `#`) and its `start` (line from 1, column from 0) through
  the package's `sourcePosition`. A document that is no `adtcore:objectReference`, or a reference
  without a readable `start`, reads as no target; whether it was a refusal is the error
  strategy's question.
- `readObjectOutline` is unchanged: its links already carry `href`, the fragment and the
  position the analyzer needs.

**Tests**: unit tests over the corpus answers (form, module, local class, type, local method
implementation; the `400` exception reads as no target); the public surface test.

**Docs**: README's surface list, CHANGELOG.

## 4. `@mcp-abap-adt/adt-code-analyzer` (new, 0.1.0)

A new package in `packages/adt-code-analyzer` of the mcp-abap-adt-clients repository, in the
root's `publishOrder` after adt-clients and adt-strategies, depending on both and on
interfaces-adt by semver range.

**Added**

- `AdtCodeAnalyzer`, constructed with: the connection, the declared variant (`onprem` | `cloud`),
  the logger, the outline and navigation readings, and the scanner (`BlockEndScanner`). It
  builds its own adt-clients members over the connection: the outline (`rawDocument`), the
  navigation, and the source reads with `wireItself`, so the text and the `etag` header reach it.
- `outline(object, { version })` (§4.1): SAP's document, the `readObjectOutline` tree, and the
  flat list of every element with `type`, `name`, `scope`, `include`, `position?`, `readable`,
  `duplicate_address?`, and for a readable one its address and `ref` (§5.0).
- `part(object, targets, { version, source? })`: each target is an address, a short form or a
  `ref`. Per element it answers `include`, the include's text, `etag?`, `first_line`,
  `last_line`, `columns?`, `shares` (`none` | `line` | `statement`). With `source` given it
  locates in that text and reads the outline and navigation afresh.
- The function group path (§5.2): the group's outline for its includes, then one include's
  outline for the whole group.
- Navigation per target; several targets through one `AdtBatchConnection('communication')`
  envelope on `cloud` and `onprem` (measured on both), one by one elsewhere (§4.4). The side of a
  navigated start is never taken from the link: the identity check decides it on the text
  (onprem gives one href and one start for both sides).
- The lexer and `BlockEndScanner`: the closed table, the nesting table and the fail-closed rules
  of §5.2, the boundary check of §5.4, the identity check of the whole address, all plain string
  code; no regular expression anywhere in the package.
- `ref`: encoding and decoding, the prefix check under the object's address.
- **Refusals** (each an error with its code, the element and the include, never a throw of
  SAP's text): `not_found`, `ambiguous` (with the matching addresses), `not_readable` (an
  informational kind), `duplicate_address`, `ref_invalid`, `start_mismatch`, `bad_nesting`,
  `unbalanced`, `crosses_include`, `no_end`, `inside_macro`, `unlexable`. SAP's own refusal of a
  member's request comes back as that member's answer, through the analyzer's `analyse`.
- No hashing (lib hashes), no cache, no request built in the package.

**Tests**

- Unit, the lexer: every lexical form of §5.2 (comments, the three literal kinds and their
  escapes, templates with embedded expressions, pragmas, chains, the terminating `.`), the
  unlexable cases.
- Unit, the scanner: each table row with its end; each nesting row, accepted and refused; each
  fail-closed rule with an input that breaks it (`FORM` in `METHOD`, `ENDFORM` while a `METHOD`
  is open, an event with an `INCLUDE`, a terminator inside a macro body, a start inside a macro,
  `CLASS … DEFINITION DEFERRED`, `LOCAL FRIENDS`).
- Unit, identity: a stale position on a same-named method of another local class is
  `start_mismatch`; each address field changed alone is refused; a navigated start that lands
  on a `METHODS` declaration while the implementation side is asked (and the reverse) is
  `start_mismatch`.
- Unit, the boundary check: `ENDMETHOD. METHOD b.`, a chained declaration, a trailing comment and
  pragma after the end (accepted).
- Unit, addresses: duplicate full addresses, the short form with none, one and two matches,
  `ref` round trip, a `ref` outside the object's address.
- Unit, the composition: a fake connection records every request; each call makes exactly the
  member requests §4.1 names, the batch on `cloud`, single requests on `onprem`; no
  `makeAdtRequest` and no ADT path literal in the package source (a source scan, like
  adt-clients' `noHardcodedObjectAddresses`).
- Live, cloud: class and interface parts (main, `implementations`, `testclasses`) against the
  source read back, every block of the test classes; function group parts (form, module, local
  class definition and implementation, local method implementation) via the include outline,
  navigation and the scanner, against the read source.
- Live, onprem: the same for a program and its includes (events, forms, modules, local classes),
  and a function group.

**Docs**: the package README (what it answers, the seams, the closed tables, the refusals), its
CHANGELOG; the repository's CLAUDE.md package list is the owner's to change.

## 5. mcp-abap-adt 24.3.0 (`lib` and the binary packages)

**Added**

- **The contract and the seam.** `CodeAnalyzer` (lib's contract: `outline`, `part`) and the
  optional `codeAnalyzer(connection, variant, logger)` factory on the server options and the
  `HandlerExporter` options; every composition root passes the shipped `AdtCodeAnalyzer`.
- **The source hash.** One lib function: SHA-256, lowercase hex, over the UTF-8 bytes of the text
  as received (§7.2).
- **`part: "size"`** on every source read (`GetClass`, `GetInterface`, `GetProgram`, `GetInclude`,
  `GetFunctionModule`, `GetFunctionInclude`, the local include reads, and the other
  `answerSourceRead` users): one GET, answering `source` (its ADT address), `version`, `bytes`,
  `lines`, `source_hash`, `etag?`; no text. `start_line` / `end_line` with `part: "size"` are
  refused before the GET.
- **`GetObjectOutline`**: `PROG/I` added; `view` (`kinds` | `parts`) and, with `parts` only, the
  filters `element_types`, `element_name` (exact or `*` mask), `parent`; without `view` the
  answer is today's at every `detail` level, byte for byte (§6). A filter without `view: "parts"`
  is refused before any request.
- **`GetSourcePart`** (read-only sets): `object_type`, `object_name`, `version`, `targets` (each
  an address, a short form or a `ref`), and `start_line` / `end_line` relative to the element
  when one target is given. Answers per element: its address, `include`, its lines (or the
  range), `first_line`, `last_line`, `line_count`, `shares`, the include's `source_hash` and
  `etag?`. A range outside the element is refused naming the element's line count.
- **`UpdateSourcePart`** (write sets): `object_type`, `object_name`, `source_hash`, `etag?`,
  `transport_request?`, `edits` (`replace`, `insert`, `diff` as §7.3), all in one include. The
  sequence of §7.2 through `withLock`: lock target per the table, the inactive read T, hash and
  etag check, location in T, merge, one write, unlock. Answers each edit with its new line range
  and `sent_hash`; no activation.
- **The merge**: replace whole lines; insert per the containers table; the diff parser (the
  unified-diff subset: `@@ -a,b +c,d @@` headers, ` `, `-`, `+` lines, `\ No newline at end of
  file`), exact matching, confinement, ordering; the line-end rules of §7.2. Plain string code.
- **Refusals** of the write, beyond the analyzer's: `source_changed` (with the current hash and
  etag), `edits_span_includes`, `edits_overlap`, `relative_to_required`, `hunk_mismatch` (naming
  the hunk), `hunk_outside`, `hunks_overlap`, `shares_lines`, `spans_includes`,
  `section_missing`, `already_exists`, `not_writable` (a function group's main source).
- **Compact**: `HandlerGet` parts `size` and `source_part`; `HandlerGet` `object_structure` takes
  `view` and the filters; the compact update takes `edits` with `source_hash` for the source
  kinds. One call each, as every compact call.
- **Sets and availability**: `GetSourcePart` in the read-only and full sets, `UpdateSourcePart` in
  the write sets; `available_in` per object kind as its whole read and update today (program and
  include writes onprem only; program parts onprem only); off on legacy (§11).
- **Batch mode**: both tools, `part: "size"` excepted, are "Runs outside batch mode" in
  `tools/batch-handlers.json`; `part: "size"` is recordable as its source read is.
- **Descriptions**: functional, naming nothing concrete (the literal-scan test covers the new
  tools and parameters).

**Tests**

- Unit: each new schema (accepted and refused shapes); `part: "size"` counts (empty source, a
  final line feed, CRLF, mixed line ends); the hash function against known vectors;
  `GetObjectOutline` without `view` byte-identical to today's answers on the recorded documents;
  the views and filters; the merge (each edit kind, each refusal, line ends preserved,
  final-newline state kept); the diff parser and confinement (a hunk for `a` of a chain refused,
  a hunk outside the element refused even when the text matches, overlaps refused); the write
  sequence with a fake analyzer and recorded CRUD (drift refused before any write, unlock on
  every failure path, exactly one PUT, the lock target per kind from the table); the
  `codeAnalyzer` seam (an embedder's analyzer is called, the shipped one is not); prompts and the
  listed-tool snapshots updated.
- Live, cloud (soft mode, objects from the test config; shared objects created by
  `shared:setup`):
  - size of a class's main source and a local include;
  - the outline views on a class and a function group include;
  - parts of a class (method implementation, definition, local test class method) and of a
    function group (form, module, local method);
  - `UpdateSourcePart` on a shared test class: replace a method, insert a method, a diff inside
    a method; then a read back proves the text, and a second call with the old hash is refused
    `source_changed`; activation is a separate call in the test.
  - the same on a test function group include (replace a form).
- Live, onprem: everything above, plus a test program with events, forms, modules and local
  classes (parts and updates), and a program include.
- Hard mode: one targeted run of the new tools through the MCP server per system.
- The new shared objects (a test class with local classes and test classes, a test function
  group with forms, modules and a local class, an onprem test program with events and an
  include) are added to the shared setup and its check.

**Docs**

- `docs/architecture/SOURCE_PARTS.md` stays the design, its measured facts as they are now.

- `docs/user-guide/AVAILABLE_TOOLS*.md` (generated), `BATCH_MODE.md` (the eligibility of the new
  tools), `README.md` tool list, `docs/user-guide/HANDLERS_MANAGEMENT.md` if the sets change.
- `docs/architecture/HANDLER_EXPORTER.md` and `ARCHITECTURE.md` §5 (the `codeAnalyzer` option).
- `docs/development/tests/` (the new shared objects and config keys) and the test-config
  template.
- CHANGELOG 24.3.0. No migration note: nothing existing changes.
- This spec, the plan and the goal leave the tree before the release.
