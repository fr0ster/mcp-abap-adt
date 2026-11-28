# Research: ABAP parsing capabilities in ADT and the ABAP system

Input for strengthening the server's analytical capabilities, beside `AdtCodeAnalyzer`
(`docs/architecture/SOURCE_PARTS.md` §4). This is the owner's analysis, translated. Each claim
carries how it is known:
- **Discovery**: checked against the recorded discovery documents in mcp-abap-adt-clients
  (`packages/adt-clients/corpus/adt/discovery/system-description-{basis-740,s4-2025,abap-cloud}--03-discovery.body.xml`).
- **Measured**: called on the on-premise test system on 2026-11-29.
- **Claimed**: from the analysis, not yet verified here.

## Conclusion

The native SAP grammar can be read. Access to a server-side AST is not confirmed.

The first thing to research is the grammar file's format and the RND runtime. If the runtime can
be implemented in TypeScript, the server gets a local syntax analyser whose grammar matches the
ABAP version of the target system, rather than the fixed version of a third-party parser.

## 1. The ABAP RND parser

`GET /sap/bc/adt/abapsource/parsers/rnd/grammar`, registered in discovery as:

```xml
<app:collection href="/sap/bc/adt/abapsource/parsers/rnd/grammar">
  <atom:title>Parser</atom:title>
  <atom:category term="parser" scheme="http://www.sap.com/adt/categories/abapsource"/>
</app:collection>
```

- **Discovery.** It is listed on SAP_BASIS 7.40, S/4HANA 2025 and ABAP Cloud.
- **Measured.** The endpoint answers `200` with `text/plain; charset=utf-8`, 1,389,041 bytes, and
  an `ETag` of `816`. The text begins with a header: `Release 700`, `Patchlevel 19`,
  `MaxSuspiciousMachtes 3` (SAP's spelling), `Token 112 1298 2899`. A numbered token table
  follows: `0 "#ANYKW#"`, `1 "#ANYLIT#"`, `2 "#EOF#"`, `3 "#NL#"`, `4 "#COMMENT1#"`,
  `5 "#COMMENT2#"`, `6 "."`, `7 ","`, `8 ":"`, `9 "#PRAGMA#"`, then literal, string-template and
  dynamic-identifier classes.
- **Measured.** The class `CL_SEDI_ADT_RES_RND` exists on the system. That it is the handler of
  this endpoint is claimed.
- **Claimed.** RND stands for "Recursive Non-Descent". Per SAP, Eclipse ADT downloads the ABAP
  grammar from the backend for local syntax analysis, highlighting and code completion, and the
  grammar is stored as a `.pad` file.
- **Claimed.** A variant of the endpoint takes a grammar version parameter.

## 2. Related endpoints per system

All paths are relative to `/sap/bc/adt`. ✅ means the endpoint is present in the recorded
discovery document, not merely mentioned in documentation (Discovery).

| Endpoint | 7.40 | S/4 2025 | ABAP Cloud |
|---|---|---|---|
| `abapsource/parsers/rnd/grammar` | ✅ | ✅ | ✅ |
| `abapsource/syntax/configurations` | — | ✅ | — |
| `checkruns` | ✅ | ✅ | ✅ |
| `checkruns/reporters` | ✅ | ✅ | ✅ |
| `abapsource/codecompletion/proposal` | ✅ | ✅ | ✅ |
| `abapsource/codecompletion/elementinfo` | ✅ | ✅ | ✅ |
| `abapsource/occurencemarkers` | ✅ | ✅ | ✅ |
| `abapsource/typehierarchy` | ✅ | ✅ | ✅ |
| `navigation/target` | ✅ | ✅ | ✅ |
| `refactorings` | ✅ | ✅ | ✅ |
| `abapsource/prettyprinter` | ✅ | ✅ | ✅ |

## 3. What can be obtained for ABAP analysis

| Capability | ADT endpoint | Result |
|---|---|---|
| ABAP grammar | `abapsource/parsers/rnd/grammar` | The grammar definition |
| Syntax check | `checkruns` | Errors, warnings, positions in the code |
| Object structure | `objectstructure` | Methods, declarations, blocks, positions |
| Semantic information | `abapsource/codecompletion/elementinfo` | Information about an element |
| Declaration lookup | `navigation/target` | A link to the definition |
| Identifier usage | `abapsource/occurencemarkers` | Positions of occurrences |
| Type hierarchy | `abapsource/typehierarchy` | Type hierarchy information |
| A full AST | not found | Needs research |

adt-clients already implements `checkruns` and `objectstructure`. Per the analysis, `checkruns`
also checks unsaved source, and `objectstructure` answers XML with the positions of declarations
and implementations (claimed; the outline's positions for classes are measured in
`SOURCE_PARTS.md`).

## 4. Parsers for CDS, RAP and DDIC sources

Discovery also lists language-specific parser endpoints, so the mechanism is not limited to
classic ABAP:

| Endpoint | Language | 7.40 | S/4 2025 | ABAP Cloud |
|---|---|---|---|---|
| `bo/behaviordefinitions/parser/info` | RAP behavior definition | — | ✅ | ✅ |
| `ddic/ddl/parser` | CDS DDL | ✅ | ✅ | ✅ |
| `acm/dcl/parser` | CDS DCL | — | ✅ | ✅ |
| `ddic/ddla/parser/info` | CDS annotation definition | — | ✅ | ✅ |
| `ddic/ddlx/parser/info` | Metadata extension | — | ✅ | ✅ |
| `ddic/structures/parser/info` | DDIC structure | — | ✅ | ✅ |
| `ddic/tables/parser/info` | DDIC table | — | ✅ | ✅ |
| `ddic/srvd/parser/info` | Service definition | — | ✅ | ✅ |
| `ddic/dteb/parser/info` | Entity buffer | — | ✅ | ✅ |
| `ddic/drul/parser/info` | DRUL | — | ✅ | ✅ |

The per-system columns are Discovery; the analysis listed the endpoints without them.

## 5. How it could be used

The most interesting option is a local ABAP parser that uses the grammar read from the target
system itself:

```mermaid
flowchart TD
    A["SAP ADT backend"] --> B["RND grammar"]
    B --> C["Local RND parser"]
    D["ABAP source code"] --> C
    C --> E["Syntax structure"]
    D --> F["ADT semantic services"]
    E --> G["ABAP code analyzer"]
    F --> G
    G --> H["MCP server"]
```

Possible capabilities:
- splitting ABAP code into tokens and statements;
- identifying syntax blocks;
- building an AST, if the RND runtime allows it;
- structural search over code;
- semantic analysis;
- targeted modification of code that respects its structure;
- indexing ABAP code for retrieval by logical blocks.

**Claimed.** SAP's ABAP Cleaner already uses the Java classes `ABAPRndParser` and
`com.sap.rnd.rndrt`, an example of the mechanism used outside the ADT editor. Whether an
independent RND runtime exists for TypeScript, and whether it may be distributed, is an open
question.

## 6. Relation to the current design

`SOURCE_PARTS.md` decides that the pieces of a source are located by SAP's outline and
navigation, with the end of a block found by the analyzer's own scanner (plain string code, no
regular expression, no abaplint). A local RND parser would be a different means to the same end.
This research does not change that decision; it is input for deciding whether a later stage
replaces or complements the scanner.

## Open questions

1. The grammar format: its header, token table and rule encoding, read from the measured text.
2. The RND runtime: whether it is documented, and whether an implementation may be written or
   distributed with this project.
3. The version parameter: its name and the values a system accepts.
4. Whether any endpoint answers a parse tree for a given source.
5. The grammar on SAP_BASIS 7.40 and on ABAP Cloud: measured only on premise so far.
