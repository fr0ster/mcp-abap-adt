/**
 * The literal scan behind `typeCodeLiterals.test.ts` (#329, spec 6): an ADT
 * type code in the server's production source is typed by the tables of
 * `@mcp-abap-adt/interfaces-adt`, and a code named in a comment or inside a
 * string — a tool description above all — is one of the tables' codes. The
 * same scan as adt-clients' `typeCodeScan.ts`, with the same rules; the root
 * of the scan and the tsconfig its program is built with are the caller's.
 *
 * Everything is read with the TypeScript compiler, never by a regular
 * expression over source:
 *
 * - **The codes.** "The codes of the tables" are every code the ADT type
 *   tables and utility tables list, and every `osl:object type` of the ABAP
 *   Unit run registry (`ABAP_UNIT_RUN_TYPES`'s keys: `CLAS/OCL`, `FUNC`,
 *   `DDLS`, … — the values a run names, some of which no type table lists).
 *   Everything below that says "codes of the tables" means this one set.
 * - **Main types.** Beside the codes, a literal may be typed by a main type
 *   of the tables' codes (spec 2.4): the part of a code before its slash
 *   (`ENHO`, `FUGR`, `CLAS`). interfaces-adt 23 has no `main` field, so the
 *   set is derived from the codes here, as the server's `AdtMainTypeOf`
 *   derives the type (`adtProjections.ts`); `MainTypeOfOne<P>` is a union of
 *   them. A main-type literal is held as a code literal is: the compiler
 *   cannot tell a hand-written `'ENHO'` from the table's value, so it passes
 *   only where its type says it is one. interfaces-adt 23 has no search type
 *   tables, so no search name is in the set.
 * - **The debugger's labels.** The server's own union of breakpoint labels
 *   (`BreakpointLabel`, the keys of `BREAKPOINT_OBJECT_CODES`: `CLAS`,
 *   `PROG`, `INCL`, `FUNC`), each mapped to its code by a table-typed map, is
 *   the one more vocabulary a literal may be typed by (spec 6).
 * - **Code literals.** A string literal, or a template without
 *   substitutions, whose whole text has the shape of a code — four upper-case
 *   letters or digits, `/`, one to three more — or is a bare code the tables
 *   list (`AUTH`, `FUNC`, or the object type of a listed code: `CLAS`,
 *   `PROG`, `DEVC`, …), a main type or a debugger label, passes only where
 *   the checker's contextual type is made of codes, main types and debugger
 *   labels alone: `AdtTypeCode`, a union of some of its members (a
 *   projection: `AcceptedCode<V, Op>`, `WhereUsedCode<V>`, the element type
 *   a `projected` list or a `satisfies` gives), `AbapUnitRunObjectType`,
 *   `MainTypeOfOne<P>`, `BreakpointLabel`. A literal used as a property name
 *   passes where the object literal's contextual type names codes only as
 *   its keys and has no index signature (`Partial<Record<AdtTypeCode, …>>`,
 *   through `satisfies`). Where the compiler types a literal by something
 *   other than a contextual type, that type is read instead: the other
 *   operand of `===` / `!==` (a comparison the compiler refuses when the
 *   literal is outside it), the expression of the `switch` a `case` is in,
 *   and, for a literal type, the constraint of the type parameter it is the
 *   type argument of — alone or in a union. Anything else is a finding.
 * - **Prose.** Every comment — the trivia of every token, as the compiler
 *   reads it — is searched with plain code; a word of the code shape in it
 *   must be a code of the tables, of any variant. A bare code in prose is not
 *   checked: only a listed one is recognised as a code.
 * - **Inside a longer string.** A word of the code shape inside a string
 *   literal, a template without substitutions or a template's text span (a
 *   tool description naming `CLAS/OC`, an error message, an XML template's
 *   `adtcore:type="FUGR/I"`) is read like prose: it must be a code of the
 *   tables. A generated description interpolates typed values, so only its
 *   own text is read.
 *
 * What is not a code but looks like one goes into the caller's allow-list,
 * with its reason; an entry that matches no finding fails too.
 */

import { readdirSync, statSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import {
  ABAP_UNIT_RUN_TYPES,
  ADT_TYPES_BASIS_740,
  ADT_TYPES_CLOUD,
  ADT_TYPES_ONPREM,
  ADT_UTILITY_CODES_BASIS_740,
  ADT_UTILITY_CODES_CLOUD,
  ADT_UTILITY_CODES_ONPREM,
} from '@mcp-abap-adt/interfaces-adt';
import * as ts from 'typescript';
import { BREAKPOINT_OBJECT_CODES } from '../../../../lib/debugger/objectUri';

/**
 * Every code any table of interfaces-adt lists: API tables, utility tables,
 * and the ABAP Unit run registry's `osl:object` types.
 */
export const TABLE_CODES: ReadonlySet<string> = new Set([
  ...[ADT_TYPES_ONPREM, ADT_TYPES_CLOUD, ADT_TYPES_BASIS_740].flatMap((table) =>
    Object.values(table).flatMap((entry) =>
      'codes' in entry ? Object.keys(entry.codes) : [],
    ),
  ),
  ...[
    ADT_UTILITY_CODES_ONPREM,
    ADT_UTILITY_CODES_CLOUD,
    ADT_UTILITY_CODES_BASIS_740,
  ].flatMap((table) => Object.keys(table)),
  ...Object.keys(ABAP_UNIT_RUN_TYPES),
]);

/** The main type of a code: the text before its slash, else the code. */
function mainTypeOf(code: string): string {
  const slash = code.indexOf('/');
  return slash < 0 ? code : code.slice(0, slash);
}

/** Every main type of the tables' codes (spec 2.4), derived from the codes. */
export const MAIN_TYPES: ReadonlySet<string> = new Set(
  [...TABLE_CODES].map(mainTypeOf),
);

/** The server's debugger labels: `BreakpointLabel`. */
export const DEBUGGER_LABELS: ReadonlySet<string> = new Set(
  Object.keys(BREAKPOINT_OBJECT_CODES),
);

/** What a literal's type may be made of: codes, main types, debugger labels. */
const TABLE_VALUES: ReadonlySet<string> = new Set([
  ...TABLE_CODES,
  ...MAIN_TYPES,
  ...DEBUGGER_LABELS,
]);

/** The bare codes: a code without `/`, and the object type of every code. */
export const BARE_CODES: ReadonlySet<string> = MAIN_TYPES;

function isCodeCharacter(character: string | undefined): boolean {
  return (
    character !== undefined &&
    ((character >= 'A' && character <= 'Z') ||
      (character >= '0' && character <= '9'))
  );
}

function isWordCharacter(character: string | undefined): boolean {
  return (
    character !== undefined &&
    (isCodeCharacter(character) ||
      (character >= 'a' && character <= 'z') ||
      character === '_')
  );
}

/** Whether `text` as a whole has the shape `XXXX/Y`, `XXXX/YY` or `XXXX/YYY`. */
export function hasCodeShape(text: string): boolean {
  if (text.length < 6 || text.length > 8 || text[4] !== '/') return false;
  for (let index = 0; index < text.length; index += 1)
    if (index !== 4 && !isCodeCharacter(text[index])) return false;
  return true;
}

/**
 * Whether a literal's whole text is a code: the shape, a bare code, a main
 * type or a debugger label.
 */
export function looksLikeCode(text: string): boolean {
  return (
    hasCodeShape(text) ||
    BARE_CODES.has(text) ||
    MAIN_TYPES.has(text) ||
    DEBUGGER_LABELS.has(text)
  );
}

/** The words of the code shape in a piece of prose, each with its offset. */
export function codeShapedWords(
  text: string,
): { word: string; offset: number }[] {
  const words: { word: string; offset: number }[] = [];
  for (let slash = 4; slash < text.length; slash += 1) {
    if (text[slash] !== '/') continue;
    const start = slash - 4;
    if (isWordCharacter(text[start - 1])) continue;
    let end = slash + 1;
    while (end < text.length && isWordCharacter(text[end])) end += 1;
    const word = text.slice(start, end);
    if (hasCodeShape(word)) words.push({ word, offset: start });
  }
  return words;
}

/** Whether a type is made of codes, main types and debugger labels alone. */
function codesOnly(type: ts.Type, checker: ts.TypeChecker): boolean {
  const base =
    type.flags & ts.TypeFlags.TypeParameter
      ? checker.getBaseConstraintOfType(type)
      : type;
  if (!base) return false;
  const members = checker.getNonNullableType(base);
  const parts = members.isUnion() ? members.types : [members];
  return (
    parts.length > 0 &&
    parts.every(
      (part) => part.isStringLiteral() && TABLE_VALUES.has(part.value),
    )
  );
}

/** Whether an object type names codes only as its keys. */
function keyedByCodes(type: ts.Type, checker: ts.TypeChecker): boolean {
  const members = checker.getNonNullableType(type);
  const parts = members.isUnion() ? members.types : [members];
  return parts.every(
    (part) =>
      checker.getIndexInfosOfType(part).length === 0 &&
      checker.getPropertiesOfType(part).length > 0 &&
      checker
        .getPropertiesOfType(part)
        .every((property) => TABLE_VALUES.has(property.getName())),
  );
}

/** The operators that compare: their other operand types the literal. */
const EQUALITY: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

/**
 * A literal type passes as a type argument — alone or in a union — whose
 * type parameter is constrained to codes of the tables
 * (`IObjectReference<'FUGR/FF'>`, `CodesOfMainType<P, 'FUGR'>`).
 */
function literalTypeVerdict(
  literalType: ts.LiteralTypeNode,
  checker: ts.TypeChecker,
): string | undefined {
  let node: ts.TypeNode = literalType;
  for (;;) {
    const enclosing = node.parent;
    if (
      !enclosing ||
      !(ts.isUnionTypeNode(enclosing) || ts.isParenthesizedTypeNode(enclosing))
    )
      break;
    node = enclosing;
  }
  const reference = node.parent;
  if (
    reference &&
    ts.isTypeReferenceNode(reference) &&
    reference.typeArguments
  ) {
    const index = reference.typeArguments.indexOf(node);
    const named = checker.getSymbolAtLocation(reference.typeName);
    const symbol =
      named && named.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(named)
        : named;
    const declaration = symbol?.declarations?.find(
      (
        candidate,
      ): candidate is
        | ts.TypeAliasDeclaration
        | ts.InterfaceDeclaration
        | ts.ClassDeclaration =>
        ts.isTypeAliasDeclaration(candidate) ||
        ts.isInterfaceDeclaration(candidate) ||
        ts.isClassDeclaration(candidate),
    );
    const parameter = declaration?.typeParameters?.[index];
    const constraint = parameter?.constraint
      ? checker.getTypeFromTypeNode(parameter.constraint)
      : undefined;
    if (constraint && codesOnly(constraint, checker)) return undefined;
  }
  return 'a literal type outside a type argument constrained to the code types';
}

/** Why a code literal does not pass, or `undefined` when it does. */
function literalVerdict(
  literal: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral,
  checker: ts.TypeChecker,
): string | undefined {
  const parent = literal.parent;
  if (
    parent &&
    (ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent)) &&
    parent.name === literal
  ) {
    const owner = parent.parent;
    const contextual =
      owner && ts.isObjectLiteralExpression(owner)
        ? checker.getContextualType(owner)
        : undefined;
    if (contextual && keyedByCodes(contextual, checker)) return undefined;
    return 'a property name whose object is not keyed by the code types';
  }
  if (parent && ts.isLiteralTypeNode(parent))
    return literalTypeVerdict(parent, checker);
  if (
    parent &&
    ts.isBinaryExpression(parent) &&
    EQUALITY.has(parent.operatorToken.kind)
  ) {
    const other = parent.left === literal ? parent.right : parent.left;
    const compared = checker.getTypeAtLocation(other);
    if (codesOnly(compared, checker)) return undefined;
    return `compared with ${checker.typeToString(compared)}, which is not made of codes, main types or debugger labels`;
  }
  if (parent && ts.isCaseClause(parent) && parent.expression === literal) {
    const switched = checker.getTypeAtLocation(parent.parent.parent.expression);
    if (codesOnly(switched, checker)) return undefined;
    return `a case of a switch over ${checker.typeToString(switched)}, which is not made of codes, main types or debugger labels`;
  }
  const contextual = checker.getContextualType(literal);
  if (!contextual) return 'no contextual type';
  if (codesOnly(contextual, checker)) return undefined;
  return `contextual type ${checker.typeToString(contextual)} is not made of codes, main types or debugger labels`;
}

export interface ITypeCodeFinding {
  /** `<file relative to the root>:<literal or word>` — the allow-list key. */
  readonly key: string;
  /** The finding as listed: file, line, text and why. */
  readonly line: string;
}

function finding(
  root: string,
  source: ts.SourceFile,
  position: number,
  text: string,
  why: string,
  linesInto = 0,
): ITypeCodeFinding {
  const file = relative(root, source.fileName);
  const { line } = source.getLineAndCharacterOfPosition(position);
  return {
    key: `${file}:${text}`,
    line: `${file}:${line + 1 + linesInto} '${text}' — ${why}`,
  };
}

/** The line breaks in `text` before `offset`: the line of a word inside a literal. */
function newlinesBefore(text: string, offset: number): number {
  let count = 0;
  for (let index = 0; index < offset; index += 1)
    if (text[index] === '\n') count += 1;
  return count;
}

/** The findings of one source file: its code literals, strings and comments. */
function findingsOf(
  root: string,
  source: ts.SourceFile,
  checker: ts.TypeChecker,
): ITypeCodeFinding[] {
  const findings: ITypeCodeFinding[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      looksLikeCode(node.text) &&
      !ts.isImportDeclaration(node.parent) &&
      !ts.isExportDeclaration(node.parent)
    ) {
      const why = literalVerdict(node, checker);
      if (why !== undefined)
        findings.push(
          finding(root, source, node.getStart(source), node.text, why),
        );
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      // A code inside a longer text — a tool description, a message, an XML
      // template's span — is read like prose: it must be a code of the tables.
      const start = node.getStart(source);
      for (const { word, offset } of codeShapedWords(node.text))
        if (!TABLE_CODES.has(word))
          findings.push(
            finding(
              root,
              source,
              start,
              word,
              'inside a string, not a code of the tables',
              newlinesBefore(node.text, offset),
            ),
          );
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  for (const comment of commentRangesOf(source)) {
    const text = source.text.slice(comment.pos, comment.end);
    for (const { word, offset } of codeShapedWords(text))
      if (!TABLE_CODES.has(word))
        findings.push(
          finding(
            root,
            source,
            comment.pos + offset,
            word,
            'named in a comment, not a code of the tables',
          ),
        );
  }
  return findings;
}

/**
 * The comments of a source file: the leading and trailing trivia of every
 * token, read through the compiler, each comment once.
 */
function commentRangesOf(source: ts.SourceFile): ts.CommentRange[] {
  const comments: ts.CommentRange[] = [];
  const seen = new Set<number>();
  const collect = (ranges: ts.CommentRange[] | undefined): void => {
    for (const range of ranges ?? []) {
      if (seen.has(range.pos)) continue;
      seen.add(range.pos);
      comments.push(range);
    }
  };
  const visit = (node: ts.Node): void => {
    collect(ts.getLeadingCommentRanges(source.text, node.getFullStart()));
    collect(ts.getTrailingCommentRanges(source.text, node.getEnd()));
    for (const child of node.getChildren(source)) visit(child);
  };
  visit(source);
  return comments;
}

/** Production source under a directory: `.ts`, outside tests and fixtures. */
export function productionFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = `${dir}/${name}`;
    if (statSync(full).isDirectory())
      return name.startsWith('__') || name.includes('fixture')
        ? []
        : productionFiles(full);
    return name.endsWith('.ts') && !name.endsWith('.d.ts') ? [full] : [];
  });
}

/**
 * Every finding of the scan over `files`, typed through `tsconfig`.
 * `virtual` adds in-memory files (path → text), for the scan's own tests.
 */
export function typeCodeFindings(
  root: string,
  tsconfig: string,
  files: readonly string[],
  virtual: ReadonlyMap<string, string> = new Map(),
): ITypeCodeFinding[] {
  const config = ts.readConfigFile(tsconfig, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    dirname(tsconfig),
  );
  const options = { ...parsed.options, noEmit: true };
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  host.readFile = (name) => virtual.get(name) ?? readFile(name);
  host.fileExists = (name) => virtual.has(name) || fileExists(name);
  host.getSourceFile = (name, language, ...rest) => {
    const text = virtual.get(name);
    return text !== undefined
      ? ts.createSourceFile(name, text, language, true)
      : getSourceFile(name, language, ...rest);
  };
  const roots = [...files, ...virtual.keys()];
  const program = ts.createProgram(roots, options, host);
  const checker = program.getTypeChecker();
  return roots.flatMap((file) => {
    const source = program.getSourceFile(file);
    return source ? findingsOf(root, source, checker) : [];
  });
}
