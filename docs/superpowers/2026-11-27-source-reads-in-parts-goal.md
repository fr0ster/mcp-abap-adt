# Goal: read source code whole or in parts

## Goal

A model can read an ABAP object's source either whole or in the parts it needs. The parts are
the object's structure first, then any one piece of it on request. A class or a report too large
for the model's context can still be analysed: the model reads its outline, then the methods,
events or routines it needs, and keeps them in context together with the other entities it works
with. It can also change one part without holding the whole object: it sends the new code of an
element, or a diff relative to the element it read, and the server writes the whole source.

## What MCP reads, in three groups

1. **Information about a set of objects**: search results, dumps, package contents, transport
   tasks and the like. These already answer at `detail` levels (`terse`, `medium`, `full`, `raw`),
   and they stay as they are.
2. **Metadata as an XML document**: domains, data elements, and other objects whose
   characteristics are XML. These can hardly be made smaller, and they stay as they are.
3. **Source code**: classes, interfaces, programs, includes, function modules and the like. These
   are answered whole, as today, **or in parts**:
   - **A class**: its definitions first, meaning attributes, methods with their signatures, and
     types, without the method bodies. Then one method on request.
   - **A report or program**: its global objects by scope first (variables, type definitions,
     local class definitions), plus the list of its events and subroutines. Then one event, local
     class or subroutine on request.
   - **The pieces** are located by SAP where it states them: a class's and an interface's
     outline gives each block's position. A program's, an include's and a function group's
     outline names each element, SAP's navigation gives its start, and our own scanner, plain
     string code with no regular expression, finds its end. No abaplint, and no method include
     (`CMxxx`).

## Invariants

- The whole read stays, unchanged. Reads in parts are added beside it and do not replace it.
- A part is exactly the source SAP holds for it, character for character; nothing is rewritten.
- An outline names every piece it lists in the way the part read takes it, so the model can ask
  for any of them.
- The model can tell an object's size before reading it whole, so it can decide between the whole
  read and the outline: the existing source reads answer it as a part of their own, from the same
  one read.
- A part read can take the outline's own link for an element, so the outline need not be read
  again.
- A part of a declaration leaves out the documentation comment lines above it, as SAP's own
  blocks do.
- A partial update is resolved at the MCP level only: the server merges it into the whole
  source, and adt-clients' CRUD writes that whole source (lock, update, unlock). adt-clients gets
  no partial-update member.
- Replacing an element by its name and kind is the main path; a diff relative to the element is
  the fallback. A diff applies only where its context matches the current source exactly,
  otherwise it is refused, naming the hunk; nothing fuzzy and nothing partial. An element name
  that is not found is refused, never guessed.
- The source the model edited must be the source now in SAP: the hash of the source it read is
  checked under the lock, before the write. SAP's own entity tag is checked beside it where SAP
  serves one; the hash is the primary check.
- One write per call. Activation stays a separate call.
- No limit of the server's own: what a read answers is what the model asked for (the owner's rule
  on limits).
- The architecture document describes this before any code is written.

## Why

Measured on the on-premise test system (2026-11-27), whole reads are fast. The largest class there
answers 2.3 million characters in 1.4 s, and the largest program 5.4 million in 0.7 s. At roughly
3 to 4 characters a token (an estimate), that is 0.6 to 1.8 million tokens, which is beyond a
model's context. A consumer timed out on one whole-class read. The bound is the model's context,
not the server's time.

## Out of scope

- Groups 1 and 2: their answers stay as they are.
- A partial update inside adt-clients: it always takes the whole source.
- SAP_BASIS 7.40: the reads in parts, the size and the partial update stay off there until they
  are measured on 7.40.
