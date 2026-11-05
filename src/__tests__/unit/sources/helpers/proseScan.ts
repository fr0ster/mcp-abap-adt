/**
 * SAP's answers are judged by key, never by words (the owner's rule): no
 * string search and no equality comparison is applied to text from an SAP
 * answer. Read on the TypeScript program with its type checker — what a
 * name resolves to, never what it is called. No allowlist: a finding is
 * fixed in the code.
 *
 * **SAP text**, recognised by type and flow:
 * - a read of a declared text field (`TEXT_DECLARATIONS`, by declaring
 *   interface or class): an error's message (`Error.message`,
 *   `IAdtError.message`, `AdtRefusal.message`), a message's text
 *   (`AdtMessage.text`);
 * - an error's body: an answer's body (`BODY_DECLARATIONS`:
 *   `IAdtWireResponse.data`, declared by `IHttpWireResponse`, and
 *   `AxiosResponse.data`) read off an error's `response` (`IAdtError`,
 *   `AxiosError`);
 * - a member of a parameter's anonymous type named as one of those fields
 *   (`error: { message?: string }`), and the same fields read by key from a
 *   value of no type (`child(error, 'message')`, `childAt(error,
 *   'response', 'data')` — a body read off a `response` is the error's);
 * - a parsed document's text: a read out of what fast-xml-parser's
 *   `XMLParser#parse` answered, or out of an answer's body, whose key is a
 *   text node (`#text`) or message text (`isDocumentTextKey`: `message`,
 *   `localizedMessage`, `text`, a name ending `Text` or `_TEXT`, the
 *   namespace prefix and the attribute marker left aside);
 * - by direct flow: a value computed from SAP text (a call or a method call
 *   on it, a template, a concatenation, a conditional), a variable or a
 *   property assigned one, a parameter of a same-file function called with
 *   one, a callback's parameter over a list of it, a `for … of` over it, and
 *   a function returning one — in any file of the program, so a reader such
 *   as `rawOf(answer)` carries its answer's text to its callers. What a
 *   function returns is read whoever calls it (its parameters untainted); a
 *   call given SAP text is SAP text by itself.
 *
 * **An answer's body is a document, not prose:** its markup is the parser's
 * to read and a source's lines the line reader's; searching it is not
 * refused here (a regular expression over input is `noRegexOverInput`'s).
 *
 * **What stays allowed.** A document's structured values — an attribute, an
 * element holding a code or a flag — are no text: comparing them is how an
 * answer is judged. A declared field that is not a text field — the message
 * type, the T100 key (`t100.id`, `t100.no`), the exception type (`adtType`),
 * a status, a code — stops the flow: it is what a reader extracted. A value
 * whose type holds a number, a boolean or an object is no text, and a
 * comparison with `undefined`, `null`, `typeof`, a number or a boolean is a
 * presence or value test. Building text of our own from SAP text is allowed;
 * matching on what was built is not.
 *
 * Refused, each reported with its form:
 * - `search`: `includes`, `indexOf`, `lastIndexOf`, `startsWith`,
 *   `endsWith`, `match`, `matchAll`, `search` or `split` called on SAP text,
 *   whatever the argument — a literal with or without spaces, a single word,
 *   a computed pattern; a regular expression's `test` or `exec` given SAP
 *   text; an array's `includes` or `indexOf` given SAP text;
 * - `equality`: `===`, `!==`, `==` or `!=` with SAP text on one side; a
 *   `switch` over SAP text.
 *
 * Its limit: a value reaching the call through another module by a path the
 * scan does not follow — a property of an object built elsewhere, a value
 * passed through an untyped boundary (a JavaScript file, an `any`) — is
 * beyond this check and left to review.
 */

import * as ts from 'typescript';
import { rel } from './failureScan';

export type ProseForm = 'search' | 'equality';

export interface ProseMatch {
  readonly form: ProseForm;
  /** `file:line`, the file relative to the repository. */
  readonly where: string;
  /** The offending expression's text, whitespace collapsed. */
  readonly text: string;
}

/**
 * The declared text fields, by declaring interface or class: what SAP said,
 * as text. Every other declared field is structured.
 */
export const TEXT_DECLARATIONS: ReadonlyMap<
  string,
  ReadonlySet<string>
> = new Map<string, ReadonlySet<string>>([
  ['Error', new Set(['message'])],
  ['IAdtError', new Set(['message'])],
  ['AdtRefusal', new Set(['message'])],
  ['AdtMessage', new Set(['text'])],
]);

/**
 * The declared bodies, by declaring interface: an answer's document. Its
 * markup is read by the parser and its source by a line reader; read from
 * an error (`IAdtError.response`, `AxiosError.response`) it is the error's
 * body, text.
 */
export const BODY_DECLARATIONS: ReadonlyMap<
  string,
  ReadonlySet<string>
> = new Map<string, ReadonlySet<string>>([
  // `IAdtWireResponse.data`, declared by the frame it extends.
  ['IHttpWireResponse', new Set(['data'])],
  ['AxiosResponse', new Set(['data'])],
]);

/** The errors whose `response` carries the error's body. */
const ERROR_DECLARATIONS: ReadonlySet<string> = new Set([
  'IAdtError',
  'AxiosError',
]);

/** The text fields' and bodies' names, read from an anonymous type or by key. */
const TEXT_KEYS: ReadonlySet<string> = new Set(
  [...TEXT_DECLARATIONS.values(), ...BODY_DECLARATIONS.values()].flatMap(
    (fields) => [...fields],
  ),
);

/** Whether a text key names a body. */
function isBodyKey(key: string): boolean {
  for (const fields of BODY_DECLARATIONS.values()) {
    if (fields.has(key)) return true;
  }
  return false;
}

/** A parsed document's key read as text: a text node or message text. */
export function isDocumentTextKey(key: string): boolean {
  if (key === '#text') return true;
  let local = key;
  if (local.startsWith('@_')) local = local.slice(2);
  else if (local.startsWith('@')) local = local.slice(1);
  const colon = local.lastIndexOf(':');
  if (colon >= 0) local = local.slice(colon + 1);
  return (
    local === 'message' ||
    local === 'localizedMessage' ||
    local === 'text' ||
    local.endsWith('Text') ||
    local.endsWith('_TEXT')
  );
}

const SEARCHES = new Set([
  'includes',
  'indexOf',
  'lastIndexOf',
  'startsWith',
  'endsWith',
  'match',
  'matchAll',
  'search',
  'split',
]);

const COMPARISONS = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

const WHITESPACE = new Set([' ', '\t', '\n', '\r']);

function collapse(text: string): string {
  let out = '';
  let gap = false;
  for (const character of text) {
    if (WHITESPACE.has(character)) {
      gap = out.length > 0;
      continue;
    }
    if (gap) out += ' ';
    gap = false;
    out += character;
  }
  return out;
}

function strip(expression: ts.Expression): ts.Expression {
  let current = expression;
  for (;;) {
    if (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isSatisfiesExpression(current)
    ) {
      current = current.expression;
      continue;
    }
    return current;
  }
}

const isStringLiteral = (node: ts.Node): node is ts.StringLiteralLike =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

/** The expressions a function returns: its `return`s (not a nested function's) or an arrow's body. */
function returnsOf(fn: ts.FunctionLikeDeclaration): ts.Expression[] {
  const body = fn.body;
  if (body === undefined) return [];
  if (!ts.isBlock(body)) return [body];
  const out: ts.Expression[] = [];
  const visit = (node: ts.Node) => {
    if (isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression !== undefined) {
      out.push(node.expression);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return out;
}

/**
 * A read of `key` out of a value of no type, the key before it `previous`:
 * a text field's name is text; a body's is the error's body, text, when it
 * is read off a `response` (`error.response.data`), else an answer's
 * document.
 */
function untypedRead(previous: string | undefined, key: string): Kind {
  if (!TEXT_KEYS.has(key)) return 'none';
  if (!isBodyKey(key)) return 'text';
  return previous === 'response' ? 'text' : 'document';
}

/** The key `node` reads last: a member's name, a literal element key, a tree read's last key. */
function lastKeyOf(node: ts.Expression): string | undefined {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (
    ts.isElementAccessExpression(node) &&
    isStringLiteral(node.argumentExpression)
  ) {
    return node.argumentExpression.text;
  }
  if (ts.isCallExpression(node)) {
    const last = node.arguments[node.arguments.length - 1];
    if (
      node.arguments.length >= 2 &&
      last !== undefined &&
      isStringLiteral(last)
    ) {
      return last.text;
    }
  }
  return undefined;
}

/** What a value is: SAP text, a parsed document (or a value read out of one), or neither. */
type Kind = 'text' | 'document' | 'none';

const RANK: Readonly<Record<Kind, number>> = { none: 0, document: 1, text: 2 };

const higher = (a: Kind, b: Kind): Kind => (RANK[b] > RANK[a] ? b : a);

/** What every file's scan shares: the functions found to return text or a document. */
interface Shared {
  readonly returns: Map<ts.Symbol, Kind>;
}

/** The scan of one file, on the program's checker. */
class FileScan {
  /**
   * `intrinsic`: what a function returns whoever calls it — a parameter is
   * not tainted by its callers, so a reader called once with text does not
   * make every call of it text (a call taking text is text by itself).
   * `full`: a parameter takes what its same-file callers pass, for the
   * searches and comparisons inside the function.
   */
  private mode: 'intrinsic' | 'full' = 'intrinsic';
  private readonly taints = {
    intrinsic: new Map<ts.Symbol, Kind>(),
    full: new Map<ts.Symbol, Kind>(),
  };
  private cache = new Map<ts.Node, Kind>();

  private get tainted(): Map<ts.Symbol, Kind> {
    return this.taints[this.mode];
  }

  constructor(
    private readonly checker: ts.TypeChecker,
    private readonly source: ts.SourceFile,
    private readonly shared: Shared,
  ) {}

  private symbolOf(node: ts.Node): ts.Symbol | undefined {
    const symbol = this.checker.getSymbolAtLocation(node);
    if (symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias) {
      return this.checker.getAliasedSymbol(symbol);
    }
    return symbol;
  }

  private ownerName(declaration: ts.Declaration): string | undefined {
    if (ts.isSourceFile(declaration)) return undefined;
    const parent = declaration.parent;
    if (
      (ts.isInterfaceDeclaration(parent) || ts.isClassDeclaration(parent)) &&
      parent.name !== undefined
    ) {
      return parent.name.text;
    }
    if (
      ts.isTypeLiteralNode(parent) &&
      ts.isTypeAliasDeclaration(parent.parent)
    ) {
      return parent.parent.name.text;
    }
    return undefined;
  }

  /**
   * How a member reads: `text` for a text field and `body` for a body
   * (declared so, or named so in a parameter's anonymous type —
   * `error: { message?: string }`), `structured` for any
   * other declared field, `method` for a method, `undeclared` when the
   * checker resolves no type member (an object literal's own property, an
   * unknown value).
   */
  private fieldKind(
    symbol: ts.Symbol | undefined,
  ): 'text' | 'body' | 'structured' | 'method' | 'undeclared' {
    if (symbol === undefined) return 'undeclared';
    let field = false;
    for (const declaration of symbol.declarations ?? []) {
      if (
        ts.isMethodSignature(declaration) ||
        ts.isMethodDeclaration(declaration)
      ) {
        return 'method';
      }
      if (
        !ts.isPropertySignature(declaration) &&
        !ts.isPropertyDeclaration(declaration) &&
        !ts.isGetAccessorDeclaration(declaration)
      ) {
        continue;
      }
      field = true;
      const owner = this.ownerName(declaration);
      if (owner !== undefined) {
        if (TEXT_DECLARATIONS.get(owner)?.has(symbol.name)) return 'text';
        if (BODY_DECLARATIONS.get(owner)?.has(symbol.name)) return 'body';
      } else if (
        ts.isTypeLiteralNode(declaration.parent) &&
        ts.isParameter(declaration.parent.parent)
      ) {
        if (TEXT_KEYS.has(symbol.name)) {
          return isBodyKey(symbol.name) ? 'body' : 'text';
        }
      }
    }
    return field ? 'structured' : 'undeclared';
  }

  /** Whether `receiver` is an error's `response` (`IAdtError`, `AxiosError`). */
  private isErrorResponse(receiver: ts.Expression): boolean {
    const bare = strip(receiver);
    if (!ts.isPropertyAccessExpression(bare)) return false;
    if (bare.name.text !== 'response') return false;
    const symbol = this.symbolOf(bare.name);
    for (const declaration of symbol?.declarations ?? []) {
      const owner = this.ownerName(declaration);
      if (owner !== undefined && ERROR_DECLARATIONS.has(owner)) return true;
    }
    return false;
  }

  /** A body read off `receiver`: an error's body is text, an answer's a document. */
  private bodyOf(receiver: ts.Expression): Kind {
    if (this.isErrorResponse(receiver)) return 'text';
    return higher('document', this.kindOf(receiver));
  }

  /** A call to fast-xml-parser's `XMLParser#parse`. */
  private isDocumentParse(node: ts.CallExpression): boolean {
    const callee = strip(node.expression);
    if (!ts.isPropertyAccessExpression(callee)) return false;
    if (callee.name.text !== 'parse') return false;
    const symbol = this.symbolOf(callee.name);
    for (const declaration of symbol?.declarations ?? []) {
      if (this.ownerName(declaration) === 'XMLParser') return true;
    }
    return false;
  }

  private isUntyped(node: ts.Expression): boolean {
    const type = this.checker.getTypeAtLocation(node);
    return (type.flags & (ts.TypeFlags.Unknown | ts.TypeFlags.Any)) !== 0;
  }

  /** What a read of `key` out of `from` is. */
  private keyedRead(from: ts.Expression, key: string): Kind {
    const base = this.kindOf(from);
    if (base === 'text') return 'text';
    if (base === 'document') {
      return isDocumentTextKey(key) ? 'text' : 'document';
    }
    if (!this.isUntyped(from)) return 'none';
    return untypedRead(lastKeyOf(strip(from)), key);
  }

  /**
   * A tree read: a call whose first argument is the value read and whose
   * later arguments are string-literal keys (`child(x, 'a')`,
   * `childAt(x, 'a', 'b')`). The kind of the read, or `undefined` when the
   * call is not one.
   */
  private treeRead(node: ts.CallExpression): Kind | undefined {
    const [from, ...keys] = node.arguments;
    if (from === undefined || keys.length === 0) return undefined;
    if (!this.isUntyped(node)) return undefined;
    let kind = this.kindOf(from);
    let previous = lastKeyOf(strip(from));
    const untyped = this.isUntyped(from);
    for (const key of keys) {
      if (!isStringLiteral(key)) return undefined;
      if (kind === 'text') break;
      if (kind === 'document') {
        kind = isDocumentTextKey(key.text) ? 'text' : 'document';
      } else if (untyped) {
        kind = untypedRead(previous, key.text);
      }
      previous = key.text;
    }
    return kind;
  }

  /** What `node` is, by direct flow. */
  kindOf(node: ts.Node): Kind {
    const known = this.cache.get(node);
    if (known !== undefined) return known;
    this.cache.set(node, 'none');
    const result = this.computeKind(node);
    this.cache.set(node, result);
    return result;
  }

  private computeKind(node: ts.Node): Kind {
    if (ts.isTypeNode(node)) return 'none';
    if (ts.isTypeOfExpression(node)) return 'none';
    if (isFunctionLike(node)) return 'none';
    if (ts.isIdentifier(node)) {
      const symbol = this.symbolOf(node);
      return symbol === undefined
        ? 'none'
        : (this.tainted.get(symbol) ?? 'none');
    }
    if (ts.isPropertyAccessExpression(node)) {
      const symbol = this.symbolOf(node.name);
      const own = symbol === undefined ? undefined : this.tainted.get(symbol);
      if (own !== undefined) return own;
      const field = this.fieldKind(symbol);
      if (field === 'text') return 'text';
      if (field === 'body') return this.bodyOf(node.expression);
      if (field === 'structured') return 'none';
      if (field === 'method') return this.kindOf(node.expression);
      // A member called, the checker resolving none (a JavaScript value):
      // a method, not a field read.
      if (ts.isCallExpression(node.parent) && node.parent.expression === node) {
        return this.kindOf(node.expression);
      }
      return this.keyedRead(node.expression, node.name.text);
    }
    if (ts.isElementAccessExpression(node)) {
      const key = node.argumentExpression;
      if (isStringLiteral(key)) {
        const symbol = this.checker
          .getTypeAtLocation(node.expression)
          .getProperty(key.text);
        const field = this.fieldKind(symbol);
        if (field === 'text') return 'text';
        if (field === 'body') return this.bodyOf(node.expression);
        if (field === 'structured') return 'none';
        return this.keyedRead(node.expression, key.text);
      }
      return this.kindOf(node.expression);
    }
    if (ts.isCallExpression(node)) {
      if (this.isDocumentParse(node)) return 'document';
      const callee = this.symbolOf(strip(node.expression));
      const returned =
        callee === undefined ? undefined : this.shared.returns.get(callee);
      const read = this.treeRead(node);
      if (read !== undefined) return higher(read, returned ?? 'none');
      if (returned !== undefined) return returned;
    }
    if (ts.isPropertyAssignment(node)) return this.kindOf(node.initializer);
    if (ts.isShorthandPropertyAssignment(node)) {
      const symbol = this.checker.getShorthandAssignmentValueSymbol(node);
      return symbol === undefined
        ? 'none'
        : (this.tainted.get(symbol) ?? 'none');
    }
    let kind: Kind = 'none';
    ts.forEachChild(node, (child) => {
      if (kind !== 'text') kind = higher(kind, this.kindOf(child));
    });
    return kind;
  }

  private taint(symbol: ts.Symbol | undefined, kind: Kind): boolean {
    if (symbol === undefined || kind === 'none') return false;
    const had = this.tainted.get(symbol) ?? 'none';
    if (RANK[kind] <= RANK[had]) return false;
    this.tainted.set(symbol, kind);
    return true;
  }

  private taintNames(name: ts.BindingName, kind: Kind): boolean {
    if (ts.isIdentifier(name)) return this.taint(this.symbolOf(name), kind);
    let changed = false;
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) {
        changed = this.taintNames(element.name, kind) || changed;
      }
    }
    return changed;
  }

  /** Destructured text fields and bodies: `const { message } = error`. */
  private taintDestructured(name: ts.BindingName, source: ts.Type): boolean {
    if (!ts.isObjectBindingPattern(name)) return false;
    let changed = false;
    for (const element of name.elements) {
      const property = element.propertyName ?? element.name;
      if (!ts.isIdentifier(property)) continue;
      const symbol = source.getProperty(property.text);
      const field = this.fieldKind(symbol);
      if (field === 'text' || field === 'body') {
        changed =
          this.taintNames(
            element.name,
            field === 'text' ? 'text' : 'document',
          ) || changed;
      }
    }
    return changed;
  }

  /** The same-file function a call reaches, when it is one. */
  private calleeOf(
    call: ts.CallExpression,
  ): ts.FunctionLikeDeclaration | undefined {
    const symbol = this.symbolOf(strip(call.expression));
    const declaration = symbol?.valueDeclaration;
    if (declaration === undefined) return undefined;
    if (declaration.getSourceFile() !== this.source) return undefined;
    if (isFunctionLike(declaration)) return declaration;
    if (
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer !== undefined
    ) {
      const initializer = strip(declaration.initializer);
      if (isFunctionLike(initializer)) return initializer;
    }
    return undefined;
  }

  /** The symbol naming a function-like node, when one does. */
  private functionSymbol(node: ts.Node): ts.Symbol | undefined {
    if (
      (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
      node.name !== undefined
    ) {
      return this.symbolOf(node.name);
    }
    if (
      (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
      ts.isVariableDeclaration(node.parent) &&
      ts.isIdentifier(node.parent.name)
    ) {
      return this.symbolOf(node.parent.name);
    }
    return undefined;
  }

  /** What a function returns: the highest kind of its returned values. */
  private returnKind(fn: ts.FunctionLikeDeclaration): Kind {
    let kind: Kind = 'none';
    for (const expression of returnsOf(fn)) {
      const returned = this.kindOf(expression);
      if (returned === 'text' && !this.isText(expression)) continue;
      kind = higher(kind, returned);
    }
    return kind;
  }

  /** One pass of taint over the file in `mode`; whether anything new was tainted. */
  spread(mode: 'intrinsic' | 'full'): boolean {
    this.mode = mode;
    this.cache = new Map();
    let changed = false;
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
        if (node.initializer !== undefined) {
          changed =
            this.taintNames(node.name, this.kindOf(node.initializer)) ||
            changed;
          changed =
            this.taintDestructured(
              node.name,
              this.checker.getTypeAtLocation(node.initializer),
            ) || changed;
        }
      } else if (
        ts.isBinaryExpression(node) &&
        (node.operatorToken.kind === ts.SyntaxKind.EqualsToken ||
          node.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken ||
          node.operatorToken.kind === ts.SyntaxKind.BarBarEqualsToken ||
          node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionEqualsToken)
      ) {
        const left = strip(node.left);
        const target = ts.isPropertyAccessExpression(left) ? left.name : left;
        changed =
          this.taint(this.symbolOf(target), this.kindOf(node.right)) || changed;
      } else if (ts.isCallExpression(node)) {
        const callee = mode === 'full' ? this.calleeOf(node) : undefined;
        if (callee !== undefined) {
          node.arguments.forEach((argument, index) => {
            const parameter = callee.parameters[index];
            if (parameter !== undefined) {
              changed =
                this.taintNames(parameter.name, this.kindOf(argument)) ||
                changed;
            }
          });
        }
        // A callback over a list of it: `texts.forEach((t) => …)`, `.map`, …
        const receiver = ts.isPropertyAccessExpression(node.expression)
          ? node.expression.expression
          : undefined;
        const over = receiver === undefined ? 'none' : this.kindOf(receiver);
        if (over !== 'none') {
          for (const argument of node.arguments) {
            const fn = strip(argument);
            if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) {
              const first = fn.parameters[0];
              if (first !== undefined) {
                changed = this.taintNames(first.name, over) || changed;
              }
            }
          }
        }
      } else if (
        ts.isForOfStatement(node) &&
        ts.isVariableDeclarationList(node.initializer)
      ) {
        const over = this.kindOf(node.expression);
        for (const declaration of node.initializer.declarations) {
          changed = this.taintNames(declaration.name, over) || changed;
        }
      }
      if (mode === 'intrinsic' && isFunctionLike(node)) {
        const symbol = this.functionSymbol(node);
        if (symbol !== undefined) {
          const kind = this.returnKind(node);
          const had = this.shared.returns.get(symbol) ?? 'none';
          if (RANK[kind] > RANK[had]) {
            this.shared.returns.set(symbol, kind);
            changed = true;
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(this.source);
    return changed;
  }

  /** The type's members, `undefined` and `null` aside. */
  private members(expression: ts.Expression): ts.Type[] {
    const type = this.checker.getTypeAtLocation(expression);
    return (type.isUnion() ? type.types : [type]).filter(
      (member) =>
        (member.flags &
          (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void)) ===
        0,
    );
  }

  /** SAP text whose type is a string, or of no known type. */
  private isText(expression: ts.Expression): boolean {
    if (this.kindOf(expression) !== 'text') return false;
    const members = this.members(expression);
    return (
      members.length > 0 &&
      members.every(
        (member) =>
          (member.flags &
            (ts.TypeFlags.StringLike |
              ts.TypeFlags.Unknown |
              ts.TypeFlags.Any)) !==
          0,
      )
    );
  }

  /** `undefined`, `null`, `''`, `typeof`, a number or a boolean: a presence or value test, not text. */
  private isNonText(expression: ts.Expression): boolean {
    const bare = strip(expression);
    if (bare.kind === ts.SyntaxKind.NullKeyword) return true;
    if (ts.isIdentifier(bare) && bare.text === 'undefined') return true;
    if (ts.isTypeOfExpression(bare)) return true;
    // Empty or not: a presence test, no words compared.
    if (isStringLiteral(bare) && bare.text === '') return true;
    const type = this.checker.getTypeAtLocation(bare);
    const members = type.isUnion() ? type.types : [type];
    return members.every(
      (member) =>
        (member.flags &
          (ts.TypeFlags.NumberLike |
            ts.TypeFlags.BooleanLike |
            ts.TypeFlags.Undefined |
            ts.TypeFlags.Null |
            ts.TypeFlags.Void)) !==
        0,
    );
  }

  sinks(): ProseMatch[] {
    const found: ProseMatch[] = [];
    const report = (form: ProseForm, node: ts.Node) => {
      const line =
        this.source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      found.push({
        form,
        where: `${rel(this.source.fileName)}:${line}`,
        text: collapse(node.getText()),
      });
    };
    this.mode = 'full';
    this.cache = new Map();
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression)
      ) {
        const method = node.expression.name.text;
        const receiver = node.expression.expression;
        if (SEARCHES.has(method) && this.isText(receiver)) {
          report('search', node);
        } else if (
          (method === 'test' || method === 'exec') &&
          node.arguments.some((argument) => this.isText(argument))
        ) {
          report('search', node);
        } else if (
          (method === 'includes' || method === 'indexOf') &&
          this.checker.isArrayLikeType(
            this.checker.getTypeAtLocation(receiver),
          ) &&
          node.arguments.some((argument) => this.isText(argument))
        ) {
          report('search', node);
        }
      }
      if (
        ts.isBinaryExpression(node) &&
        COMPARISONS.has(node.operatorToken.kind)
      ) {
        const { left, right } = node;
        if (
          (this.isText(left) && !this.isNonText(right)) ||
          (this.isText(right) && !this.isNonText(left))
        ) {
          report('equality', node);
        }
      }
      if (ts.isSwitchStatement(node) && this.isText(node.expression)) {
        report('equality', node.expression);
      }
      ts.forEachChild(node, visit);
    };
    visit(this.source);
    return found;
  }
}

/**
 * Every prose match in `files` (each read on `program`). The flow is spread
 * over every file until nothing new is found, the functions returning text
 * or a document shared between files.
 */
export function scanProse(
  program: ts.Program,
  files: readonly string[],
): ProseMatch[] {
  const checker = program.getTypeChecker();
  const shared: Shared = { returns: new Map() };
  const scans = files.map((file) => {
    const source = program.getSourceFile(file);
    if (source === undefined) {
      throw new Error(`the program holds no ${rel(file)}`);
    }
    return new FileScan(checker, source, shared);
  });
  for (;;) {
    let changed = false;
    for (const scan of scans) {
      while (scan.spread('intrinsic')) changed = true;
    }
    if (!changed) break;
  }
  for (const scan of scans) {
    while (scan.spread('full')) {
      // until nothing new is tainted
    }
  }
  return scans.flatMap((scan) => scan.sinks());
}
