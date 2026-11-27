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

**To be measured onprem.** A probe handed to the owner checks three things on a program: the
local method's `definitionIdentifier`, the batch envelope, and `HEAD`. Nothing here needs the
first or the third: a local method is located by its `implementationIdentifier`, and its
declaration through its local class (§5.2). Whether navigations share an envelope onprem decides
only how they are sent (§4.4), not what they answer.

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
| Navigation atom | `@mcp-abap-adt/interfaces-adt` | the atom that declares `getNavigationTarget` (`factoryReturnsCoverClass` refuses an `AdtUtils` member that no atom declares) |
| Navigation reading | `@mcp-abap-adt/adt-strategies` | `readNavigationTarget`: the reference's include and its `start` |
| Analyzer | `@mcp-abap-adt/adt-code-analyzer` (new, `packages/adt-code-analyzer` in the mcp-abap-adt-clients repository) | `AdtCodeAnalyzer`, the lexer, the block-end scanner |
| Tools, merge, write | mcp-abap-adt `lib` | §8 |

adt-clients gets **no partial-update member** and no reading. It always takes the whole source.

## 4. `AdtCodeAnalyzer`

### 4.1 What it is

A composer above the one-endpoint members. It answers two things:

- **`outline(object)`**: the object's elements as one list. Each element carries its kind, its
  name, its parent (a method's class), the include it lives in, and its position wherever SAP
  states one. Every element also carries **its address**, the `{ type, name, parent? }` that
  `part` takes.
- **`part(object, elements)`**: each element located in its include. For each one it answers the
  include's address, the include's whole text and its `sourceHash`, the element's first and last
  line, and whether the element shares a line with another statement (§5.4). The tools cut the
  element's lines from this, and the write merges into it (§7). One read path serves both.

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

The envelope is used per declared variant where it is measured to answer (cloud today). Anywhere
else each navigation request is sent alone, on the plain connection. Both give the same starts.


A part read or a partial update cannot itself be recorded into the server's batch mode
(`HandlerBatch`). Each needs the answer of one request before it can build the next. So the new
tools are marked "Runs outside batch mode" in `tools/batch-handlers.json`.

## 5. Parts

### 5.1 A class or an interface: SAP's positions

- A part is the block the outline names:
  - a method's implementation: its `implementationBlock`;
  - a declaration: its `definitionBlock`;
  - a local class's definition or implementation;
  - the class's own definition: the attributes, signatures and types, without any method body.
- The analyzer takes the include from the link and the lines from the position. It calls no
  navigation and no scanner.
- A method has two sides. `side` is `implementation` (the default for a method) or `definition`.
  For the class itself, `definition` is the "definitions first" read.

### 5.2 A program, an include, a function group: navigation plus the scanner

1. **Find the element.** The outline names it, with its include and its name fragment. For a
   function group, the analyzer reads the group's outline for its includes, then the outline of
   one include, which answers the whole group (§2).
2. **Find the start.** Navigation on the element's link gives its start line. For a local
   method, the link is the `implementationIdentifier`, which answers on cloud. The method's
   declaration is read as part of its local class's definition.
3. **Find the end.** The block-end scanner finds it from the include's text and the start.

**The scanner** is plain string code: a character loop, with **no regular expression** (the
owner's rule).

- It reads the include from its first line, so it knows the lexical state at the start.
- It splits the text into statements. It knows:
  - full-line `*` comments and `"` comments;
  - `'…'` and `` `…` `` literals with their doubled-quote escapes;
  - `|…|` templates with their escapes and `{ … }` embedded expressions;
  - `##` pragmas;
  - chained statements (`:` and `,`);
  - the `.` that ends a statement.
- A keyword inside a literal or a comment counts for nothing. Keywords are compared
  case-insensitively.
- It locates the statement that contains the start, then the statement that ends the block:

| Element | Opens with | Ends with |
|---|---|---|
| form (`PU`) | `FORM` | `ENDFORM` |
| module (`PM`) | `MODULE` | `ENDMODULE` |
| local class definition / implementation (`PL`) | `CLASS … DEFINITION` / `CLASS … IMPLEMENTATION` | `ENDCLASS` (a `DEFINITION DEFERRED` or `LOAD` is one statement) |
| local method (`PLM`) | `METHOD` | `ENDMETHOD` |
| local interface (`PN`) | `INTERFACE` | `ENDINTERFACE` |
| macro | `DEFINE` | `END-OF-DEFINITION` |
| event (`PE`) | its event keyword | the last statement before the next event keyword or processing block (`FORM`, `MODULE`, `FUNCTION`, `CLASS … IMPLEMENTATION`), or the include's end; blank and comment lines before the next block are not part of it |
| a declaration (`PD`, `PT`, `PC`, `PS`, …) | its statement | the same statement (a chain is one statement) |

- **A kind with no rule is refused**, naming the kind. **A block with no end is refused**,
  naming the element and the include. The scanner never guesses an end.
- The spec lists every block-opening statement exactly.

### 5.3 A function module

A function module has no outline (`404`, measured 2026-11-04). It is one element, its whole
source:

- read whole, or by line range with today's `start_line` / `end_line`;
- changed by a diff against that source (§7.3).

### 5.4 Whole lines, and a part that shares a line

- **A part is whole lines**, from the block's first line to its last, exactly as SAP holds them
  (the goal's invariant). Because `end` stops before the period (§2), whole lines are what
  carries the period.
- A part **shares a line** when its first line holds a statement before the start, or its last
  line holds a statement after the end. Examples: `ENDMETHOD. METHOD b.` on one line, or one name
  of a chained declaration.
- Such a part is still read, and the answer says that it shares a line.
- Replacing such a part by element is **refused**: whole lines would carry the other statement.
  The diff path (§7.3) stays open for it.

### 5.5 A line range inside an element

`start_line` / `end_line` on a part read count from the element's first line (line 1). The
answer gives those lines, the element's line count, and the range's absolute lines in the
include. A diff relative to the element (§7.3) uses the same numbering. A model that read lines
400–460 of a 3000-line method can therefore write a hunk for them.

## 6. The outline answer

`GetObjectOutline` stays the outline tool, and the analyzer answers it.

- **Without the new arguments, its answer is unchanged.**
- It gains `PROG/I`: an include's outline, served on cloud for function group includes (§2).
- It gains a compact form:

| Argument | Answer |
|---|---|
| `view: "kinds"` | each kind present: its code, its words and its count; and each include with its element count. No names. |
| `view: "elements"` (default) | the elements, at the `detail` levels as today |
| `element_types` | only elements of these kinds |
| `element_name` | only elements of this name: exact, or a mask with `*` (plain string matching) |
| `parent` | only the children of this element (one local class's methods, say) |

Every listed element carries its address `{ type, name, parent? }`, which is exactly what
`GetSourcePart` takes (the goal's invariant: an outline names every piece the way the part read
takes it). Elements of a class or an interface also carry their lines. Program elements carry
their include but no lines: navigation is not called for an outline.

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

The sequence:

1. Lock the object: the class for any of its includes, the program or function group for its
   includes.
2. Under the lock, `part` locates every element the edits name. That read takes the outline, the
   navigation and the include's source.
3. **Drift check.** `sourceHash(include source)` must equal `source_hash`. Otherwise the call is
   refused, `source_changed`, with the current hash; the server unlocks and writes nothing.
4. Resolve the edits against that text:
   - the edits must not overlap, else a refusal naming both;
   - they are applied bottom-up, so earlier ranges stay valid.
5. Write the whole include once, through the include's CRUD (table below), then unlock.
6. **The answer** names each edit with its new line range in the include, plus the new source
   hash. It does not activate.

**`sourceHash`** is SHA-256, in hex, over the UTF-8 bytes of the source text exactly as read.
It is one function, exported by the analyzer package. The part read's answer and lib's drift
check both use it.

**Line ends.** The untouched lines keep their own line ends. New lines get the include's
(SAP sends CRLF).

| The element's include | The write |
|---|---|
| a class's `source/main` | the class's `update` |
| `includes/implementations`, `definitions`, `macros`, `testclasses` | `getLocalTypes()`, `getLocalDefinitions()`, `getLocalMacros()`, `getLocalTestClass()` and their `update` |
| an interface's source | the interface's `update` |
| a program's main source / one of its includes | the program's / the include's `update` (onprem only) |
| a function group include / a function module | the function include's / the module's `update` |

### 7.3 The edits

| Edit | What it names | Rule |
|---|---|---|
| `replace` (main path) | an element `{ type, name, parent? }`, `side` for a method, the new code | The element must exist in the outline, else a refusal naming it (never a guess). Its whole lines are replaced. A part that shares a line is refused (§5.4). |
| `insert` | a new element `{ type, name, parent? }` and its code | The element must **not** exist, else a refusal. It is placed where its kind belongs (below). |
| `diff` (fallback) | a unified diff, relative to an element (line 1 = its first line) or, without one, to the whole include | Each hunk applies only where its context and removed lines equal the source **exactly**, at the position it states. A hunk that does not match is refused, naming the hunk; nothing is applied. No fuzz, no offset search, nothing partial. |

Where `insert` places an element:

- a form, a module or an event: at the end of the include the edit names (required);
- a local class: at the end of the include the edit names;
- a method of a global or local class: its implementation before the `ENDCLASS` of the class's
  implementation, and its declaration (`definition`, required) at the end of the visibility
  section the edit names (required).

Lines are compared without their line ends. The spec settles the diff grammar: the unified diff
subset accepted, and `\ No newline at end of file`.

## 8. Tools

The existing whole reads stay as they are: same tools, same default answers.

| Tool | Set | What |
|---|---|---|
| every source read (`GetClass`, `GetProgram`, `GetInclude`, …) | read-only | `part: "size"` added: lines, bytes and `source_hash` of the source, from the same one GET; no text |
| `GetObjectOutline` | read-only | §6 |
| `GetSourcePart` (new) | read-only | one or several elements (`{ type, name, parent? }`, `side`), or a line range inside one (§5.5); answers each element's lines, its absolute range, the include and its `source_hash`, and whether it shares a line |
| `UpdateSourcePart` (new) | write | §7 |

- **Compact sets:** `HandlerGet` gains the parts `size` and `source_part`, and the compact update
  gains the edits. The spec names the arguments.
- **`available_in`:** as for the object kind's whole read and update today. Program and include
  writes are onprem only. Program parts are onprem only: programs on cloud have no outline.
  Function group parts work on both.
- **Batch mode:** the new tools run outside it (§4.4).

## 9. No server-chosen limits

- No answer is cut, paged or switched to another view by size.
- No navigation count is capped, and no envelope size is chosen by the server.
- What a call answers is what the model asked: a view, a filter, an element, a range.
- What SAP refuses (an envelope too large, an element not found) reaches the model as SAP
  answered it.

## 10. Release order

Every dependency is consumed from the registry, published first and in this order:

1. `@mcp-abap-adt/interfaces-adt`: the navigation atom.
2. `@mcp-abap-adt/adt-clients`: `getNavigationTarget`.
3. `@mcp-abap-adt/adt-strategies`: `readNavigationTarget`.
4. `@mcp-abap-adt/adt-code-analyzer`: first release.
5. mcp-abap-adt 24.3.0.
