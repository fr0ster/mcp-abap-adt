/**
 * Nothing is derived from the authorization (the owner's rule): no system
 * kind is produced from a credential read, and no production code decodes a
 * token. Read on the TypeScript program with its type checker — what a name
 * resolves to, never what it is called.
 *
 * **A credential read** is a read whose symbol the checker resolves to one of
 * the declared authorization properties (`CREDENTIAL_DECLARATIONS`: every
 * member of each declaring interface but its connection settings), or to a value declared with a union
 * drawn only from the auth-type literals (`'basic' | 'jwt'`, `SapAuthType`,
 * the stdio vocabulary's `AuthType`); and the environment key `SAP_JWT_TOKEN`
 * and the header key `x-sap-jwt-token`, read by key. A plain `string` is a
 * credential only by flowing from such a read.
 *
 * **Credential-derived, by direct flow only:** within a file, a value is
 * derived when it is a credential read or is computed directly from one (a
 * comparison, a conditional, a call taking it); a variable, a property
 * assigned, or a function returning such a value is derived, and so is a
 * parameter of a same-file function called with one. Nothing is followed
 * across modules.
 *
 * **A kind value** is an expression whose type is drawn from
 * `'cloud' | 'onprem' | 'legacy'` (`SapEnvironment`, `SystemKind`), a
 * conditional whose branches are kind values, or a value placed where the
 * declared type is a kind or a kind flag (a `boolean` alias whose declared
 * name says cloud, onprem, legacy or kind — `type CloudFlag = boolean` —,
 * read through the alias symbol on the declaration).
 *
 * Refused, each reported with its place (`assignment`, `property`,
 * `argument`, `return`, `comparison`, `decode`) and its rule:
 * - `kind`: a kind value at an assignment, a property, an argument or a
 *   return that is derived — by data, or by control: chosen in a branch of
 *   an `if`, a conditional or a `switch` whose condition or discriminant is
 *   derived —, or a derived value compared with a kind value;
 * - `credential-boolean`: a boolean bound — variable, property, parameter
 *   default, a function's return — to a comparison of a derived value with a
 *   literal or `undefined`, to a presence test of a credential read (`!x`,
 *   `!!x`, `Boolean(x)`), or to a membership test of one (`[…].includes(x)`,
 *   `x in table`): a boolean of the credential has no use but as a disguised
 *   kind; a credential choice is a `switch` or a condition on the field
 *   itself, used where it stands, which stays allowed;
 * - `decode` (production only): `split('.')`, `atob`, `Buffer.from(…,
 *   'base64…')` or `JSON.parse` applied to a derived value.
 *
 * Its limit: a credential read reaching a kind through another module, or
 * through an untyped value, is beyond this check and left to review.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { REPO, rel, sourcePaths } from './failureScan';
import { productionDirectories, productionFiles } from './typeEscapeScan';

/** Where the value stands. */
export type DerivationForm =
  | 'assignment'
  | 'property'
  | 'argument'
  | 'return'
  | 'comparison'
  | 'decode';

/** What it is: a kind value, a credential boolean, a token decode. */
export type DerivationRule = 'kind' | 'credential-boolean' | 'decode';

export interface Derivation {
  readonly form: DerivationForm;
  readonly rule: DerivationRule;
  /** `file:line`, the file relative to the repository. */
  readonly where: string;
  /** The offending expression's text, whitespace collapsed. */
  readonly text: string;
}

/**
 * The declarations of the authorization, by declaring interface: every
 * member of each is a credential read, read from the declaration itself,
 * except the connection settings named beside it — where the system is and
 * who the user is (`username`, `sysid` are the owner's exception: the
 * responsible user and the system id come from the settings). Every auth
 * field the types declare counts, secret or not (`uaaUrl`, `cert*`,
 * `kerberos*`, `snc*`, `oidc*`, `saml*`, the grant).
 */
export const CREDENTIAL_DECLARATIONS: ReadonlyMap<
  string,
  ReadonlySet<string>
> = new Map<string, ReadonlySet<string>>([
  [
    'ISapConfig',
    new Set([
      'url',
      'client',
      'connectionType',
      'username',
      'mshost',
      'msserv',
      'sysid',
      'group',
      'saprouter',
    ]),
  ],
  [
    'IConnectionConfig',
    new Set(['serviceUrl', 'username', 'sapClient', 'language']),
  ],
  [
    'IValidatedAuthConfig',
    new Set([
      'sapUrl',
      'sapClient',
      'destination',
      'username',
      'errors',
      'warnings',
    ]),
  ],
  ['IAuthorizationConfig', new Set()],
  ['ITokenResult', new Set()],
  ['ReportedCredential', new Set()],
  ['SessionSecret', new Set()],
  ['IAuthProvider', new Set()],
]);

/** The environment and header keys of a credential, read by key. */
const CREDENTIAL_KEYS = new Set(['SAP_JWT_TOKEN', 'x-sap-jwt-token']);

const AUTH_LITERALS = new Set([
  'basic',
  'jwt',
  'saml',
  'certificate',
  'kerberos',
  'snc',
]);

const KIND_LITERALS = new Set(['cloud', 'onprem', 'legacy']);

/** What a kind-flag alias's declared name says. */
const KIND_FLAG_WORDS = ['cloud', 'onprem', 'legacy', 'kind'];

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

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', '__fixtures__']);

/** Every `.ts` source under `dir`, fixtures excluded. */
function helperFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) helperFiles(full, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Every `helpers` directory under a `__tests__` directory below `dir`. */
function helperTrees(dir: string, inTests: boolean, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (inTests && entry.name === 'helpers') {
      out.push(full);
      continue;
    }
    helperTrees(full, inTests || entry.name === '__tests__', out);
  }
}

/**
 * The test-helper trees: each `helpers` directory under a `__tests__`
 * directory of any package, found by walking the production directories.
 */
export function testHelperDirectories(): string[] {
  const out: string[] = [];
  for (const dir of productionDirectories()) {
    const full = path.join(REPO, dir);
    if (fs.existsSync(full)) helperTrees(full, false, out);
  }
  return out.map(rel).sort();
}

/** The production sources: every package's `src`, `scripts` and `tools`. */
export function productionSources(): string[] {
  return productionSourceDirectories().flatMap((dir) =>
    productionFiles(path.join(REPO, dir)),
  );
}

/**
 * The production directories: every package's `src`, and its `scripts`
 * and `tools` (the root's and each package directory's), found on disk.
 */
export function productionSourceDirectories(): string[] {
  const packages = fs
    .readdirSync(REPO, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name !== 'node_modules' &&
        fs.existsSync(path.join(REPO, entry.name, 'package.json')),
    )
    .map((entry) => entry.name);
  const extra = ['tools', 'scripts'].flatMap((leaf) =>
    ['', ...packages].map((dir) => (dir === '' ? leaf : `${dir}/${leaf}`)),
  );
  return [
    ...new Set([
      ...productionDirectories(),
      ...extra.filter((dir) => fs.existsSync(path.join(REPO, dir))),
    ]),
  ].sort();
}

/** The test-helper sources. */
export function testHelperSources(): string[] {
  return testHelperDirectories().flatMap((dir) =>
    helperFiles(path.join(REPO, dir)),
  );
}

/** One program over `files`, JavaScript included. */
export function createDerivationProgram(files: readonly string[]): ts.Program {
  return ts.createProgram({
    rootNames: [...files],
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      baseUrl: REPO,
      paths: sourcePaths(),
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      esModuleInterop: true,
      allowJs: true,
      checkJs: false,
      types: ['node', 'jest'],
      typeRoots: [path.join(REPO, 'node_modules/@types')],
    },
  });
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

/** A literal, or `undefined`: what a presence or value test compares with. */
function isLiteral(node: ts.Expression): boolean {
  const bare = strip(node);
  return (
    isStringLiteral(bare) ||
    ts.isNumericLiteral(bare) ||
    bare.kind === ts.SyntaxKind.TrueKeyword ||
    bare.kind === ts.SyntaxKind.FalseKeyword ||
    bare.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(bare) && bare.text === 'undefined')
  );
}

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

/** The scan of one file, on the program's checker. */
class FileScan {
  private readonly tainted = new Set<ts.Symbol>();
  private cache = new Map<ts.Node, boolean>();
  private readonly found: Derivation[] = [];

  constructor(
    private readonly checker: ts.TypeChecker,
    private readonly source: ts.SourceFile,
    private readonly production: boolean,
  ) {}

  private symbolOf(node: ts.Node): ts.Symbol | undefined {
    const symbol = this.checker.getSymbolAtLocation(node);
    if (symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias) {
      return this.checker.getAliasedSymbol(symbol);
    }
    return symbol;
  }

  private literalMembers(type: ts.Type): ts.Type[] | undefined {
    const members = (type.isUnion() ? type.types : [type]).filter(
      (member) =>
        (member.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) === 0,
    );
    return members.every((member) => member.isStringLiteral())
      ? members
      : undefined;
  }

  /** A union drawn only from the auth-type literals, two or more of them. */
  private isAuthUnion(type: ts.Type): boolean {
    const members = this.literalMembers(type);
    return (
      members !== undefined &&
      members.length >= 2 &&
      members.every(
        (member) => member.isStringLiteral() && AUTH_LITERALS.has(member.value),
      )
    );
  }

  private isKindType(type: ts.Type): boolean {
    const members = this.literalMembers(type);
    return (
      members !== undefined &&
      members.length >= 1 &&
      members.every(
        (member) => member.isStringLiteral() && KIND_LITERALS.has(member.value),
      )
    );
  }

  private ownerName(declaration: ts.Declaration): string | undefined {
    // A module's own symbol is declared by its source file, which has no parent.
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

  private isCredentialSymbol(symbol: ts.Symbol): boolean {
    for (const declaration of symbol.declarations ?? []) {
      const owner = this.ownerName(declaration);
      if (owner === undefined) continue;
      const settings = CREDENTIAL_DECLARATIONS.get(owner);
      if (settings !== undefined && !settings.has(symbol.name)) return true;
    }
    const declaration = symbol.valueDeclaration;
    if (declaration === undefined) return false;
    return this.isAuthUnion(
      this.checker.getTypeOfSymbolAtLocation(symbol, declaration),
    );
  }

  /** A credential read, by its symbol or its key. */
  private isCredentialRead(node: ts.Node): boolean {
    if (ts.isPropertyAccessExpression(node)) {
      if (CREDENTIAL_KEYS.has(node.name.text)) return true;
      const symbol = this.symbolOf(node.name);
      return symbol !== undefined && this.isCredentialSymbol(symbol);
    }
    if (ts.isElementAccessExpression(node)) {
      const key = node.argumentExpression;
      if (!isStringLiteral(key)) return false;
      if (CREDENTIAL_KEYS.has(key.text)) return true;
      const symbol = this.checker
        .getTypeAtLocation(node.expression)
        .getProperty(key.text);
      return symbol !== undefined && this.isCredentialSymbol(symbol);
    }
    if (ts.isCallExpression(node)) {
      return node.arguments.some(
        (argument) =>
          isStringLiteral(argument) && CREDENTIAL_KEYS.has(argument.text),
      );
    }
    if (ts.isIdentifier(node)) {
      const symbol = this.symbolOf(node);
      return symbol !== undefined && this.isCredentialSymbol(symbol);
    }
    return false;
  }

  /** Whether `node` is derived from a credential read, by direct flow. */
  derived(node: ts.Node): boolean {
    const known = this.cache.get(node);
    if (known !== undefined) return known;
    this.cache.set(node, false);
    const result = this.computeDerived(node);
    this.cache.set(node, result);
    return result;
  }

  private computeDerived(node: ts.Node): boolean {
    if (ts.isTypeNode(node)) return false;
    if (this.isCredentialRead(node)) return true;
    if (ts.isIdentifier(node)) {
      const symbol = this.symbolOf(node);
      return symbol !== undefined && this.tainted.has(symbol);
    }
    if (ts.isPropertyAccessExpression(node)) {
      const symbol = this.symbolOf(node.name);
      if (symbol !== undefined && this.tainted.has(symbol)) return true;
      return this.derived(node.expression);
    }
    if (ts.isPropertyAssignment(node)) return this.derived(node.initializer);
    if (ts.isShorthandPropertyAssignment(node)) {
      const symbol = this.checker.getShorthandAssignmentValueSymbol(node);
      return (
        symbol !== undefined &&
        (this.tainted.has(symbol) || this.isCredentialSymbol(symbol))
      );
    }
    if (isFunctionLike(node)) {
      return returnsOf(node).some((expression) => this.derived(expression));
    }
    let any = false;
    ts.forEachChild(node, (child) => {
      if (!any && this.derived(child)) any = true;
    });
    return any;
  }

  private taint(symbol: ts.Symbol | undefined): boolean {
    if (symbol === undefined || this.tainted.has(symbol)) return false;
    this.tainted.add(symbol);
    return true;
  }

  private taintNames(name: ts.BindingName): boolean {
    if (ts.isIdentifier(name)) return this.taint(this.symbolOf(name));
    let changed = false;
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) {
        changed = this.taintNames(element.name) || changed;
      }
    }
    return changed;
  }

  /** Destructured credential properties: `const { authType } = config`. */
  private taintDestructured(name: ts.BindingName, source: ts.Type): boolean {
    if (!ts.isObjectBindingPattern(name)) return false;
    let changed = false;
    for (const element of name.elements) {
      const property = element.propertyName ?? element.name;
      if (!ts.isIdentifier(property)) continue;
      const symbol = source.getProperty(property.text);
      if (symbol !== undefined && this.isCredentialSymbol(symbol)) {
        changed = this.taintNames(element.name) || changed;
      }
    }
    return changed;
  }

  /** The same-file function a call reaches, when it is one. */
  private sameFileCallee(
    call: ts.CallExpression,
  ): ts.FunctionLikeDeclaration | undefined {
    const symbol = this.symbolOf(call.expression);
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

  /** One pass of taint over the file; whether anything new was tainted. */
  private spread(): boolean {
    this.cache = new Map();
    let changed = false;
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
        if (node.initializer !== undefined && this.derived(node.initializer)) {
          changed = this.taintNames(node.name) || changed;
        }
        const from =
          node.initializer !== undefined
            ? this.checker.getTypeAtLocation(node.initializer)
            : ts.isParameter(node)
              ? this.checker.getTypeAtLocation(node)
              : undefined;
        if (from !== undefined) {
          changed = this.taintDestructured(node.name, from) || changed;
        }
      } else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        this.derived(node.right)
      ) {
        const left = strip(node.left);
        const target = ts.isPropertyAccessExpression(left) ? left.name : left;
        changed = this.taint(this.symbolOf(target)) || changed;
      } else if (
        (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
        node.name !== undefined &&
        returnsOf(node).some((expression) => this.derived(expression))
      ) {
        changed = this.taint(this.symbolOf(node.name)) || changed;
      } else if (ts.isCallExpression(node)) {
        const callee = this.sameFileCallee(node);
        if (callee !== undefined) {
          node.arguments.forEach((argument, index) => {
            const parameter = callee.parameters[index];
            if (parameter !== undefined && this.derived(argument)) {
              changed = this.taintNames(parameter.name) || changed;
            }
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(this.source);
    return changed;
  }

  private isKindFlagAlias(typeNode: ts.TypeNode): boolean {
    if (!ts.isTypeReferenceNode(typeNode)) return false;
    const symbol = this.symbolOf(typeNode.typeName);
    for (const declaration of symbol?.declarations ?? []) {
      if (
        ts.isTypeAliasDeclaration(declaration) &&
        declaration.type.kind === ts.SyntaxKind.BooleanKeyword
      ) {
        const name = declaration.name.text.toLowerCase();
        if (KIND_FLAG_WORDS.some((word) => name.includes(word))) return true;
      }
    }
    return false;
  }

  /** A declared target type that is a kind or a kind flag. */
  private isKindTarget(typeNode: ts.TypeNode | undefined): boolean {
    if (typeNode === undefined) return false;
    return (
      this.isKindFlagAlias(typeNode) ||
      this.isKindType(this.checker.getTypeFromTypeNode(typeNode))
    );
  }

  private isKindValue(expression: ts.Expression): boolean {
    const bare = strip(expression);
    if (isStringLiteral(bare)) return KIND_LITERALS.has(bare.text);
    if (ts.isConditionalExpression(bare)) {
      return (
        this.isKindValue(bare.whenTrue) && this.isKindValue(bare.whenFalse)
      );
    }
    return this.isKindType(this.checker.getTypeAtLocation(bare));
  }

  /** A comparison of a derived value with a literal, possibly negated or joined. */
  /** A credential read itself, its wrappers stripped. */
  private isDirectRead(expression: ts.Expression): boolean {
    return this.isCredentialRead(strip(expression));
  }

  /**
   * A credential boolean: a comparison of a derived value with a literal or
   * `undefined`; a presence test of a credential read (`!x`, `!!x`,
   * `Boolean(x)`); a membership test of one (`[…].includes(x)`,
   * `x in table`); or `&&` / `||` joining one of them.
   */
  private isCredentialBoolean(expression: ts.Expression): boolean {
    const bare = strip(expression);
    if (
      ts.isPrefixUnaryExpression(bare) &&
      bare.operator === ts.SyntaxKind.ExclamationToken
    ) {
      return (
        this.isDirectRead(bare.operand) ||
        this.isCredentialBoolean(bare.operand)
      );
    }
    if (ts.isCallExpression(bare)) {
      const callee = strip(bare.expression);
      const [first] = bare.arguments;
      if (first === undefined) return false;
      if (ts.isIdentifier(callee) && callee.text === 'Boolean') {
        return this.isDirectRead(first) || this.isCredentialBoolean(first);
      }
      return (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === 'includes' &&
        (this.isDirectRead(first) || this.isDirectRead(callee.expression))
      );
    }
    if (!ts.isBinaryExpression(bare)) return false;
    const operator = bare.operatorToken.kind;
    if (
      operator === ts.SyntaxKind.AmpersandAmpersandToken ||
      operator === ts.SyntaxKind.BarBarToken
    ) {
      return (
        this.isCredentialBoolean(bare.left) ||
        this.isCredentialBoolean(bare.right)
      );
    }
    if (operator === ts.SyntaxKind.InKeyword) {
      return this.isDirectRead(bare.left);
    }
    if (!COMPARISONS.has(operator)) return false;
    return (
      (this.derived(bare.left) && isLiteral(bare.right)) ||
      (this.derived(bare.right) && isLiteral(bare.left))
    );
  }

  /**
   * Whether `node` stands in a branch a derived value chooses: the then or
   * else of an `if`, a branch of a conditional, or a `case` of a `switch`
   * whose condition or discriminant is derived — up to its function.
   */
  private controlled(node: ts.Node): boolean {
    let child: ts.Node = node;
    let parent: ts.Node | undefined = node.parent;
    while (parent !== undefined && !isFunctionLike(child)) {
      if (
        ts.isIfStatement(parent) &&
        child !== parent.expression &&
        this.derived(parent.expression)
      ) {
        return true;
      }
      if (
        ts.isConditionalExpression(parent) &&
        child !== parent.condition &&
        this.derived(parent.condition)
      ) {
        return true;
      }
      if (
        (ts.isCaseClause(parent) || ts.isDefaultClause(parent)) &&
        this.derived(parent.parent.parent.expression)
      ) {
        return true;
      }
      child = parent;
      parent = parent.parent;
    }
    return false;
  }

  private report(
    form: DerivationForm,
    rule: DerivationRule,
    node: ts.Node,
  ): void {
    const line =
      this.source.getLineAndCharacterOfPosition(node.getStart(this.source))
        .line + 1;
    this.found.push({
      form,
      rule,
      where: `${rel(this.source.fileName)}:${line}`,
      text: collapse(node.getText(this.source)),
    });
  }

  /**
   * A value bound at `form`'s place: a kind value derived, or chosen by a
   * branch on a derived value; or a credential boolean.
   */
  private bound(
    form: DerivationForm,
    value: ts.Expression,
    target: ts.TypeNode | undefined,
  ): void {
    if (
      (this.derived(value) || this.controlled(value)) &&
      (this.isKindValue(value) || this.isKindTarget(target))
    ) {
      this.report(form, 'kind', value);
    }
    if (this.isCredentialBoolean(value)) {
      this.report(form, 'credential-boolean', value);
    }
  }

  private propertyTarget(
    assignment: ts.PropertyAssignment,
  ): ts.TypeNode | undefined {
    const literal = assignment.parent;
    const contextual = this.checker.getContextualType(literal);
    if (contextual === undefined || !ts.isIdentifier(assignment.name)) {
      return undefined;
    }
    const declaration = contextual.getProperty(
      assignment.name.text,
    )?.valueDeclaration;
    return declaration !== undefined &&
      (ts.isPropertySignature(declaration) ||
        ts.isPropertyDeclaration(declaration))
      ? declaration.type
      : undefined;
  }

  private assignmentTarget(left: ts.Expression): ts.TypeNode | undefined {
    const bare = strip(left);
    const symbol = this.symbolOf(
      ts.isPropertyAccessExpression(bare) ? bare.name : bare,
    );
    const declaration = symbol?.valueDeclaration;
    return declaration !== undefined &&
      (ts.isPropertySignature(declaration) ||
        ts.isPropertyDeclaration(declaration) ||
        ts.isVariableDeclaration(declaration) ||
        ts.isParameter(declaration))
      ? declaration.type
      : undefined;
  }

  private argumentTarget(
    call: ts.CallExpression,
    index: number,
  ): ts.TypeNode | undefined {
    const signature = this.checker.getResolvedSignature(call);
    const parameters = signature?.getParameters() ?? [];
    const parameter =
      parameters[Math.min(index, parameters.length - 1)]?.valueDeclaration;
    return parameter !== undefined && ts.isParameter(parameter)
      ? parameter.type
      : undefined;
  }

  private enclosingFunction(
    node: ts.Node,
  ): ts.FunctionLikeDeclaration | undefined {
    let current = node.parent;
    while (current !== undefined && !isFunctionLike(current)) {
      current = current.parent;
    }
    return current;
  }

  private isDecode(call: ts.CallExpression): boolean {
    const callee = strip(call.expression);
    const [first, second] = call.arguments;
    if (ts.isPropertyAccessExpression(callee)) {
      const method = callee.name.text;
      if (method === 'split') {
        return (
          first !== undefined &&
          isStringLiteral(first) &&
          first.text === '.' &&
          this.derived(callee.expression)
        );
      }
      const owner = strip(callee.expression);
      if (!ts.isIdentifier(owner) || first === undefined) return false;
      if (owner.text === 'Buffer' && method === 'from') {
        return (
          second !== undefined &&
          isStringLiteral(second) &&
          second.text.startsWith('base64') &&
          this.derived(first)
        );
      }
      if (owner.text === 'JSON' && method === 'parse') {
        return this.derived(first);
      }
      return false;
    }
    return (
      ts.isIdentifier(callee) &&
      callee.text === 'atob' &&
      first !== undefined &&
      this.derived(first)
    );
  }

  private sinks(): void {
    this.cache = new Map();
    const visit = (node: ts.Node) => {
      if (
        (ts.isVariableDeclaration(node) || ts.isParameter(node)) &&
        node.initializer !== undefined
      ) {
        this.bound('assignment', node.initializer, node.type);
      } else if (ts.isPropertyDeclaration(node) && node.initializer) {
        this.bound('property', node.initializer, node.type);
      } else if (ts.isPropertyAssignment(node)) {
        this.bound('property', node.initializer, this.propertyTarget(node));
      } else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      ) {
        this.bound('assignment', node.right, this.assignmentTarget(node.left));
      } else if (
        ts.isBinaryExpression(node) &&
        COMPARISONS.has(node.operatorToken.kind) &&
        ((this.isKindValue(node.left) && this.derived(node.right)) ||
          (this.isKindValue(node.right) && this.derived(node.left)))
      ) {
        this.report('comparison', 'kind', node);
      } else if (ts.isReturnStatement(node) && node.expression !== undefined) {
        this.bound(
          'return',
          node.expression,
          this.enclosingFunction(node)?.type,
        );
      } else if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) {
        this.bound('return', node.body, node.type);
      }
      if (ts.isCallExpression(node)) {
        node.arguments.forEach((argument, index) => {
          if (!this.derived(argument) && !this.controlled(argument)) return;
          if (
            this.isKindValue(argument) ||
            this.isKindTarget(this.argumentTarget(node, index))
          ) {
            this.report('argument', 'kind', argument);
          }
        });
        if (this.production && this.isDecode(node)) {
          this.report('decode', 'decode', node);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(this.source);
  }

  scan(): Derivation[] {
    while (this.spread()) {
      // until nothing new is tainted
    }
    this.sinks();
    return this.found;
  }
}

/**
 * Every derivation in `files` (each read on `program`): the kind check on
 * every file, the decoding ban on `production` ones only.
 */
export function scanDerivations(
  program: ts.Program,
  files: Iterable<string>,
  production: ReadonlySet<string>,
): Derivation[] {
  const checker = program.getTypeChecker();
  const out: Derivation[] = [];
  for (const file of files) {
    const source = program.getSourceFile(file);
    if (source === undefined) {
      throw new Error(`the program holds no ${rel(file)}`);
    }
    out.push(...new FileScan(checker, source, production.has(file)).scan());
  }
  return out;
}

/**
 * The members of the interface `owner` the scan reads as the authorization,
 * and the settings it leaves out, as `program` declares them (every
 * declaration of that name).
 */
export function declaredAuthorization(
  program: ts.Program,
  owner: string,
): { authorization: string[]; settings: string[] } {
  const settings = CREDENTIAL_DECLARATIONS.get(owner);
  if (settings === undefined) throw new Error(`${owner} is not listed`);
  const members = new Set<string>();
  for (const source of program.getSourceFiles()) {
    ts.forEachChild(source, function visit(node) {
      if (ts.isInterfaceDeclaration(node) && node.name.text === owner) {
        for (const member of node.members) {
          if (member.name !== undefined && ts.isIdentifier(member.name)) {
            members.add(member.name.text);
          }
        }
      }
      if (ts.isModuleDeclaration(node)) ts.forEachChild(node, visit);
    });
  }
  const all = [...members].sort();
  return {
    authorization: all.filter((name) => !settings.has(name)),
    settings: all.filter((name) => settings.has(name)),
  };
}
