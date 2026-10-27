# Goal: one registry of ADT object type codes

## Goal

Every ADT object type code that the stack sends, accepts, matches or offers to a model comes from one registry. No code is written outside the registry unless its type is the registry's, so the compiler checks it. The registry holds only codes that ADT is known to answer, and each code carries its evidence. A code nobody has measured is marked as such and never presented as measured.

A consumer gets the same code for the same object kind in every package. A tool never offers a model a code that its own library refuses. A code that is not in the registry does not compile, and a test proves that the code really is what ADT answers.

## Invariants

- **One source.** The registry lives in `@mcp-abap-adt/interfaces-adt`, as constants and the types derived from them. It holds no logic. adt-clients, adt-strategies, adt-clients-legacy and the mcp-abap-adt server derive their maps, unions, schemas and tool descriptions from it, and the compiler checks every map against it.
- **Evidence first.** Each code is one of three:
  - **recorded**: a recorded ADT answer, in a repository's fixture corpus, carries it;
  - **discovery**: a system's ADT discovery document advertises it;
  - **unmeasured**.
  A code is entered only with its evidence. A code that an answer shows to be wrong for its kind is not entered.
- **The library's types carry what it supports, and a tool checks them against the system.** Each API the library offers has a constant entry per variant — its kind, its ADT collection, and per code the parent, name length and operations — and the compiler holds code to it. A separate check reads what a system says (`typestructure`, `discovery`, and an object's own address through `urimapper`) and reports every conflict with the library's types where the system states the fact, and every system type the library does not cover; it runs on the recorded releases in CI and on a live system on demand. The operations themselves are proved by the library's own tests. Nothing is checked against the system at run time.
- **One meaning per code.** A code names one object kind everywhere. A code that two maps read as different kinds is resolved by the evidence, not by the map that is used more.
- **One vocabulary for kinds.** The friendly names a tool accepts (compact names, low-level names) map to one closed list of kinds, typed against the registry.
- **What reaches the model is true.** A schema enum, a parameter description and an example name only codes that the path behind them accepts.
- **Values from outside are checked once.** A code that arrives from outside the type system, in a tool argument or an ADT answer, is checked against the registry at that boundary. A typed code is not checked again.
- **Measured on real systems.** A code without recorded evidence is measured on a system of each release and the answer is added to the corpus before the code is called recorded.
- **Breaking where the types break.** Removing wrong codes from published unions and maps is a major for each package whose types change (for a 0.x package, a minor). Releases go in order: interfaces-adt, then adt-clients and adt-strategies, then mcp-abap-adt. Every dependency resolves on the npm registry.
