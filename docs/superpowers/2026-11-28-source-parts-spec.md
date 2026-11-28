# Spec: source code read whole or in parts

The design is `docs/architecture/SOURCE_PARTS.md` (§n refers to it). This spec fixes the contracts,
the behaviour per package, the tests and the documents, so nothing is left to invent at
implementation. Packages are listed in release order; each is published to the registry before
the next one consumes it (spec §7 gives the gates).

Conventions for every test below:

- Unit tests run without SAP. Live tests state where they run (`available_in` and the system
  kind) and skip elsewhere with their reason. Spec §6 is the matrix.
- A test meant to protect a rule is proven load-bearing: the rule is broken on purpose, the test
  goes red, the change is reverted.
- A **recording connection** is an `IAbapConnection` test double that answers from recorded SAP
  answers and keeps the trace of every request (method, URL, query, headers, body, stateful or
  not). "Trace" below means that list.

## 1. The contracts

Each contract lives in the package that accepts it (adt-clients' decision 17). An optional field a
consumer sets is `?: T | undefined`.

### 1.1 `@mcp-abap-adt/interfaces-adt`

```ts
/** The kinds SAP serves an outline for (measured). */
type AdtOutlineCode = 'CLAS/OC' | 'INTF/OI' | 'PROG/P' | 'PROG/I' | 'FUGR/F';

interface IAdtObjectOutlineReadable<R> {
  getObjectOutline<E extends IAdtError>(
    objectType: AdtOutlineCode, objectName: string,
    options: { version?: AdtReadVersion | undefined; accept?: string | undefined }
      & IAdtAnalyseOptions<E> & { analyse: IAnalyse<E> },
  ): Promise<IAdtResponse<R, E | IAdtError>>;
  getObjectOutline(
    objectType: AdtOutlineCode, objectName: string,
    options?: { version?: AdtReadVersion | undefined; accept?: string | undefined }
      & IAdtAnalyseOptions<IAdtError>,
  ): Promise<IAdtResponse<R, IAdtError>>;
}

/** The discovery template's parameters: `navigation/target{?uri,filter,fullname}`. */
interface IAdtNavigationTargetOptions {
  filter?: string | undefined;
  fullname?: string | undefined;
  accept?: string | undefined;
}

interface IAdtNavigationTargetReadable<R> {
  getNavigationTarget<E extends IAdtError>(
    uri: string,
    options: IAdtNavigationTargetOptions & IAdtAnalyseOptions<E> & { analyse: IAnalyse<E> },
  ): Promise<IAdtResponse<R, E | IAdtError>>;
  getNavigationTarget(
    uri: string, options?: IAdtNavigationTargetOptions & IAdtAnalyseOptions<IAdtError>,
  ): Promise<IAdtResponse<R, IAdtError>>;
}
```

`IUtilResults` gains the slots `objectOutline` and `navigationTarget`. Nothing else; no logic.

### 1.2 `@mcp-abap-adt/adt-strategies`

```ts
/** What a navigation answer says. */
interface INavigationTarget {
  /** The reference's URI before `#`: the include the start is in. */
  include: string;
  /** `start` of the `#start=l,c` fragment: line from 1, column from 0. */
  start: IOutlinePoint;
}
/** No `adtcore:objectReference`, or one without a readable `start`, reads as `undefined`. */
declare const readNavigationTarget: IResultStrategy<INavigationTarget | undefined>;
```

### 1.3 `@mcp-abap-adt/adt-code-analyzer`

```ts
/** The object a call is about. */
type SourceObject =
  | { type: 'CLAS/OC' | 'INTF/OI' | 'PROG/P' | 'PROG/I' | 'FUGR/F'; name: string }
  | { type: 'FUGR/FF'; name: string; group: string };

type Side = 'definition' | 'implementation';

/** Design §5.0: names exactly one element. */
interface FullAddress {
  include: string;            // the include's ADT address, resolved
  type: string;               // adtcore:type
  name: string;               // adtcore:name
  scope: readonly string[];   // enclosing names, outermost first
  side: Side;
}
/** Resolved only when exactly one readable element matches. */
type ShortAddress = Pick<FullAddress, 'type' | 'name'>
  & Partial<Omit<FullAddress, 'type' | 'name'>>;
type Target = { address: FullAddress } | { address: ShortAddress } | { ref: string };

interface OutlineElement {
  type: string; name: string; scope: readonly string[]; include: string;
  lines?: { first: number; last: number } | undefined;   // class and interface only
  readable: boolean;
  duplicateAddress: boolean;
  address?: FullAddress | undefined;  // readable only
  ref?: string | undefined;           // readable only
}
interface SourceOutline {
  document: string;                   // SAP's outline as it came
  tree: IObjectOutline;               // readObjectOutline
  elements: readonly OutlineElement[];
}

type Shares = 'none' | 'line' | 'statement';
interface LocatedPart {
  address: FullAddress;
  include: string;
  text: string;                       // the include's whole text as read (or as given)
  etag?: string | undefined;          // the read's `etag` header, where SAP sent one
  firstLine: number; lastLine: number;
  columns?: { start: number; end: number } | undefined;
  shares: Shares;
}

/** A refusal of the analyzer's own (spec §1.5). */
type AnalyzerRefusal = { kind: 'refusal'; refusal: SourcePartRefusal };
/** SAP refused a member's request: that member's failure, unchanged. */
type SapAnswer = { kind: 'sap'; error: IAdtError };
type Located<T> = { kind: 'ok'; value: T } | AnalyzerRefusal | SapAnswer;

/** What the analyzer calls, built over a connection it chooses. */
interface AnalyzerMembers {
  outline: IAdtObjectOutlineReadable<string>;          // rawDocument
  navigation: IAdtNavigationTargetReadable<string>;    // rawDocument
  sources: IncludeReaders;                             // wireItself: text and headers
}
type AnalyzerMembersFactory = (connection: IAbapConnection) => AnalyzerMembers;

interface BlockEndScanner {
  /**
   * The block that opens at `start` in `text`: the identity check against `address`, the end
   * derived from `text` (never taken from SAP), the boundary check. `sapEnd` is SAP's end where
   * it gave one (class, interface): a derived end on another line is `end_mismatch`.
   */
  locate(text: string, start: IOutlinePoint, address: FullAddress, sapEnd?: IOutlinePoint):
    | { kind: 'ok'; firstLine: number; lastLine: number; shares: Shares }
    | AnalyzerRefusal;
  /** Where an insert goes in `text`, for a container already located (spec §5.6). */
  anchors(text: string, container: ContainerBlock, element: InsertElement):
    | { kind: 'ok'; anchors: InsertAnchors } | AnalyzerRefusal;
}

/** What an insert needs, all derived from the text the call works on. */
type InsertElement =
  | { type: 'form' | 'module' | 'event' | 'local_class' | 'local_interface'; name: string }
  | { type: 'method'; name: string; section?: 'public' | 'protected' | 'private' | undefined };
type ContainerBlock =
  | { kind: 'include' }
  | { kind: 'class'; definition: LocatedPart; implementation: LocatedPart }
  | { kind: 'interface'; definition: LocatedPart };
type InsertAnchors =
  | { kind: 'include'; afterLine: number }                      // the last statement's last line
  | { kind: 'class'; definitionAfterLine: number;               // the section's last statement
      implementationBeforeLine: number }                        // the ENDCLASS line
  | { kind: 'interface'; definitionBeforeLine: number };        // the ENDINTERFACE line

interface AdtCodeAnalyzerOptions {
  client: AnalyzerMembersFactory;
  connection: IAbapConnection;
  variant: 'onprem' | 'cloud';
  readings: { outline: typeof readObjectOutline; navigation: typeof readNavigationTarget };
  scanner: BlockEndScanner;
  logger?: ILogger | undefined;
}
```

`IncludeReaders` has one member per row of spec §2.2, each the `IAdtReadable<…, IAdtWireResponse,
…>` atom of that kind's accessor. The shipped `AdtCodeAnalyzer` satisfies lib's `CodeAnalyzer`
structurally; the package does not import lib.

### 1.4 mcp-abap-adt `lib`

```ts
interface CodeAnalyzer {
  outline(object: SourceObject, options: { version: AdtReadVersion }):
    Promise<Located<SourceOutline>>;
  part(object: SourceObject, targets: readonly Target[], options: {
    version: AdtReadVersion;
    source?: { include: string; text: string } | undefined;
    /** An outline this call already read: used as is, no outline request. */
    outline?: SourceOutline | undefined;
  }): Promise<Located<readonly LocatedPart[]>>;
  /** Spec §5.5: is `include` a source of `object`, by the outline given. No request. */
  member(object: SourceObject, include: string, options: { outline: SourceOutline }):
    Located<{ include: string }>;
  /**
   * Spec §5.6: the container located in `source.text` (by `part`, with the same outline), the new
   * name checked absent in its scope of `outline` (`already_exists`), the anchors from the scanner.
   */
  insertion(object: SourceObject, container: InsertContainer, element: InsertElement, options: {
    version: AdtReadVersion; source: { include: string; text: string }; outline: SourceOutline;
  }): Promise<Located<{ container: ContainerBlock; anchors: InsertAnchors }>>;
}
type CodeAnalyzerFactory =
  (client: AnalyzerMembersFactory, connection: IAbapConnection) => CodeAnalyzer;

type InsertContainer =
  | { include: string }                                         // an include container
  | { address: FullAddress | ShortAddress } | { ref: string };  // class, local class, interface

type Edit =
  | { kind: 'replace'; target: Target; code: string }
  | { kind: 'insert'; container: InsertContainer;
      element: { type: 'form' | 'module' | 'event' | 'local_class' | 'local_interface'; name: string };
      code: string }
  | { kind: 'insert'; container: InsertContainer;                 // a class's method
      element: { type: 'method'; name: string };
      section: 'public' | 'protected' | 'private';
      definition: string; implementation: string }
  | { kind: 'insert'; container: InsertContainer;                 // an interface's method
      element: { type: 'method'; name: string };
      definition: string }
  | { kind: 'diff'; relative_to: 'element'; target: Target; diff: string }
  | { kind: 'diff'; relative_to: 'include'; include: string; diff: string };

interface UpdateSourcePartArgs {
  object: SourceObject;
  source_hash: string;
  etag?: string | undefined;
  transport_request?: string | undefined;
  edits: readonly Edit[];               // at least one
}
```

The schema enforces the two method shapes structurally: one with `section`, `definition` and
`implementation`, one with `definition` alone; any other combination is refused by the schema.
Which shape fits is known only once the container is resolved: a class container with the
interface shape, or an interface container with the class shape, is `insert_shape_mismatch`,
before anything is written.

### 1.5 Refusals

Every refusal is `{ code, message, …payload }`, a discriminated union on `code`. The message is
fixed words plus the payload's values, never SAP's text. It is answered as the tool's error answer
with the payload as fields.

| Code | Raised by | Payload |
|---|---|---|
| `not_found` | analyzer | `target` |
| `ambiguous` | analyzer | `target`, `matches: FullAddress[]` |
| `not_readable` | analyzer | `address` or `type`, `reason` (`informational` \| `get_events`) |
| `duplicate_address` | analyzer | `address` |
| `ref_invalid` | analyzer | `reason` (`undecodable` \| `foreign_include`) |
| `start_mismatch` | analyzer | `address`, `field` (`include` \| `type` \| `side` \| `name` \| `scope`), `line` |
| `end_mismatch` | analyzer | `address`, `sap_end_line`, `derived_end_line` |
| `include_not_member` | analyzer | `include`, `object` |
| `bad_nesting` | analyzer | `address`, `line`, `statement` (its first keyword) |
| `unbalanced` | analyzer | `address`, `line`, `terminator` |
| `crosses_include` | analyzer | `address`, `line` |
| `no_end` | analyzer | `address` |
| `inside_macro` | analyzer | `address`, `line` |
| `unlexable` | analyzer | `include`, `line` |
| `include_unknown` | analyzer | `include` (a link of no shape of spec §2.2) |
| `range_outside` | lib | `address`, `line_count` |
| `range_needs_one_target` | lib | `targets` (the count) |
| `range_with_size` | lib | — |
| `filter_without_parts` | lib | `filters` (their names) |
| `targets_empty`, `edits_empty` | lib | — |
| `edits_with_source` | lib (compact) | — |
| `source_changed` | lib | `source_hash` (current), `etag?` (current), `reason` (`hash` \| `etag` \| `include_moved`) |
| `edits_span_includes` | lib | `includes: [string, string]` |
| `edits_overlap` | lib | `edits: [number, number]` (indexes) |
| `relative_to_required` | lib (schema) | — |
| `diff_malformed` | lib | `edit`, `hunk?`, `line`, `reason` (`header` \| `counts` \| `no_newline_marker` \| `new_start` \| `line_prefix`) |
| `hunk_mismatch` | lib | `edit`, `hunk`, `line` |
| `hunk_outside` | lib | `edit`, `hunk`, `element_lines` |
| `hunks_overlap`, `hunks_order` | lib | `edit`, `hunks: [number, number]` |
| `shares_lines` | lib | `address`, `shares` |
| `spans_includes` | lib | `includes: [string, string]` |
| `section_missing` | lib | `address`, `section` |
| `already_exists` | lib | `address` |
| `not_writable` | lib | `include` |
| `insert_shape_mismatch` | lib | `container` (`class` \| `interface`), `edit` |

SAP's refusal of a member's request is the `SapAnswer`, and reaches the model as today's `answer()`
gives a member's failure: the response kept, SAP's message as SAP wrote it.

## 2. Shared tables

### 2.1 Event statements (design §5.2, the `PE` row)

An event statement is recognised by its leading tokens, compared case-insensitively:

| Leading tokens | Opens an event block |
|---|---|
| `LOAD-OF-PROGRAM` | yes |
| `INITIALIZATION` | yes |
| `AT SELECTION-SCREEN`, alone or with `OUTPUT`, `ON …`, `ON END OF …`, `ON BLOCK …`, `ON RADIOBUTTON GROUP …`, `ON HELP-REQUEST FOR …`, `ON VALUE-REQUEST FOR …`, `ON EXIT-COMMAND` | yes |
| `START-OF-SELECTION` | yes |
| `END-OF-SELECTION` | yes |
| `TOP-OF-PAGE`, alone or with `DURING LINE-SELECTION` | yes |
| `END-OF-PAGE` | yes |
| `AT LINE-SELECTION` | yes |
| `AT USER-COMMAND` | yes |
| `AT PF<nn>` (`PF` followed by digits only) | yes |
| `AT` with anything else (`AT FIRST`, `AT NEW`, `AT END OF`, `AT LAST`) | no: a control level in a loop |
| `GET <node>` | not handled: `GET` is also an ordinary statement (`GET TIME`, …) |

- **Identity**: the statement's tokens up to its `.`, blanks collapsed, equal the outline's name,
  compared case-insensitively; else `start_mismatch` `name`.
- **End**: the last statement before the next statement that opens an event block (above), or
  `FORM`, `MODULE`, `FUNCTION`, `CLASS … IMPLEMENTATION`, or before the include's end.
- **Refused inside an event's range**: `CLASS … DEFINITION`, `INTERFACE`, `DEFINE` (`bad_nesting`:
  whole lines would carry a declaration that is not the event's); `INCLUDE` (`crosses_include`).
- **`GET` events**: when the outline lists any `PE` whose name starts with `GET`, every event of
  that program is `not_readable` `get_events`, since their ends could run over a `GET` event.
  This is decided on every addressing path: by address and short form from the outline the read
  already takes; by `ref`, a `PE` target makes the read take the program's outline too (spec
  §2.3), so a `ref` made before a `GET` event appeared is refused like any other; under the lock,
  on its one outline read under the lock.

Unit inputs: every row as the start; every row as the end of a preceding event; `AT FIRST`,
`AT NEW`, `GET TIME` inside an event (not an end); each refused statement inside an event; a
program with a `GET` event.

### 2.2 Includes: link shape, reader, lock target, write

The analyzer reads an include link by plain string comparison against these shapes, names as SAP
writes them (lower case); any other shape is `include_unknown`. Lock and write targets are design
§7.2's table (adt-clients 48.0.0).

| Include link | Reader (`IncludeReaders`) | Lock target | Write |
|---|---|---|---|
| `/sap/bc/adt/oo/classes/<c>/source/main` | the class's `read` | the class | the class's `update` |
| `/sap/bc/adt/oo/classes/<c>/includes/implementations` \| `definitions` \| `macros` \| `testclasses` | `getLocalTypes()` / `getLocalDefinitions()` / `getLocalMacros()` / `getLocalTestClass()` `read` | the class | that accessor's `update` |
| `/sap/bc/adt/oo/interfaces/<i>/source/main` | the interface's `read` | the interface | its `update` |
| `/sap/bc/adt/programs/programs/<p>/source/main` | the program's `read` | the program | its `update` |
| `/sap/bc/adt/programs/includes/<i>/source/main` | the include's `read` | the include | its `update` |
| `/sap/bc/adt/functions/groups/<g>/includes/<i>/source/main` | the function include's `read` | the function include | its `update` |
| `/sap/bc/adt/functions/groups/<g>/fmodules/<f>/source/main` | the function module's `read` | the function module | its `update` |
| `/sap/bc/adt/functions/groups/<g>/source/main` | the function group's `read` | — | `not_writable` |

### 2.3 Request traces

Each path makes exactly these requests in this order; any other request fails its unit test.
"Navigation" is one request per element, all in one `/communication/batch` envelope on onprem and
cloud (both measured), one by one on any other variant.

| Path | Trace |
|---|---|
| outline: class, interface, program, include | `GET <object>/objectstructure` |
| outline: function group | `GET <group>/objectstructure`, `GET <its first listed include>/objectstructure` |
| part: class or interface, by address | the outline; one source `GET` per distinct include |
| part: class or interface, by `ref` | one source `GET` per distinct include (no outline, no navigation) |
| part: program, include or function group, by address | the outline (a group: both); navigation; one source `GET` per distinct include |
| part: program, include or function group, by `ref` | navigation; one source `GET` per distinct include (no outline, except for an event target: then the outline first, for the `GET`-event rule) |
| part: several targets in one include | as above, the source `GET` once |
| part: targets in two includes | as above, one source `GET` per include |
| part: function module (`FUGR/FF`, as the object or by address or `ref`) | the module's source `GET` (no outline, no navigation) |
| part with `source` and `outline` given (the locked write) | navigation where the path above has it; **no outline request, no source `GET`** |
| `member` | none (it reads the outline given) |
| `insertion` | navigation where its container's `part` has it; no outline request, no source `GET` |
| update | spec §5.8, the write-path trace table |


## 3. interfaces-adt, adt-clients, adt-strategies

### 3.1 `@mcp-abap-adt/interfaces-adt` (minor)

- **Added**: spec §1.1.
- **Tests**: type tests against structural fixtures only (hand-written objects): each atom
  accepts a conforming one and refuses one missing a member or with another signature. That the
  real `AdtUtils` conforms is adt-clients' test (spec §3.2), since its release adds
  `getNavigationTarget`.

- **Docs**: CHANGELOG, README atom list — at least these.

### 3.2 `@mcp-abap-adt/adt-clients` (minor)

- **Added**:
  - `AdtUtils.getNavigationTarget(uri, options)`: one request, `POST /sap/bc/adt/navigation/target`,
    query `uri` (and `filter`, `fullname` when given) encoded once as query values, no body,
    `Accept` the caller's or `application/xml`, `timeout: 0`, stateless; the answer through the
    `navigationTarget` slot (default `rawDocument`) and the caller's `analyse`.
  - A `NAVIGATION` record in `src/endpoints/objects.ts`.
  - `AdtUtils` implements both atoms; `getObjectOutline` and `getNavigationTarget` leave
    `AwaitingItsAtom`. A type test asserts the real `AdtUtils` satisfies both interfaces-adt atoms.
  - No partial-update member, no reading.
- **Tests**:
  - Unit: method, URL, the query for each option combination, headers, no body, one request per
    call, stateless; slot and `analyse` applied; the regression checks stay green.
  - Live, onprem and cloud: a form fragment and a local method's `implementationIdentifier`
    answer `200` with a `#start=` reference; a local method's `definitionIdentifier` as measured
    per system (cloud `400` EU/061; onprem the same href and start as the implementation link);
    three navigations through `AdtBatchConnection('communication')` equal their answers alone.
  - The answers recorded, sanitised, into `corpus/adt/answers/`.
- **Docs**: `docs/usage/ERRATA.md` (the `end` column before the period; a function group include's
  outline answers the group; the local method's links per system; `HEAD` on a source `400`),
  `README.md`, `docs/usage/CLIENT_API_REFERENCE.md`, `docs/architecture/ARCHITECTURE.md`,
  CHANGELOG — at least these.

### 3.3 `@mcp-abap-adt/adt-strategies` (minor)

- **Added**: `readNavigationTarget` (spec §1.2). `readObjectOutline` is unchanged: its links
  already carry `href`, the fragment and the position.
- **Tests**: unit over the corpus answers (form, module, local class, type, local method; the
  `400` exception and a reference without `start` read as `undefined`); the public surface test.
- **Docs**: README surface list, CHANGELOG — at least these.

## 4. `@mcp-abap-adt/adt-code-analyzer` (new, 0.1.0)

`packages/adt-code-analyzer` in mcp-abap-adt-clients, in the root's `publishOrder` after
adt-clients and adt-strategies, depending on them and on interfaces-adt by semver range.

### 4.1 Behaviour

- `new AdtCodeAnalyzer(options: AdtCodeAnalyzerOptions)` implements `outline` and `part` by the
  traces of spec §2.3. It builds members only through `options.client`: over `options.connection`,
  and over `new AdtBatchConnection(options.connection, { endpoint: 'communication' })` for the
  envelope. It never calls `makeAdtRequest` and writes no ADT path beyond the shape constants of
  spec §2.2.
- **Readable and addresses** per design §5.0: `scope` from the outline's nesting;
  `duplicateAddress` marking; a short form resolved only to exactly one match.
- **`ref`**: base64url of the UTF-8 JSON
  `{ "v": 1, "address": FullAddress, "link": string, "position"?: { "start": [l, c], "end": [l, c] } }`.
  Anything that does not parse to exactly this shape is `ref_invalid` `undecodable`; an
  `address.include` that does not start with the object's own ADT address is `foreign_include`.
  A class or interface `ref` takes its `position`'s start; a program `ref` navigates its `link`.
  Either way `scanner.locate` runs on the text read: identity, the end derived from the text, and
  (class, interface) the comparison with SAP's end. Stale is `start_mismatch` or `end_mismatch`. A
  write never takes the position or link as its location (spec §5.5).
- **The end is derived, always**: for every kind and every path, `firstLine`/`lastLine` come from
  `scanner.locate` over the text; SAP's `end` only feeds the `end_mismatch` comparison.
- **`member`**: an include is a source of the object when, in the outline given, it is the root's
  own source, the include of any element, or a listed include element (`PROG/I`, `FUGR/I`) or
  module (`FUGR/FF`); a class's local include (`…/oo/classes/<the class>/includes/<x>`) is the
  class's by its address, whether or not an element sits in it; a function module's one source is
  itself. Otherwise `include_not_member`.
- **`insertion`**: locates the container in `source.text` (an element container through `part`,
  both sides of a class); checks the new name against the given outline's elements in the
  container's scope (`already_exists`); asks `scanner.anchors`, which finds the section statement
  and its last statement (`section_missing`), the `ENDCLASS` / `ENDINTERFACE` line, or the
  include's last statement, each checked not to share its line (`shares_lines`); a class whose
  definition and implementation are in two includes is `spans_includes`.
- **Function modules**: a `FUGR/FF` element of a group's outline is readable, its address
  `{ include: <module source>, type: 'FUGR/FF', name, scope: [group], side: 'implementation' }`
  and a `ref` without position; its part is the whole module source. An object `FUGR/FF` is
  located the same way with no outline request; `getObjectOutline` is never called for it.
- **`source` given**: every target is located in `source.text`; a target whose include differs
  from `source.include` is `start_mismatch` `include`; no source `GET`. With `outline` given too
  (the locked write) no outline is requested and only the navigation is; without it the outline is
  requested once, as for any part read.
- **The lexer and `BlockEndScanner`**: design §5.2 and §5.4 and spec §2.1; identity over the whole
  address, scope from the lexer's own block stack. Plain string code.
- `LocatedPart.etag` is the `etag` header of the source read's wire answer.
- No hashing, no cache, no regular expression, no timer.

### 4.2 Tests

- **Lexer** (unit): `*` and `"` comments, `'…'` and `` `…` `` with doubled escapes, `|…|` with `\|`,
  `\{` and nested `{ … }`, `##` pragmas, chains, the terminating `.`; each `unlexable` case with
  its line.
- **Scanner** (unit): each table row; each nesting row accepted and refused (`METHOD` pairs inside
  `CLASS … IMPLEMENTATION` accepted; `FORM` in `METHOD`, `CLASS` in `CLASS`, `ENDFORM` while a
  `METHOD` is open refused); every fail-closed rule; spec §2.1's inputs; `DEFERRED`, `LOAD`,
  `LOCAL FRIENDS`; a start inside a macro; a terminator inside a macro body.
- **Identity** (unit): each address field changed alone is `start_mismatch` with that `field`; a
  stale position on a same-named method of another local class; a navigated start on a `METHODS`
  declaration while `implementation` is asked, and the reverse.
- **Derived end** (unit): a class position with the right start and an end at a later method's
  `ENDMETHOD` is `end_mismatch`; a declaration whose SAP end spans `TYPES BEGIN OF` … `END OF` as
  separate statements is `end_mismatch` (fail-closed).
- **`member` and `insertion`** (unit): a listed include, an element's include, a class local
  include with no element, a module; an include of another program (`include_not_member`); each
  anchor kind; `section_missing`; a shared `ENDCLASS` line; `already_exists`; `spans_includes`.
- **`GET` events** (unit): an event read by address, by short form and by a `ref` made before a
  `GET` event was added: each `not_readable` `get_events`, the `ref` read's trace including the
  outline.
- **Boundary** (unit): `ENDMETHOD. METHOD b.`; a chained declaration; a trailing comment and pragma
  after the end (accepted); ABAP Doc above a declaration (outside the part).
- **Addresses and `ref`** (unit): duplicates; the short form with zero, one, two matches; `ref`
  round trip; each `ref_invalid` reason; a stale `ref` of each kind.
- **Traces** (unit, recording connection): every row of spec §2.3 exactly, per variant; a function
  module never requests an outline; `source` given makes no source `GET`.
- **No limits** (unit): 500 navigation targets go in one envelope, uncapped; SAP's refusal of the
  envelope is the `SapAnswer`, never a partial success.
- **Sources** (unit): a scan of the package refuses `makeAdtRequest`, an ADT path literal outside
  the shape constants, a regular expression literal or `RegExp`, and a timer.
- **Live**: spec §6's rows.

### 4.3 Docs

The package README (what it answers, the seams, the closed tables, the refusals, a custom
`BlockEndScanner` example), its CHANGELOG — at least these. The repository's CLAUDE.md package list
is the owner's to change.

## 5. mcp-abap-adt 24.3.0

### 5.1 The seam and the hash

- `CodeAnalyzer`, `CodeAnalyzerFactory` (spec §1.4); the optional `codeAnalyzer` on the server
  options and the `HandlerExporter` options; every composition root passes the shipped one. lib
  builds the `AnalyzerMembersFactory` from `createAdtClient(connection, { variant })` with
  `rawDocument` for the outline and navigation and `wireItself` for every include reader.
- `sourceHash(text)`: SHA-256, lowercase hex, UTF-8 bytes of the text as received.

### 5.2 `part: "size"` on the source reads

| Tool | Sized source |
|---|---|
| `GetClass` | class `source/main` |
| `GetLocalTypes`, `GetLocalDefinitions`, `GetLocalMacros`, `GetLocalTestClass` | that class include |
| `GetInterface` | interface source |
| `GetProgram` | program source |
| `GetInclude` | program include source |
| `GetFunctionModule` | module source |
| `GetFunctionInclude` | function include source |
| `GetDdl`, `GetBehaviorDefinition`, `GetBehaviorImplementation`, `GetServiceDefinition`, `GetMetadataExtension`, `GetTable`, `GetStructure` | the source that tool reads today |

Each answers `source` (its ADT address), `version`, `bytes`, `lines`, `source_hash`, `etag?` from
the one GET, with no text; lines as `sourceRange.ts` counts them. `start_line` / `end_line` with
`part: "size"` is `range_with_size`, before the GET. Availability: the tool's `available_in`
today, off on legacy (spec §5.7).

### 5.3 `GetObjectOutline`

`PROG/I` added. `view` (`kinds` | `parts`); with `parts` only: `element_types: string[]`,
`element_name: string` (exact, or `*` as any run of characters; plain matching), `parent: string`
(the innermost `scope` name). Without `view` the answer is today's at every `detail`, byte for
byte. A filter without `view: "parts"` is `filter_without_parts`, before any request. `kinds`
answers `[{ type, count }]` and `[{ include, count }]`; `parts` answers an `OutlineElement` per
element, with `address` and `ref` on the readable ones.

### 5.4 `GetSourcePart` (read-only and full sets)

`object_type`, `object_name`, `function_group` (with `FUGR/FF`), `version` (default `active`),
`targets` (each `{ address }` or `{ ref }`, at least one, else `targets_empty`), `start_line` /
`end_line` (relative to the element; only with one target, else `range_needs_one_target`).
Answers per element: `address`, `include`, `text` (its lines, or the range), `first_line`,
`last_line`, `line_count`, `shares`, and the include's `source_hash` and `etag?`. A range outside
the element is `range_outside`.

### 5.5 `UpdateSourcePart` (write sets)

Arguments: `UpdateSourcePartArgs` (spec §1.4). The sequence:

1. **Before the lock (not authoritative)**: the include of every edit: an include-relative diff's
   or an include container's `include`; a full address's `include`; a `ref`'s decoded
   `address.include`; a short form's, from one `outline` call before the lock (its only use: the
   include, so the lock target is known). All must be one, else `edits_span_includes`. The lock
   target from spec §2.2.
2. **Under the lock** (`withLock`): that include's reader `GET`s it once, at `inactive`: T and its
   `etag`. `sourceHash(T)` must equal `source_hash`, else `source_changed` `hash`. A passed `etag`
   must equal SAP's when SAP served one, else `source_changed` `etag`.
3. **One outline, membership and location in T**, all from reads made under the lock:
   - `analyzer.outline(object, { version: 'inactive' })` once: O (a function group: its two
     outline requests; a function module: none, O is the module alone). O is the only outline
     under the lock; a short form's pre-lock outline (step 1) only names the include;
   - `analyzer.member(object, include, { outline: O })` for every call, whatever its edits: the
     include must be a source of the object by O, else `include_not_member`. This is the only
     authority for an include-relative diff and an include container;
   - `analyzer.part(object, targets, { version: 'inactive', source: { include, text: T }, outline: O })`
     for every replace and element-relative diff target: navigation where needed, located in T,
     the end derived from T, identity and boundary checks on T. A target now in another include
     is `source_changed` `include_moved`;
   - `analyzer.insertion(…, { version: 'inactive', source: { include, text: T }, outline: O })` for
     every insert, and the method shape checked against the resolved container
     (`insert_shape_mismatch`).
   Every pre-lock location is discarded.
4. The merge on T (spec §5.6); one write of the merged text with the lock target's handle; unlock.
5. The answer: each edit with its new line range, and `sent_hash`.

### 5.6 The merge and the diff grammar

- `replace`: the element's whole lines; `shares_lines` when `shares` is not `none`.
- `insert`: lib splices the code at the anchors `analyzer.insertion` answered (after
  `afterLine`, after `definitionAfterLine` and before `implementationBeforeLine`, before
  `definitionBeforeLine`); every check is the analyzer's (spec §4.1), so lib runs no lexer of its
  own.
- Line ends and the final line end: design §7.2.
- **The diff grammar** (plain string code):
  - hunks only; any line before the first `@@` is `diff_malformed` `header`; file headers (`---`,
    `+++`) are not accepted;
  - a hunk header is exactly `@@ -a,b +c,d @@`, optionally followed by a space and any text; both
    counts are required; integers without sign or leading zeros (`0` alone allowed);
  - a hunk line starts with ` `, `-` or `+`, else `diff_malformed` `line_prefix`; context and
    removed lines number `b`, context and added lines `d`, else `diff_malformed` `counts`;
  - `\ No newline at end of file` is valid only right after the last line of the last hunk, only
    with `relative_to: "include"`, and only when that line is the include's last; on the removed
    side it states the include ends without a line end, on the added side that it will; anywhere
    else `diff_malformed` `no_newline_marker`;
  - `a` is the first old line; for `b = 0` it is the line after which lines are added (`0` = before
    line 1); `c` must equal `a` plus the net lines added by earlier hunks, plus 1 when `b = 0` and
    `d > 0` (a pure addition), minus 1 when `d = 0` and `b > 0` (a pure deletion: `@@ -5,1 +4,0 @@`
    is valid), else `diff_malformed` `new_start`; a hunk with `b = 0` and `d = 0` is
    `diff_malformed` `counts`;

  - hunks ascend by `a` (`hunks_order`); their old ranges and addition points are disjoint
    (`hunks_overlap`);
  - every old line equals the text at its position, line ends excluded (`hunk_mismatch`);
  - element-relative: every old line within `1..n` (`hunk_outside`); a pure addition at `0` or `n`
    is `hunk_outside`, at `1 ≤ k < n` accepted; the element's `shares` must be `none`
    (`shares_lines`);
  - any refusal applies nothing.

### 5.7 Sets, compact, batch, legacy

- `GetSourcePart` in the read-only and full sets; `UpdateSourcePart` in the write sets;
  `available_in` per object kind (spec §6).
- **Compact**:
  - `HandlerGet` `part: "size"` with the object arguments of that kind's source read;
    `part: "source_part"` with `object_type`, `object_name`, `function_group`, `version`,
    `targets`, `start_line`, `end_line`; `part: "object_structure"` gains `view`,
    `element_types`, `element_name`, `parent`. Validation and answers as the full tools.
  - `HandlerUpdate` gains `edits`, `source_hash`, `etag` for the source kinds; `edits` with
    `source` is `edits_with_source` before any request. One call.
- **Batch mode**: `GetSourcePart`, `UpdateSourcePart`, `source_part` and the outline `view`s are
  "Runs outside batch mode" in `tools/batch-handlers.json`; `part: "size"` is recordable as its
  read is.
- **Legacy**: the legacy sets list neither new tool; on legacy the schemas of the source reads, of
  `GetObjectOutline` where listed, and of `HandlerGet` / `HandlerUpdate` omit `size`,
  `source_part`, `view`, the filters and `edits`. A call that passes them is refused by the
  schema, and the dispatch sends no request.
- **Descriptions**: functional; the literal-scan test covers the new tools and parameters.

### 5.8 Tests

- **Schemas** (unit): every accepted and refused shape, per variant, legacy included; each lib
  refusal of spec §1.5 raised before any request where it can be.
- **Size** (unit): every tool of spec §5.2; empty source, final line feed, CRLF, mixed line ends;
  `etag` taken from the wire answer's header and absent when SAP sends none; hash known vectors.
- **Outline** (unit): without `view` byte-identical to today's answers on the recorded documents;
  the views and filters; no view chosen by size (a 3 MB recorded outline answers whole when
  asked, `kinds` only when asked).
- **Write path through the real analyzer** (unit; recording connection; the shipped
  `AdtCodeAnalyzer` and scanner, not a fake):
  - the happy path's trace is exactly, per case ("outline" is one `GET …/objectstructure`, a
    function group's two, a function module's none):

    | Case | Trace |
    |---|---|
    | full address, `ref`, include-relative diff, include container | `LOCK`; source `GET`; outline; navigation (program elements only); `PUT`; `UNLOCK` |
    | at least one short form | outline (before the lock, for the include); `LOCK`; source `GET`; outline; navigation (program elements only); `PUT`; `UNLOCK` |

    `LOCK` and `UNLOCK` stateful, the rest stateless. The `PUT` body is T with the edits applied,
    byte for byte. Any request beyond its row fails the test: a second source `GET`, an outline
    under the lock beyond the one, an outline before the lock without a short form;
  - drift, each row asserting its result, and for a refusal zero `PUT` and `UNLOCK` sent:

    | Hash | Caller `etag` | SAP `etag` | Result |
    |---|---|---|---|
    | equal | equal | present | written |
    | equal | differs | present | `source_changed` `etag` |
    | equal | present | absent | written |
    | equal | absent | present | written |
    | differs | equal | present | `source_changed` `hash` |

  - safety, each asserting its refusal, zero `PUT` and `UNLOCK` sent: a matching hash with a stale
    position on a same-named method of another local class (`start_mismatch` `scope`); a stale
    `ref`; a `replace` of `a` in `METHODS: a, b.`; an element-relative diff of it; an
    element-relative hunk outside the element whose text matches; an insert whose definition and
    implementation are in two includes; a short form whose element moved to another include
    (`source_changed` `include_moved`); **a matching hash and a class position whose start is
    right and whose end lies at a later method's `ENDMETHOD`** (`end_mismatch`); an
    include-relative diff and an include-container insert into an include of another object
    (`include_not_member`); a class-shaped method insert into an interface
    (`insert_shape_mismatch`); an event `replace` in a program with a `GET` event;

  - a failure after the lock (SAP refusing the `PUT`, a throw in the merge) still sends `UNLOCK`;
  - the lock and write target of every row of spec §2.2.
- **Merge and diff** (unit): every rule of spec §5.6, each refusal with its payload; pure additions
  at `0`, `n` (refused) and `1 ≤ k < n` (accepted); `new_start` for each hunk form: a change
  (`b > 0`, `d > 0`), a pure addition (`@@ -3,0 +4,2 @@`), a pure deletion (`@@ -5,1 +4,0 @@`),
  each accepted with the right `c` and refused with a wrong one, after earlier hunks that add
  and that remove lines; `b = 0`, `d = 0` refused; `\ No newline at end of file` in valid and
  invalid places; line ends kept; ABAP Doc lines untouched by a `replace`.
- **Seam** (unit): an embedder's `codeAnalyzer` is called and the shipped one is not.
- **Compact parity** (unit): each compact part and the update answer exactly what the full tool
  answers on the same recording.
- **Legacy** (unit): the legacy tool lists, the schemas without the new fields, and a direct
  dispatch with them: zero requests.
- **Prompts and listed-tool snapshots** updated.
- **Live**: spec §6.
- **SAP's storage, measured** (live, onprem and cloud, a shared test class and include): write a
  text with CRLF lines, an LF line, trailing blanks and no final line end; record the text sent,
  `sent_hash`, the text read back, its hash and every difference. The result goes into
  `SOURCE_PARTS.md` §2 and the ERRATA. `sent_hash` is documented as the hash of the text sent,
  never as the stored one.

### 5.9 Docs

At least: `docs/architecture/SOURCE_PARTS.md` (measured facts as measured);
`docs/user-guide/SOURCE_PARTS.md` (new: the size → outline → part → update workflow with an
example; recovering from `source_changed` and `start_mismatch`; the new hash after a write, from a
size read; activation after); `AVAILABLE_TOOLS*.md` (generated); `BATCH_MODE.md`; `README.md`;
`HANDLER_EXPORTER.md` and `ARCHITECTURE.md` §5 (a custom analyzer, with an example);
`docs/development/tests/` and the test-config template (the new shared objects and keys);
CHANGELOG 24.3.0. No migration note: nothing existing changes. Before the release every measured
fact of this spec is in `SOURCE_PARTS.md` or the ERRATA; then the goal, this spec and the plan
leave the tree.

## 6. Live coverage

Objects come from the test config. The new shared objects are created by `shared:setup` and
checked by `shared:check`: a test class with local classes, local test classes and ABAP Doc; a
test interface; a test function group with forms, modules, a local class and a function module;
onprem, a test program with events, forms, modules, local classes and an include. "—" is not
available there; "unit" is covered by unit tests only.

| Object kind | Operation | Onprem | Cloud |
|---|---|---|---|
| class `source/main` | size, outline views, part (method implementation and definition, class definition), replace, insert method, element diff, include diff | live | live |
| class local includes | part, replace under the class's lock, ABAP Doc kept | live | live |
| interface | size, outline views, part, replace, insert method | live | live |
| program (main) | size, outline views, part (event, form, module, local class definition and implementation, local method), replace, insert form | live | — (no outline, no writes) |
| program include | size, part, replace under the include's lock | live | — |
| function group include | outline (by include), part (form, module, local method), replace under the include's lock | live | live |
| function module | size, part, include diff under the module's lock | live | live |
| function group main source | write | unit (`not_writable`) | unit |
| local method links | identity decides the side | live | live |
| SAP's storage of line ends | measured | live | live |
| legacy | everything new | unit (zero requests) | — |

Hard mode: one targeted run of the new tools through the MCP server per system.

## 7. Release gates

For each package, before its tag:

- interfaces-adt: its types-and-constants check is green; the new contracts are exported (the
  surface test).
- Every consumer's `package.json` names the published version by a semver range and installs it
  from the registry; the lockfile has no `"link": true` but the repository's own workspace
  siblings, and every third-party entry resolves from the registry.
- After publishing: a clean install of the package from the registry in an empty directory outside
  the repository succeeds and its entry loads; for mcp-abap-adt, `test:install` before and
  `release:verify` after, as the release guide states.
