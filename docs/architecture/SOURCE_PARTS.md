# Source Code Whole or in Parts

How a model reads an ABAP object's source whole or in parts, and how it changes one part
without holding the whole object in its context. This document is the design. The spec and
the plan follow from it.

## 1. Scope: three groups, one of them changes

What MCP reads falls into three groups:

| Group | What | Design here |
|---|---|---|
| 1. Information about a set of objects | search results, dumps, package contents, transport tasks | unchanged: these already answer at `detail` levels |
| 2. Metadata as an XML document | domains, data elements and the other objects whose characteristics are XML | unchanged: such a document can hardly be made smaller |
| 3. Source code | classes, interfaces, programs, includes, function groups and modules | **read whole, as today, or in parts; and changed in parts** |

Every rule below applies to group 3 only.

The model works in four steps, each optional:

1. **Size.** It reads the object's size (lines, bytes, hash) and decides whether to read the
   object whole or to read the outline.
2. **Outline.** It reads the kinds of elements with their counts, then the elements of the kinds
   or names it wants.
3. **Part.** It reads one element, several elements, or a line range inside one element.
4. **Partial update.** It replaces an element by name and kind, adds one, or sends a diff
   relative to the element it read. The server merges that into the whole source and writes the
   whole source.

The object's size drops out of the model's context. What the model holds is the outline (or the
part of it that was asked for) and the elements it touches.

## 2. Measured facts this design rests on

Read-only measurements. Onprem numbers come from the PR's measurements of 2026-11-27. Cloud
numbers were measured on ABAP Cloud on 2026-11-28 unless another date is given.

**Why parts at all (onprem, 2026-11-27).** Whole reads are fast: the largest class answers
2.3 million characters in 1.4 s, and the largest program 5.4 million in 0.7 s. At roughly 3 to 4
characters a token (an estimate), that is 0.6 to 1.8 million tokens, beyond a model's context.
The bound is the model's context, not ADT's response time. So nothing here makes a read faster;
it makes the answer smaller.

**The outline (`GET <object uri>/objectstructure`, adt-clients' `getObjectOutline`):**

- **Class (onprem and cloud).** Every element's links carry a position,
  `<include>#start=l,c;end=l,c`. Lines count from 1 and columns from 0, and `end` is exclusive.
  The include is `./source/main` or one of the class's local includes (`./includes/testclasses`,
  `./includes/implementations`, `./includes/macros`).
  - Cloud: 332 blocks of two classes were checked against the sources they point into, in
    `main`, `implementations` and `testclasses`. Every `implementationBlock` of a method or a
    local method starts at its `METHOD` and ends at its `ENDMETHOD`, with 0 mismatches.
  - A block's `end` column stops **before** the closing period (`…;end=205,8` ends after
    `ENDMETHOD`, not after `ENDMETHOD.`).
  - A method's `definitionBlock` is its declaration. In a chained declaration (`METHODS: a, b.`),
    it starts at the chain's keyword.
  - The class's own `definitionBlock` is the `CLASS … DEFINITION` … `ENDCLASS` block: the
    attributes, the method signatures and the types, without any method body.
  - The ABAP Doc lines above a declaration lie outside its block.
- **Interface (onprem and cloud, 2026-11-04).** Positions are given as for a class.
- **Program (onprem).** The outline names events (`PROG/PE`), forms (`PU`), modules, local
  classes (`PL`) and their methods (`PLM`), data, types and includes. It carries **no position**:
  each link is a name fragment, `…/source/main#type=PROG%2FPU;name=X`, in the include the element
  lives in. The outline of one large program is 3 MB, with 519 local classes and 2850 methods.
  Programs on cloud have no outline.
- **Function group.**
  - On cloud, the group's own outline lists only its function modules and its includes.
  - The outline of **one of its includes** (`/programs/includes/<include>/objectstructure`)
    answers the whole group, rooted at `FUGR/F`. Measured on a delivered group: 29 modules,
    62 forms, 10 local classes with 45 methods, 3 modules and the data and types, each one a name
    fragment in its include.
  - Onprem: an include's outline names forms, data, modules and includes (469 KB for one large include).
- **A local method's fragment** names the class padded to 30 characters plus the method
  (`name=LCL_X<spaces>INVALIDATE`). The element itself carries `adtcore:name` (the method) and
  `clif_name` (the class).

**Navigation (`POST /sap/bc/adt/navigation/target?uri=<fragment>`):**

- It resolves a name fragment to `adtcore:objectReference adtcore:uri="<include>#start=l,c"`: the
  line of the element's statement, and the column of its name.
- Onprem: measured for a form and an event.
- Cloud, on a function group's elements:
  - form, module, local class and type: `200`;
  - a local method's `implementationIdentifier`: `200`, line `METHOD invalidate.`;
  - a local method's `definitionIdentifier`: **`400` `uriMappingError`, EU/061 "Object … not
    found"**.
- Every start was checked against the include's source.
- Navigation gives the start only. The end is not given.

**The batch envelope:**

- Cloud: three independent navigation POSTs in one `/sap/bc/adt/communication/batch` envelope
  answered `202`, with every part `200` and the same answer as when sent alone.

**The source read:**

- ADT serves no part of a source, measured onprem on 2026-11-04 (`src/lib/handlers/sourceRange.ts`).
- `HEAD` on a source answers `400` (cloud).
- A source `GET` carries `etag` and `last-modified` (cloud).

**Onprem, measured on a large program (2026-11-28):**

- A local method's `definitionIdentifier` and `implementationIdentifier` are the same href
  (`#type=PROG%2FPLM;name=…`); navigating either answers `200` at one `#start`. So onprem the
  links do not tell a definition from an implementation (cloud refuses the definition link with
  `400`).
- A form navigated answers `200` at its `FORM` statement.
- Three navigations in one batch envelope answered `202`, each part equal to its answer alone.
- `HEAD` on a source answers `400`.

**Navigation never decides the side.** Where a start comes from navigation, which side it is
(definition or implementation) is decided by the lexer and the identity check (§5.2) on the text,
never by which link was navigated.

## 3. Where each piece sits

```text
mcp-abap-adt (lib)         tools, the outline views, size and the hash, the merge, the drift check,
  |                        the write sequence
  |  calls the analyzer through the contract lib declares (CodeAnalyzer)
  v
@mcp-abap-adt/adt-code-analyzer   AdtCodeAnalyzer: outline + parts; the lexer and the block-end scanner
  |  calls members only, one request each
  v
@mcp-abap-adt/adt-clients   members: getObjectOutline, getNavigationTarget (new), the source reads,
  |                         the CRUD
  |                         AdtBatchConnection: an IAbapConnection that packs the members' requests
  |                         into one /communication/batch envelope (exists today)
@mcp-abap-adt/adt-strategies  readings: readObjectOutline, readNavigationTarget (new)
  v
@mcp-abap-adt/connection    the IAbapConnection the envelope, or each request alone, is sent on;
                            unchanged
```

Two words are kept apart below. A **request** is one member's one ADT request. An **envelope** is
one HTTP exchange of `AdtBatchConnection` that carries several requests.

| Piece | Package | What changes |
|---|---|---|
| Connection | `@mcp-abap-adt/connection` | nothing |
| Navigation member | `@mcp-abap-adt/adt-clients` | `AdtUtils.getNavigationTarget(uri, options)`: one `POST /sap/bc/adt/navigation/target`; its address in `endpoints/objects.ts` |
| Navigation and outline atoms | `@mcp-abap-adt/interfaces-adt` | the atoms that declare `getNavigationTarget` and `getObjectOutline` (`factoryReturnsCoverClass` refuses an `AdtUtils` member that no atom declares; `getObjectOutline` waits there for its atom today) |
| Navigation reading | `@mcp-abap-adt/adt-strategies` | `readNavigationTarget`: the reference's include and its `start` |
| Analyzer | `@mcp-abap-adt/adt-code-analyzer` (new, `packages/adt-code-analyzer` in the mcp-abap-adt-clients repository) | `AdtCodeAnalyzer`, the lexer, the block-end scanner |
| Tools, merge, write | mcp-abap-adt `lib` | §8 |

adt-clients gets **no partial-update member** and no reading. It always takes the whole source.

## 4. `AdtCodeAnalyzer`

### 4.1 What it is

A composer above the one-endpoint members. It answers two things:

- **`outline(object, version)`**: SAP's outline document as it came, its tree as
  `readObjectOutline` reads it (the hierarchy, every link), and beside them a flat list of every
  element. Each listed element carries its kind, its name, its scope, the include it lives in, its
  position wherever SAP states one, and `readable`: whether it can be read as a part (§5.0). Only
  a readable element carries **its address** (§5.0), the address `part` takes. The document and
  the tree are what today's `GetObjectOutline` answers are built from; the list is new.
- **`part(object, elements)`**: each element located in its include. For each one it answers the
  include's address, the include's whole text as read, the element's first and last line (and,
  where SAP gives them, its start and end columns), and whether the element shares a line or a
  statement with another (§5.4). The tools cut the element's lines from this, and the write
  merges into it (§7). One read path serves both. The analyzer computes no hash: lib hashes the
  text it is given (§7.2).
- **`part(object, elements, { version, source })`** with a source given: the same, located in
  that text instead of a text the analyzer reads. The outline and the navigation are read afresh
  for the call; nothing comes from a cache. A locked write calls it this way (§7.2), so what is
  hashed, located and merged is one text.

It is **not a member** of any object client and builds **no request**: it never calls
`makeAdtRequest` and writes no ADT address. Every request it causes is a member's, one request
each:

- `getObjectOutline` (the outline);
- `getNavigationTarget` (an element's start, programs and function groups only);
- the include's source read.

The one-member-one-endpoint rule therefore holds for every member it calls, while the analyzer
chains them. This is the same line adt-clients' decision 15 draws for a consumer's sequence:
the sequence belongs to the consumer, and here the analyzer is that consumer. A test in its
package refuses a `makeAdtRequest` call and an ADT path literal in its source.

### 4.2 Why a package of its own

It lives next to adt-strategies in the mcp-abap-adt-clients repository, as its own package
`@mcp-abap-adt/adt-code-analyzer`. It is in neither adt-clients nor adt-strategies.

- **Not in adt-clients.** adt-clients interprets nothing (decision 15): it ships only the
  document, and every member makes one request. The analyzer reads outlines, reads navigation
  answers, scans source and chains requests. That is exactly what adt-clients' regression checks
  refuse: a member that makes two requests, a reading under `src/`.
- **Not in adt-strategies.** A strategy is a reading or a verdict of one answer. It makes no
  request. The analyzer makes several.
- **Its own package** is a consumer of both, depending on them by semver range. It is published
  after them, in `publishOrder`.

### 4.3 How a consumer replaces it

There are two seams, each a contract declared where it is accepted (adt-clients' decision 17):

1. **The whole analyzer.** lib accepts an analyzer, so lib declares the contract its tools call
   (`CodeAnalyzer`: `outline`, `part`).
   - The server and the exporter take an optional factory, `codeAnalyzer(client, connection)`.
     `client` builds the members the analyzer calls over a connection it is given (so the
     analyzer can build them over an envelope too); lib builds it from its own adt-clients client
     and result sets. `connection` is the call's connection.
   - The composition roots pass the shipped `AdtCodeAnalyzer`.
   - An embedder passes its own: abaplint-based, cached, or anything else that satisfies the
     contract.
2. **Its collaborators.** `AdtCodeAnalyzer` takes them by constructor:
   - the members it calls, typed by the interfaces-adt atoms;
   - the outline reading and the navigation reading;
   - the block-end scanner (`BlockEndScanner`, declared in the analyzer package, which accepts
     it).

   A consumer can replace the scanner alone and keep the rest.

### 4.4 Batching

When one `part` call names several elements whose starts come from navigation, the analyzer can
send their navigation requests in one envelope, through adt-clients' `AdtBatchConnection`.
Measured on cloud, that is one round trip with each request answered as if sent alone. Each
navigation is still its own member call with one request; the envelope belongs to
`AdtBatchConnection`, not to the member.

The envelope is used per declared variant where it is measured to answer (cloud and onprem).
Anywhere else (legacy) each navigation request is sent alone, on the plain connection. Both give
the same starts.


A part read or a partial update cannot itself be recorded into the server's batch mode
(`HandlerBatch`). Each needs the answer of one request before it can build the next. So the new
tools are marked "Runs outside batch mode" in `tools/batch-handlers.json`.

## 5. Parts

### 5.0 Which elements are parts, and how one is named

**Readable or informational.** The outline lists every element SAP names. Only some of them can
be read as a part, and the outline marks which (`readable`):

| Object | Readable, on these sides | Informational only |
|---|---|---|
| class, interface | every element whose links carry a block position, on each side SAP gives one: `definition` (a `definitionBlock`), `implementation` (an `implementationBlock`). The class itself has both. | elements with no block position (an alias, a friend, the text pool link) |
| program, include, function group | the kinds of the scanner's table (§5.2), on the sides that table gives | every other kind: data, types, constants, parameters and the other declarations; includes (`PROG/I`, `FUGR/I`: read them as their own objects); the text pool |
| function group's function module (`FUGR/FF`) | its whole source, as the function module itself (§5.3) | — |

An informational element is listed with its kind, name, scope and include, so the model knows it
is there and which include to read. It has no address, and `GetSourcePart` refuses it, naming its
kind. A kind is never offered as a part when the analyzer cannot locate it.

**The address** names exactly one element:

```text
{ include, type, name, scope, side }
```

- `include`: the ADT address of the source the element lives in, as the outline's link names it
  (`./source/main` resolved, `…/includes/testclasses`, `…/includes/lzx_f01/source/main`);
- `type` and `name`: SAP's `adtcore:type` and `adtcore:name`;
- `scope`: the names of the enclosing elements, outermost first (`[]` for a top-level element; a
  local method's local class; a method's class);
- `side`: `definition` or `implementation`, one of the sides the element is readable on.

The outline's `parts` view answers each readable element's address whole. `GetSourcePart` and
`UpdateSourcePart` take it as it was answered. They also take a short form, `{ type, name }` with
any of the other fields: it is resolved only when **exactly one** readable element matches.
None is `not_found`. More than one is refused `ambiguous`, listing every matching address. No
match is ever chosen by order. `side` may be left out only where the element is readable on one
side.

**An address is unique, or there is none.** When two outline entries would have the same full
address, all of them are marked informational with `duplicate_address`, listed without an
address, and refused as parts naming the address; the short form never resolves to them. Their
lines are still reachable as a line range of the include, read by the include's own tool.

**The outline's link (`ref`).** In the `parts` view each readable element also carries `ref`: an
opaque string that holds its address and the SAP link it was located by (the block position of a
class or an interface, the navigation fragment of a program element). `GetSourcePart` and
`UpdateSourcePart` take `ref` in place of an address, and then read no outline for a part read:
the analyzer navigates the link (programs) or takes the position (classes), and reads the
include. The model reads nothing inside it. A `ref` is checked before it is used:

- it must decode, and its include must lie under the object's own ADT address (a plain prefix
  check), else `ref_invalid`;
- the located block must pass the identity check (§5.2) against the address the `ref` carries; a
  stale `ref` is refused `start_mismatch` and the model reads the outline again.

Under the lock a write reads the outline afresh in any case (§7.2); a `ref` there only names the
element.

### 5.1 A class or an interface: SAP's positions

- A part is the block the outline names:
  - a method's implementation: its `implementationBlock`;
  - a declaration: its `definitionBlock`;
  - a local class's definition or implementation;
  - the class's own definition: the attributes, signatures and types, without any method body.
- The analyzer takes the include from the link and the lines and columns from the position. It
  calls no navigation, and the scanner finds no end here. The lexer still runs over the include,
  for the boundary check of §5.4.
- A method has two sides, `implementation` and `definition`; an interface's method has only
  `definition`. For the class itself, `definition` is the "definitions first" read.
- **ABAP Doc stays outside.** The `"!` lines above a declaration are not part of its part, as
  SAP's blocks leave them out (§2). A `replace` of the element leaves them as they are; a change
  to them goes as a `relative_to: "include"` diff.

### 5.2 A program, an include, a function group: navigation plus the scanner

1. **Find the element.** The outline names it, with its include and its name fragment. For a
   function group, the analyzer reads the group's outline for its includes, then the outline of
   one include, which answers the whole group (§2).
2. **Find the start.** Navigation on the element's link gives its start line. For a local
   method, the link is the `implementationIdentifier` (cloud refuses the definition link; onprem
   both are one href). The start is then checked, not trusted: the identity check must find
   `METHOD <name>` inside `CLASS <scope> IMPLEMENTATION`, else `start_mismatch`. The method's
   declaration is read as part of its local class's definition.

3. **Find the end.** The block-end scanner finds it from the include's text and the start.

**The lexer and the scanner** are plain string code: character loops, with **no regular
expression** (the owner's rule). The lexer splits an include into statements. The scanner uses
it to find a block's end, and the boundary check of §5.4 uses it for every kind.

- The lexer reads the include from its first line, so it knows the lexical state at any start.
- It splits the text into statements. It knows:
  - full-line `*` comments and `"` comments;
  - `'…'` and `` `…` `` literals with their doubled-quote escapes;
  - `|…|` templates with their escapes and `{ … }` embedded expressions;
  - `##` pragmas;
  - chained statements (`:` and `,`);
  - the `.` that ends a statement.
- A keyword inside a literal or a comment counts for nothing. Keywords are compared
  case-insensitively.
- A literal or template still open at the end of its line, or a statement still open at the end
  of the include, makes the include **unlexable**: every part of it is refused, naming the line.

**The scanner's table is closed.** A kind it lists is readable on the sides it lists. Every other
kind is informational (§5.0) and refused as a part, naming the kind:

| Kind | Side | The opening statement (must be the one at the start) | The end |
|---|---|---|---|
| form (`PU`) | implementation | `FORM <name>` | the first `ENDFORM` statement after it |
| module (`PM`) | implementation | `MODULE <name>` | the first `ENDMODULE` |
| local class (`PL`) | definition | `CLASS <name> DEFINITION`, with none of the additions `DEFERRED`, `LOAD`, `LOCAL FRIENDS` | the first `ENDCLASS` |
| local class (`PL`) | implementation | `CLASS <name> IMPLEMENTATION` | the first `ENDCLASS` |
| local method (`PLM`) | implementation | `METHOD <name>` | the first `ENDMETHOD` |
| local interface (`PN`) | definition | `INTERFACE <name>`, with neither `DEFERRED` nor `LOAD` | the first `ENDINTERFACE` |
| event (`PE`) | implementation | the event statement the outline names (`START-OF-SELECTION`, `AT SELECTION-SCREEN …`, …) | the last statement before the next statement that opens an event block or one of `FORM`, `MODULE`, `FUNCTION`, `CLASS … IMPLEMENTATION`, or before the include's end; the blank and comment lines between are not part of it |

A local method's `definition` side is not in the table: it is read as part of its local class's
`definition` (§2: SAP's navigation refuses its declaration link).

**Fail-closed rules**, each a refusal naming the element and the include; the scanner never picks
another candidate:

- **Identity.** The located block must be the addressed element in every field of its address
  (§5.0), checked from the lexer's own reading of the text the call works on (under the lock,
  T of §7.2), never from the outline or the navigation answer:
  - `include`: the text is the include the address names;
  - `type` and `side`: the statement at the start is the row's opening statement for that kind
    and side;
  - `name`: its name token equals the element's name, compared case-insensitively;
  - `scope`: the lexer's stack of enclosing blocks at the start, outermost first, has the names of
    `scope` (a local method's start lies inside `CLASS <scope> IMPLEMENTATION`, and a top-level
    block inside none).

  Any field that differs is `start_mismatch`, and nothing is read or written: a stale position
  that lands on a method of the same name in another local class is refused, never taken. The
  same check runs for a class or an interface on SAP's positions.
- **Nesting.** The scanner keeps a stack of open blocks; each opener is closed by its own
  terminator only. What each kind permits inside it:

  | Block | May contain, each closed by its own terminator | Its end |
  |---|---|---|
  | `FORM`, `MODULE`, `METHOD` | no block of the table | its terminator |
  | `CLASS … DEFINITION`, `INTERFACE` | no block of the table (sections and declarations are statements) | its terminator |
  | `CLASS … IMPLEMENTATION` | `METHOD` … `ENDMETHOD`, any number, none nested | the first `ENDCLASS` with no `METHOD` open |
  | event | no block of the table | as in the table above |

  Anything else is refused: an opener not permitted where it stands (a `FORM` inside a `METHOD`,
  a `CLASS` inside a `CLASS`) is `bad_nesting`; a terminator that closes no open block, or the
  wrong one (`ENDFORM` while a `METHOD` is open) is `unbalanced`. For an event, an `INCLUDE`
  statement before its end is a cross-include construct (`crosses_include`).

- **End.** No end before the include's end is `no_end`. A form, module, class, method or interface
  never ends at the include's end.
- **Macros.** A `DEFINE` … `END-OF-DEFINITION` body is skipped as text up to its end statement,
  and its contents count for nothing: a block opener or an end keyword inside a macro is not a
  statement. A part whose start lies inside a macro body is refused (`inside_macro`).
- **Statements.** A `.` ends a statement only outside a comment, a literal, a template and its
  embedded expressions. Chained statements (`:`, `,`) are one statement.

The spec gives the full list of event statements and the test inputs of each rule.


### 5.3 A function module

A function module has no outline (`404`, measured 2026-11-04). It is one element, its whole
source:

- read whole, or by line range with today's `start_line` / `end_line`;
- changed by a `relative_to: "include"` diff against that source (§7.3).

### 5.4 Whole lines, and a part that shares a line

- **A part is whole lines**, from the block's first line to its last, exactly as SAP holds them
  (the goal's invariant). Because `end` stops before the period (§2), whole lines are what
  carries the period.
- **Locating and checking are two steps.** Locating gives the block: SAP's positions for a class
  or an interface (lines and columns, kept), navigation plus the scanner elsewhere. Checking runs
  the same lexer over the include, for every kind, and decides whether the block's whole lines
  hold only that element.
- The check reads the text around the block with the lexer, never by column arithmetic alone:
  - before the start on the first line: only blanks are allowed;
  - after the end on the last line: only the closing period, blanks, a `"` comment and a pragma;
  - the block's statement: it must not be a chain carrying another element. A chained declaration
    (`METHODS: a, b.`) is one statement for two elements, and SAP's block for `a` starts at the
    chain's keyword (§2).
- A part that fails the check **shares a line** (or a statement). Examples: `ENDMETHOD. METHOD b.`
  on one line, or one name of a chained declaration.
- Such a part is still read, and the answer says what it shares.
- Replacing such a part by element, or an element-relative diff of it, is **refused**, since
  whole lines would carry the other statement. A `relative_to: "include"` diff (§7.3) stays open
  for it.
- The check runs again under the lock before a `replace` (§7.2). A part read's answer is never
  trusted for a write.

### 5.5 A line range inside an element

`start_line` / `end_line` on a part read count from the element's first line (line 1). The
answer gives those lines, the element's line count, and the range's absolute lines in the
include. A diff relative to the element (§7.3) uses the same numbering. A model that read lines
400–460 of a 3000-line method can therefore write a hunk for them.

## 6. The outline answer

`GetObjectOutline` stays the outline tool, and it reads through the analyzer's `outline`.

- **Without `view`, its answer is today's, unchanged**, at every `detail` level: the
  hierarchical rows at `terse`, the tree at `medium` and `full`, SAP's document at `raw`. They are
  built from the document and the tree the analyzer keeps (§4.1), exactly as today. No address is
  added to them.
- It gains `PROG/I`: an include's outline, served on cloud for function group includes (§2).
- It gains two views, the new answers, given only when `view` is passed:

| Argument | Answer |
|---|---|
| `view: "kinds"` | each kind present: its code, its words and its count; and each include with its element count. No names. |
| `view: "parts"` | the flat list of addressable elements, each with its address |
| `element_types` | with `view: "parts"`: only elements of these kinds |
| `element_name` | with `view: "parts"`: only elements of this name, exact or a mask with `*` (plain string matching) |
| `parent` | with `view: "parts"`: only the children of this element (one local class's methods, say) |

The filters without `view: "parts"` are refused before any request. `view: "parts"` lists every
element with `readable`; a readable element carries its whole address (§5.0), exactly what
`GetSourcePart` takes (the goal's invariant: an outline names every piece the way the part read
takes it), and an informational one carries none. Elements of a class or an interface also carry
their lines. Program elements carry their include but no lines: navigation is not called for an
outline. `parent` matches the innermost name of `scope`.


So the model's path through a 3 MB outline is: `kinds`, then a filter, then the details. Which
view to ask is the model's choice; nothing switches views by size.

## 7. Partial update

### 7.1 The layer

Partial update lives in **mcp-abap-adt only**. It is a composition over CRUD, not CRUD:

- the analyzer gives the ranges;
- lib resolves the edits into the whole source of one include;
- lib writes that whole source through adt-clients' CRUD: lock, update, unlock.

adt-clients takes the whole source, always. **Activation stays a separate call.**

### 7.2 One call

`UpdateSourcePart` takes:

- the object;
- `source_hash`: the hash of the include source the model's reads answered;
- a list of edits, all in **one include**. Edits in two includes are refused, naming both. One
  call is one write.

The sequence, one snapshot under one lock:

1. **Lock** the lock target of the include (table below). From here on, whatever ends the call
   unlocks first: the sequence runs inside lib's `withLock` (`src/lib/strategies/withLock.ts`),
   which releases on every path after a successful lock and reports a lock it could not release.
2. **Read the include once**, under the lock, at `version: "inactive"`: the working version, the
   one the write replaces. Call that text **T**.
3. **Drift check.** `hash(T)` must equal `source_hash`. Otherwise the call is refused,
   `source_changed`, with the current hash, and nothing is written. A model that read the active
   version while an inactive one differs gets this refusal too, and reads again. The hash is the
   primary check. SAP's `etag` sits beside it: every size and part answer carries the `etag` SAP
   served with the read, where it served one, and a call that passes `etag` is refused
   `source_changed` too when SAP serves one under the lock and it differs. Where SAP serves none,
   the hash alone decides.
4. **Locate in T.** `part(object, elements, { version: "inactive", source: T })`: the outline and
   the navigation are read afresh under the lock, and every element is located in T, never in
   another read. The identity rule (§5.2) and the boundary check (§5.4) run on T: an outline or
   a navigation answer that does not describe T is refused (`start_mismatch`), not trusted.
5. **Merge into T**: the edits must not overlap, else a refusal naming both; they are applied
   bottom-up, so earlier ranges stay valid.
6. **Write** the merged text once, through the include's update with the lock target's handle,
   then unlock.
7. **The answer** names each edit with its new line range in the include, plus `sent_hash`: the
   hash of the text this call sent. It does not activate.

Only `LOCK` and `UNLOCK` are stateful; the reads and the write between them go stateless, as
every update handler of lib sends them today. While the lock is held nobody else can write the
include, so T is what SAP holds until the write.

**The source hash** is part of lib's contract, not of an analyzer: SHA-256, lowercase hex, over the
UTF-8 bytes of the source text exactly as received, nothing normalised. lib computes it, with
`node:crypto`, from the text the analyzer hands over: in size answers, in part answers and in the
drift check. A replaced analyzer therefore changes no hash, and lib imports no hashing from the
analyzer package.

**`sent_hash` is not a stored hash.** It describes the text sent. Whether SAP stores that text
unchanged (line ends, trailing blanks, a final line feed) is unmeasured; the spec measures it. Only
a later read proves what SAP holds: its hash is the one the next edit must carry.

**Character for character.** Every character outside the replaced lines is kept as read, line
ends included:

- Each untouched line keeps its own line end, so mixed line ends stay mixed.
- The include's final state is kept: with or without a closing line end.
- The new code's lines are joined with the line end of the first line they replace. An `insert`
  uses the line end of the line it is placed after. A line end inside the model's code (LF or
  CRLF) is replaced by that one; nothing else in the model's code is changed.

**The lock target and the write target, per kind**, from adt-clients' own CRUD (paths under
`packages/adt-clients/src/core/` of mcp-abap-adt-clients at the tag `adt-clients-v48.0.0`, the
version lib depends on; the published package ships `dist/` only, so the lines are the tag's
sources):


| The include | Lock target (`?_action=LOCK&accessMode=MODIFY`) | Write (`PUT … ?lockHandle=`) | lib's handler today, the same pairing |
|---|---|---|---|
| a class's `source/main` | the class, `class/lock.ts:26` | `source/main` of the class, `class/update.ts:38` | `handleUpdateClass.ts:101`, `:105`, `:151` |
| a class's `implementations` | the class: "ADT locks `/oo/classes/{name}`, never the include, and the PUT that writes the include carries the class's handle", `class/AdtClassMemberBase.ts:126-128` | `class/update.ts:63` | `handleUpdateLocalTypes.ts:97`, `:100`, `:112` |
| a class's `definitions`, `macros` | the class, as above | `class/includes.ts:141` (`updateClassInclude`) | `handleUpdateLocalDefinitions.ts:97`, `:100`, `:112`; `handleUpdateLocalMacros.ts:95`, `:98`, `:110` |
| a class's `testclasses` | the class, as above | `class/testclasses.ts:32` | `handleUpdateLocalTestClass.ts:113`, `:116`, `:128` |
| an interface's source | the interface, `interface/lock.ts:25` | `interface/update.ts:27` | `handleUpdateInterface.ts:101`, `:105`, `:134` |
| a program's main source | the program, `program/lock.ts:24` | `program/update.ts:25` | `handleUpdateProgram.ts:97`, `:101`, `:130` |
| a program include (`PROG/I`) | **the include itself**, `include/lock.ts:33` | `include/update.ts:24` | `handleUpdateInclude.ts:91`, `:95`, `:107` |
| a function group include (`FUGR/I`) | **the include itself**, `functionInclude/lock.ts:27` | `functionInclude/updateSource.ts:33` | `handleUpdateFunctionInclude.ts:118`, `:124`, `:140` |
| a function module | **the module itself**, `functionModule/lock.ts:25` | `functionModule/update.ts:29` | `function/high/handleUpdateFunctionModule.ts:133`, `:141`, `:167` |
| a function group's main source | — | — | not written: refused |

So an include of a program or a function group is locked as itself, never through its program
or group; a class's local includes are the one case where the parent's lock is the include's. The
handler paths are under lib's `src/handlers/`.


### 7.3 The edits

| Edit | What it names | Rule |
|---|---|---|
| `replace` (main path) | an element address (§5.0) and the new code | The element must exist in the outline, else a refusal naming it (never a guess). Its whole lines are replaced. A part that shares a line is refused (§5.4). |
| `insert` | a container (below), the new element's type and name, and its code | The container must exist; the new name must **not** exist in that scope, else a refusal. It is placed where its kind belongs in the container (below). |
| `diff` (fallback) | a unified diff, with `relative_to: "element"` and the element, or `relative_to: "include"` | Each hunk applies only where its context and removed lines equal the source **exactly**, at the position it states. A hunk that does not match is refused, naming the hunk; nothing is applied. No fuzz, no offset search, nothing partial. |

**`insert` is one include and one write.** What it locates is the **container**, which exists;
the new element has no address until it is written. A container is one of two things:

- **an include container**, `{ include }`: an include the object's outline names (the root's
  source, a listed program or function group include, a class's local include). This is not an
  element address: an include listed as an element is informational for reading (§5.0), but its
  address names the source an insert goes into;
- **an element container**: the full address (§5.0) of a readable class, local class or interface.

Every place it writes is in the container's include, so the call stays one include, one write,
and activation stays separate:

| New element | Container | Placed | Refused when |
|---|---|---|---|
| form, module, event, local class, local interface | an include container | after the include's last statement, before any trailing comment lines | the include is not one the outline names (`not_found`) |
| method of a class (global, or local in one include) | the class, side `implementation`, and `section`: `public`, `protected` or `private` | its declaration at the end of that section of the class's definition; its implementation before the `ENDCLASS` of the class's implementation | the definition and the implementation are in two includes (`spans_includes`, naming both); the section is missing (`section_missing`); the section's last statement or the `ENDCLASS` shares its line with another statement (§5.4) |
| method of an interface | the interface | its declaration before `ENDINTERFACE` | the `ENDINTERFACE` shares its line |

The code of an `insert` is given per place: `definition` and `implementation` for a class method,
one text otherwise. A global class's definition and implementation are both in `source/main`, so
a new method is one write. A local class whose definition and implementation sit in two includes
gets its method by two calls: a `diff` into each include, each its own write; between them the
inactive class is inconsistent, as between any two updates before an activation.


**Confinement of an element-relative diff.** It is taken only for an element that passes the
boundary check (§5.4): one whose lines hold that element alone. For an element that shares a line
or a statement (`a` of `METHODS: a, b.`) an element-relative diff is refused, `shares_lines`,
since its lines also hold another element; the change goes as a `relative_to: "include"` diff.
Its hunks are numbered from the element's first line (line 1) to its last (line n). They are
checked against the element **before** they are placed in the include:

- every context and removed line of a hunk lies within lines 1 to n, else the hunk is refused,
  naming it, even when the text there would match;
- a pure addition (`-k,0`) goes after element line k, with 1 ≤ k < n: strictly inside the
  element. Lines before the element's first line or after its last are outside it; such a change
  is a `relative_to: "include"` diff;
- hunks come in ascending order and do not overlap; two hunks touching the same line are refused,
  naming both.

A whole-include diff is never inferred from a missing element: `relative_to` is required. Lines
are compared without their line ends. The spec settles the diff grammar: the unified diff subset
accepted, and `\ No newline at end of file`.


## 8. Tools

The existing whole reads stay as they are: same tools, same default answers.

| Tool | Set | What |
|---|---|---|
| every source read (`GetClass`, `GetProgram`, `GetInclude`, …) | read-only | `part: "size"` added (below); no text |
| `GetObjectOutline` | read-only | §6 |
| `GetSourcePart` (new) | read-only | one or several element addresses (§5.0), or a line range inside one (§5.5); answers each element's lines, its absolute range, the include and its `source_hash`, and whether it shares a line |
| `UpdateSourcePart` (new) | write | §7 |

**What `part: "size"` measures.** The size of exactly the source that tool's whole read answers,
from the same one GET, with the same `version`. For `GetClass` that is the class's
`source/main`; a local include is sized by its own tool (`GetLocalTypes`, …), and a function group
by each of its includes and modules. The answer names that source (its ADT address and the
`version` read), and gives:

- `bytes`: the UTF-8 bytes of the text as received;
- `lines`: counted as the existing line ranges count them (`src/lib/handlers/sourceRange.ts`): a
  line ends at a line feed, a final line feed closes the last line and opens none, and an empty
  source has 0 lines;
- `source_hash`: §7.2.

- **Compact sets:**
 `HandlerGet` gains the parts `size` and `source_part`, and the compact update
  gains the edits. The spec names the arguments.
- **`available_in`:** as for the object kind's whole read and update today. Program and include
  writes are onprem only. Program parts are onprem only: programs on cloud have no outline.
  Function group parts work on both.
- **Batch mode:** the new tools run outside it (§4.4).
- **Legacy (SAP_BASIS 7.40):** the new tools, `part: "size"` and the outline views are not served
  on the legacy sets until 7.40 is measured (§11). The legacy sets keep their whole reads
  unchanged.

## 9. No server-chosen limits

- No answer is cut, paged or switched to another view by size.
- No navigation count is capped, and no envelope size is chosen by the server.
- What a call answers is what the model asked: a view, a filter, an element, a range.
- What SAP refuses (an envelope too large, an element not found) reaches the model as SAP
  answered it.

## 10. Release order


Every dependency is consumed from the registry, published first and in this order:

1. `@mcp-abap-adt/interfaces-adt`: the navigation and outline atoms.
2. `@mcp-abap-adt/adt-clients`: `getNavigationTarget`.
3. `@mcp-abap-adt/adt-strategies`: `readNavigationTarget`.
4. `@mcp-abap-adt/adt-code-analyzer`: first release.
5. mcp-abap-adt 24.3.0.

## 11. SAP_BASIS 7.40

Nothing of this design is measured on 7.40. What is known:

- Its discovery (the recorded fixture `tests/fixtures/adt/system-description-basis-740--03-discovery.body.xml`)
  lists `/sap/bc/adt/navigation/target` with no template link, and `/sap/bc/adt/repository/objectstructure`
  as a repository-level collection. It lists no per-object `objectstructure`.
- adt-clients-legacy states `getObjectOutline` as "not measured on 7.40 — inherited", and the
  communication batch as not served on 7.40 (`packages/adt-clients-legacy/docs/LEGACY.md`, lines
  302 and 348, in mcp-abap-adt-clients).
- The legacy system is reachable only at times.

**Decided: on 7.40 the new tools, `part: "size"` and the outline views are off** until a 7.40
measurement run. The legacy sets do not list them, and nothing is sent. Navigations would go one
by one there in any case (§4.4: the envelope only where measured). Turning them on is that run
(the outline per object, navigation and the positions on 7.40), then a change of `available_in`.

