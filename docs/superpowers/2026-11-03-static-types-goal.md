# Goal: static types in the server's production code

## Goal

The compiler checks the server's production code by its real types. A value is typed by its
contract: the interface's declared type, the handler's argument type, or `ReturnType<…>`. It is
not held as `any` and not forced into a type with `as unknown as`, so a change in a contract
fails the build instead of a tool call.

Production code is every package's `src` and `scripts`, without tests. The tests follow as a
task of their own.

## What there is today (Measured, `main` at 23.1.0, line-based grep)

- 108 `as unknown as`. The largest groups:
  - the compact route tables casting each handler to one handler type (45);
  - `IAdtResponse` values built or re-typed by hand (about 55);
  - result-set and connection seams.
- About 316 lines with `any`:
  - tool arguments (`args: any`) in the handler groups and handlers;
  - parsed XML and JSON navigated through `any`;
  - `catch (error: any)`;
  - logger signatures;
  - legacy helpers.
- About 100 other `as T`:
  - index reads under `noUncheckedIndexedAccess`;
  - `as never`;
  - hand-made `AxiosResponse` values.
- 2 `@ts-expect-error`.

## Invariants

- **Behaviour does not change.** Every tool answers what it answers today. Where a type fix
  shows a real defect, the defect gets a test and a CHANGELOG line.
- **Static first.** A runtime check stays only where the compiler cannot see the value: a
  tool's arguments from the model, SAP's answers, parsed documents, the environment. Everything
  else is typed, not checked.
- **No cast replaces a cast.** `as T`, `as never`, `any` and `unknown` narrowed by hand are not a
  fix for `as unknown as`. Where none can go, the line stays with a comment saying why, and the
  owner sees each such line.
- **Contracts are fixed where they live.** A type too narrow or too wide in a package we publish
  is fixed in that package and published first. The packages are interfaces-adt, adt-clients,
  interfaces-utils and connection. This server takes the fix from the registry. Such a fix goes
  to the owner first, as a separate release.
- **A gate keeps it so.** After the change, the lint fails on `any` and the build fails on
  `as unknown as` in production code, so new ones cannot come back.

## Open for the spec

- Which contract fixes in other packages are needed, and for each, whether it is a minor or a
  major. Candidates:
  - a typed failure variant of `IAdtResponse`;
  - the generic defaults of `IAdtVersionable`, `IAnalyse` and `CheckedDeletable`;
  - `ILogger`'s argument types.
- How a handler's arguments are typed: one type per tool, derived from its input schema or
  declared beside it, and how the registries hold handlers of different argument types without
  a cast.
- The gate itself: a Biome rule, a test over the sources, or both.
- The semver of the server's release. Exported types that change make it a major.
