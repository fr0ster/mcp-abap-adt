import { globSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import ts from 'typescript';

export function analyseOmissions(handlers: string[]): {
  offenders: string[];
  inspected: number;
} {
  const program = ts.createProgram(handlers, compilerOptions());
  const checker = program.getTypeChecker();
  const offenders: string[] = [];
  let inspected = 0;
  for (const file of handlers) {
    const source = program.getSourceFile(file);
    if (source === undefined) continue;
    for (const call of memberCallsIn(source)) {
      const signature = checker.getResolvedSignature(call);
      // A call the checker cannot resolve tells us nothing. This test is
      // meaningful only on a clean build, which is why it comes after Task 25.
      const options = signature?.parameters.at(-1);
      if (options === undefined) continue;
      // Non-nullable, or an optional parameter's declared type is always
      // `T | undefined` — a union whose `getProperties()` answers only what
      // every member shares, which with `undefined` is nothing. Skipping on
      // that empty result would skip every optional-options call whether or
      // not it actually accepts `analyse`, which is not "this member takes no
      // strategy" — it is the check unable to see past its own parameter type.
      const type = checker.getNonNullableType(
        checker.getTypeOfSymbolAtLocation(options, call),
      );
      if (!type.getProperties().some((p) => p.name === 'analyse')) continue;
      inspected += 1;
      // Neither the syntax alone nor the type alone answers this.
      //
      // Syntax alone reports a legitimate options variable as an omission.
      // The declared type alone is worse: `IAdtOperationOptions` declares
      // `analyse` OPTIONAL, so `const o: IAdtOperationOptions = {}` satisfies
      // `getProperty('analyse')` while passing no strategy at all. A type says
      // what may be there; only a value says what is.
      //
      // So follow the value to the nearest object literal — the argument
      // itself, or the initializer of the const it names — and look for the
      // property there. Anything further than that is not decidable from the
      // source, and this repository's convention is therefore: pass `analyse`
      // in the call, or in a `const` initialized with an object literal in the
      // same file. A strategy assembled at runtime is reported, with a message
      // saying to inline it rather than a message saying it is missing.
      const passed = call.arguments.at(-1);
      const verdict = carriesAnalyse(passed, checker);
      if (verdict !== 'yes') {
        offenders.push(
          `${file}:${lineOf(source, call)} — ${call.expression.getText()} — ${
            verdict === 'no'
              ? 'no analyse passed'
              : 'analyse not provable from the source; inline it'
          }`,
        );
      }
    }
  }
  // The caller guards against a run that measured nothing: a program built with
  // wrong options resolves no signature, finds no member that accepts an
  // `analyse`, and answers an empty offenders list. Roughly 275 call sites
  // across 174 handler files carry one, so a run that inspects a handful did
  // not resolve.
  return { offenders, inspected };
}

/**
 * The project's own compiler options.
 *
 * Not a JSON parse of tsconfig: the compiler API needs `extends` resolved,
 * paths made absolute against the config's directory, and the defaults filled
 * in. `parseJsonConfigFileContent` is what does all three, and a program built
 * with hand-rolled options resolves `@mcp-abap-adt/*` to nothing and reports
 * every signature as unresolved — which this test would then read as "no call
 * accepts an analyse" and pass while checking nothing.
 */
export function compilerOptions(): ts.CompilerOptions {
  // scripts/lib -> scripts -> repo root: two levels, not three. This module
  // used to live at src/lib/audit, one directory deeper, where '../../..' was
  // correct; moving it without updating this made every program resolve the
  // wrong tsconfig.json from the parent of the repo, if one even exists there.
  const root = join(__dirname, '../..');
  const configPath = ts.findConfigFile(
    root,
    ts.sys.fileExists,
    'tsconfig.json',
  );
  if (configPath === undefined) throw new Error('tsconfig.json not found');
  const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
  if (error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  }
  const parsed = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    dirname(configPath),
  );
  if (parsed.errors.length > 0) {
    throw new Error(
      parsed.errors
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
        .join('\n'),
    );
  }
  // `noEmit`, because this program is only ever asked questions.
  return { ...parsed.options, noEmit: true };
}

/**
 * Does this argument actually carry a strategy?
 *
 *  'yes'       — something in it sets `analyse` to a value that cannot be
 *                `undefined`. The type decides that, not the spelling.
 *  'no'        — nothing sets it, or what sets it IS `undefined`.
 *  'unknown'   — it may be set and may be nothing: a spread this file cannot
 *                see into, a value typed `T | undefined`, an `any`. Not
 *                provable here, and reported as such rather than allowed.
 *
 * **Read right to left.** An object literal applies its properties in order and
 * the last writer wins, so `{ analyse: x, ...opts }` does not carry a strategy
 * if `opts` sets `analyse: undefined`, and `{ ...opts, analyse: x }` does carry
 * one whatever `opts` holds. A left-to-right scan answers both backwards.
 *
 * A spread that definitely has no `analyse` overrides nothing, so it does not
 * end the scan — spreading an object without the key leaves the key alone.
 */
function carriesAnalyse(
  argument: ts.Expression | undefined,
  checker: ts.TypeChecker,
): 'yes' | 'no' | 'unknown' {
  if (argument === undefined) return 'no';

  if (ts.isObjectLiteralExpression(argument)) {
    for (let i = argument.properties.length - 1; i >= 0; i -= 1) {
      const property = argument.properties[i];

      if (property.name?.getText() === 'analyse') {
        // The TYPE of the value, not its spelling. `analyse: undefined` is the
        // obvious case, but `const analyse = undefined; { analyse }`,
        // `analyse: maybeStrategy` typed `Strategy | undefined` and
        // `analyse: enabled ? strategy : undefined` all pass a key whose value
        // may be nothing, and the library reads that as no strategy passed.
        const value = ts.isPropertyAssignment(property)
          ? property.initializer
          : ts.isShorthandPropertyAssignment(property)
            ? property.name
            : undefined;
        if (value === undefined) return 'unknown';
        return admitsUndefined(checker.getTypeAtLocation(value));
      }

      if (ts.isSpreadAssignment(property)) {
        const spread = carriesAnalyse(property.expression, checker);
        if (spread !== 'no') return spread; // 'yes' wins here; 'unknown' may override
      }
    }
    return 'no';
  }

  if (ts.isIdentifier(argument)) {
    const symbol = checker.getSymbolAtLocation(argument);
    const declaration = symbol?.declarations?.[0];
    // A `const` binding is the only one whose initializer still describes the
    // value at the call. `let options = { analyse: x }; options = {}` has the
    // same initializer and passes nothing, so following a `let` would prove
    // the opposite of what it looks like.
    if (
      declaration !== undefined &&
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer !== undefined &&
      isConstBinding(declaration)
    ) {
      return carriesAnalyse(declaration.initializer, checker);
    }
    return 'unknown';
  }

  return 'unknown';
}

/**
 * Was this declared `const`?
 *
 * The flag lives on the declaration LIST, not on the declaration, so
 * `declaration.flags` answers nothing useful and `declaration.parent` is where
 * to ask.
 *
 * **What this still does not prove.** `const` fixes the binding, not the
 * object: `const o = { analyse: x }; o.analyse = undefined;` would pass. Nothing
 * short of tracking mutation catches that, and this check does not try. It is
 * why the convention is written as it is — pass the strategy in the call, or in
 * a `const` literal left alone — and why the invariant is a guard rather than a
 * proof.
 */
function isConstBinding(declaration: ts.VariableDeclaration): boolean {
  const list = declaration.parent;
  return (
    ts.isVariableDeclarationList(list) &&
    (list.flags & ts.NodeFlags.Const) !== 0
  );
}

/**
 * Can this value be nothing?
 *
 *  'no'       — it IS `undefined`. A key set to nothing is no strategy.
 *  'unknown'  — it MAY be: a union with `undefined`, or `any`/`unknown`, where
 *               the author may have a runtime guarantee this file cannot see.
 *               Reported as unprovable, with the message to make it provable.
 *  'yes'      — it cannot be.
 */
function admitsUndefined(type: ts.Type): 'yes' | 'no' | 'unknown' {
  const OPAQUE = ts.TypeFlags.Any | ts.TypeFlags.Unknown;
  const NOTHING = ts.TypeFlags.Undefined | ts.TypeFlags.Void;

  if ((type.flags & OPAQUE) !== 0) return 'unknown';
  if (!type.isUnion()) return (type.flags & NOTHING) !== 0 ? 'no' : 'yes';

  const parts = type.types;
  if (parts.every((t) => (t.flags & NOTHING) !== 0)) return 'no';
  if (parts.some((t) => (t.flags & (NOTHING | OPAQUE)) !== 0)) return 'unknown';
  return 'yes';
}

/** Every `x.y(...)` in a file — the shape a client member call takes. */
function memberCallsIn(source: ts.SourceFile): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

/** 1-indexed, so the message matches what an editor shows. */
function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

/**
 * Which factory produced this receiver, or `'AdtClient'` for the receiver
 * that names factories in the first place — resolved from the receiver's
 * TYPE, not from the syntax that produced it.
 *
 * **Why type, not syntax.** A syntax walk has to enumerate every shape a
 * value can travel through — a direct chain, a `const` alias, an `as any`
 * assertion — and still misses whatever shape it did not enumerate: a shared
 * helper (`function utilsOf(client) { return client.getUtils(ourUtils); }`),
 * a destructured binding, a value produced by `await`. A type carries none of
 * that history and needs none of it: `checker.getTypeAtLocation` answers the
 * same `IPackageContract<R>` whether `pkg` came from `client.getPackage()`
 * directly, from a helper that returns one, from destructuring, or from
 * awaiting a promise of one, because in every one of those cases TypeScript's
 * own inference already computed it. This function classifies a small,
 * closed set of shapes the two factory overloads produce — a named type
 * alias (`getPackage`/`getRequest`/`getDomain`/… all return
 * `IXxxContract<R>` for both overloads), a bare class (`getUnitTest()`,
 * `getUtils()`, `getCdsUnitTest()`, `getServiceBinding()` with no results
 * argument), or one of two capability-interface fingerprints for the two
 * factories whose with-results overload returns an unnamed intersection
 * (`getUnitTest`/`getCdsUnitTest` both carry `ITestRunInformation`,
 * distinguished by `ICdsTestDoubleCheckable`; `getUtils` is the only one
 * carrying `IAdtDataPreview` and `IAdtGroupLifecycle` together) — and none of
 * it depends on which syntax shape reached the receiver.
 *
 * **The one place type alone is not enough: `as any`/`as unknown`.** These are
 * the one construct in the language whose entire purpose is to make the
 * checker answer something other than the truth, so asking it directly gives
 * up the answer this function exists to find — confirmed by construction:
 * `checker.getTypeAtLocation` on a `const unitTest = client.getUnitTest() as
 * any` identifier answers `any` at every later use, not `AdtUnitTest`. The
 * fix is not more syntax-walking in general — it is to see through exactly
 * this one erasure, at the one place it happens (the assertion's own operand,
 * or a `const` initialized with one), and ask the type of what was asserted
 * away instead of the assertion's result. Everything else — parens, `await`,
 * non-null, `satisfies`, a `const` bound to a helper call, a destructured
 * property — already resolves correctly through `getTypeAtLocation` and needs
 * no special case.
 */
function classify(
  receiver: ts.Expression,
  checker: ts.TypeChecker,
): string | undefined {
  if (ts.isAsExpression(receiver) || ts.isTypeAssertionExpression(receiver)) {
    return classify(receiver.expression, checker);
  }
  const type = checker.getTypeAtLocation(receiver);
  const OPAQUE = ts.TypeFlags.Any | ts.TypeFlags.Unknown;
  if ((type.flags & OPAQUE) === 0) {
    const found = classifyType(type);
    if (found !== undefined) return found;
  }
  // The type at this location was not informative — `any`/`unknown` (an `as
  // any` erased it here, or somewhere upstream) or a recognised shape this
  // function does not classify. If this is a `const` naming a value, look at
  // what was actually assigned rather than trusting an erased type; a
  // rebound `let` no longer describes what its initializer said, so only a
  // `const` is followed, the same rule `carriesAnalyse` applies.
  if (ts.isIdentifier(receiver)) {
    const declaration =
      checker.getSymbolAtLocation(receiver)?.declarations?.[0];
    if (
      declaration !== undefined &&
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer !== undefined &&
      isConstBinding(declaration)
    ) {
      return classify(declaration.initializer, checker);
    }
  }
  return undefined;
}

const ALIAS_FACTORY: Record<string, string> = {
  IPackageContract: 'getPackage',
  IRequestContract: 'getRequest',
  IDomainContract: 'getDomain',
  IDataElementContract: 'getDataElement',
  IStructureContract: 'getStructure',
  ITableContract: 'getTable',
  ITableTypeContract: 'getTableType',
  IAccessControlContract: 'getAccessControl',
  IServiceDefinitionContract: 'getServiceDefinition',
  IBehaviorDefinitionContract: 'getBehaviorDefinition',
  IBehaviorImplementationContract: 'getBehaviorImplementation',
  IMetadataExtensionContract: 'getMetadataExtension',
  IEnhancementContract: 'getEnhancement',
};

const SYMBOL_FACTORY: Record<string, string> = {
  AdtClient: 'AdtClient',
  // Kept: the resolver maps a symbol to the factory it stands for, and this
  // one costs a line. No handler reaches it now that legacy is parked.
  AdtClientLegacy: 'AdtClient',
  AdtUnitTest: 'getUnitTest',
  AdtUtils: 'getUtils',
  AdtServiceBinding: 'getServiceBinding',
  AdtCdsUnitTest: 'getCdsUnitTest',
};

function classifyType(type: ts.Type): string | undefined {
  const alias = type.aliasSymbol?.getName();
  if (alias !== undefined && ALIAS_FACTORY[alias] !== undefined) {
    return ALIAS_FACTORY[alias];
  }
  const symbol = type.getSymbol()?.getName();
  if (symbol !== undefined && SYMBOL_FACTORY[symbol] !== undefined) {
    return SYMBOL_FACTORY[symbol];
  }
  if (type.isIntersection()) {
    const parts = new Set(
      type.types.map((t) => t.getSymbol()?.getName()).filter(Boolean),
    );
    if (parts.has('ITestRunInformation')) {
      return parts.has('ICdsTestDoubleCheckable')
        ? 'getCdsUnitTest'
        : 'getUnitTest';
    }
    if (parts.has('IAdtDataPreview') && parts.has('IAdtGroupLifecycle')) {
      return 'getUtils';
    }
  }
  return undefined;
}

/** `factoryOf` reads better at a call site than the resolver's own name. */
function factoryOf(
  receiver: ts.Expression,
  checker: ts.TypeChecker,
): string | undefined {
  return classify(receiver, checker);
}

/**
 * Handlers whose `detail` argument disagrees with their own tool schema.
 *
 * Both directions are defects, checked at TWO sites, not one. A tool that
 * offers `detail` and hardcodes `'terse'` — in the `answer()` CONTEXT, or in
 * its PROJECTION, the third argument — advertises a parameter it ignores. A
 * tool that offers none and reads `detailOf(args)` anywhere reads a
 * parameter no caller can set — harmless today, and a lie in the schema the
 * day someone reads the handler to learn the contract. Checking only the
 * context misses a real shape: a handler can carry `detail` correctly into
 * `answer()`'s first argument and still hardcode the level in the
 * projection beside it, so the tool advertises the parameter and silently
 * ignores it. Fix round 1 proved this live on a real handler before the
 * projection check existed here.
 *
 * `declares` is resolved against `declaresDetail` — the set of tool names
 * the tool SURFACE (`scripts/list-tools.ts`'s rows) actually says declare
 * `detail` — not against this file's own text. A regex over the whole file
 * is satisfied by an unused `import { DETAIL_PROPERTY }` line alone: delete
 * the schema spread and keep the import, and the regex still says
 * `declares`. The tool's own registered name, read off its
 * `TOOL_DEFINITION` object literal, is what the caller (the test that
 * already loaded the surface rows) can check against real data instead.
 */
export function detailWiring(
  handlers: string[],
  declaresDetail: ReadonlySet<string>,
): string[] {
  const program = ts.createProgram(handlers, compilerOptions());
  // `.parent` on every node — `answerCallsIn`'s `node.expression.getText()`
  // and every other bare `.getText()` call below need it — is set by the
  // BINDER, not by parsing alone. `createProgram` parses lazily and does not
  // bind until something asks for semantic information; every other walk in
  // this file already forces that by calling `getResolvedSignature`/
  // `getSymbolAtLocation` on the checker before it reads `.getText()`, so it
  // never surfaced here. This walk asks the checker nothing, so without this
  // line every node's `.parent` is `undefined` and `.getText()` throws
  // reading `.text` off the `undefined` source file it can no longer find.
  const checker = program.getTypeChecker();
  const offenders: string[] = [];
  for (const file of handlers) {
    const source = program.getSourceFile(file);
    if (source === undefined) continue;

    const toolName = toolNameOf(source);
    const declares = toolName !== undefined && declaresDetail.has(toolName);

    const calls = answerCallsIn(source);
    // No `answer()` at all is the emptiest way to pass: the loop below never
    // runs, so it can report nothing. A tool that declares `detail` and never
    // reaches the adapter has not wired the parameter — it has nowhere to.
    if (declares && calls.length === 0) {
      offenders.push(
        `${file} — tool declares detail and the handler never calls answer()`,
      );
    }

    for (const call of calls) {
      const ctx = call.arguments[0];

      // A context this walk cannot read is not a pass. The failure being
      // guarded against is a tool that declares `detail` and never passes it,
      // and `continue` on an unreadable context is exactly how that escapes:
      // no property, no offender, invariant green.
      if (ctx === undefined || !ts.isObjectLiteralExpression(ctx)) {
        if (declares) {
          offenders.push(
            `${file}:${lineOf(source, call)} — tool declares detail, answer() context is not a literal this check can read`,
          );
        }
        continue;
      }

      const detailProp = ctx.properties.find(
        (p) => p.name?.getText() === 'detail',
      );
      if (detailProp === undefined) {
        if (declares) {
          offenders.push(
            `${file}:${lineOf(source, call)} — tool declares detail, answer() passes none`,
          );
        }
        continue;
      }

      // `{ tool: 'X', detail: <expr> }` names the value directly.
      // `{ tool: 'X', detail }` — the shape every already-migrated handler
      // actually writes, sharing one `const detail = detailOf(args)`
      // between this context and the `project(detail, terseX)` call below
      // it — names the SAME identifier as the property, and has to be
      // resolved to what that binding holds, the same way `carriesAnalyse`
      // follows a `const` elsewhere in this file. Treating every shorthand
      // as unreadable would flag that entire, already-reviewed corpus; the
      // actual hidden failure a shorthand can carry is a `const` bound to
      // something other than `detailOf(args)` — a hardcoded level routed
      // through a variable named to look wired. A spread is not resolved at
      // all and falls through to the same "unreadable" report below.
      //
      // `bindingSymbol`, when resolvable, is kept beyond this block: the
      // PROJECTION check below asks whether it reaches the same variable,
      // not just whether the context does.
      let value: ts.Expression | undefined;
      let bindingSymbol: ts.Symbol | undefined;
      if (ts.isPropertyAssignment(detailProp)) {
        value = detailProp.initializer;
        if (ts.isIdentifier(value)) {
          bindingSymbol = checker.getSymbolAtLocation(value);
        }
      } else if (ts.isShorthandPropertyAssignment(detailProp)) {
        bindingSymbol = checker.getShorthandAssignmentValueSymbol(detailProp);
        value = constInitializerOf(bindingSymbol);
      }

      if (value === undefined) {
        offenders.push(
          `${file}:${lineOf(source, detailProp)} — detail passed in a form this check cannot read; write detailOf(args) or a literal`,
        );
        continue;
      }

      const ctxDynamic = isDetailOfCall(value);
      if (declares !== ctxDynamic) {
        offenders.push(
          `${file}:${lineOf(source, value)} — tool ${declares ? 'declares' : 'does not declare'} detail, handler passes ${value.getText()}`,
        );
      }

      // The projection: `answer()`'s third argument. A tool can carry a
      // correct, dynamic `detail` into the context above and still hand
      // `answer()` a projection that ignores it — `project('terse', …)`
      // hardcoded beside a perfectly wired context, or a hand-written
      // projection that never reads the `detail` variable at all. Silence
      // here is exactly the gap fix round 1 found live: the context check
      // alone caught the one corpus defect this migration had only because
      // BOTH of its sites happened to be hardcoded together.
      const projection = call.arguments[2];
      const projectionResult = classifyProjection(
        projection,
        bindingSymbol,
        checker,
      );
      if (projectionResult === 'literal' && declares) {
        offenders.push(
          `${file}:${lineOf(source, projection ?? call)} — tool declares detail, the answer() projection does not vary with it`,
        );
      }
      if (projectionResult === 'dynamic' && !declares) {
        offenders.push(
          `${file}:${lineOf(source, projection ?? call)} — tool does not declare detail, the answer() projection varies with it anyway`,
        );
      }
    }
  }
  return offenders;
}

/**
 * The tool's own registered name, read off `export const TOOL_DEFINITION = {
 * name: '...', ... }` (an `as const` wrapper, when present, is unwrapped).
 * `undefined` when no such literal is found — a file this check should not
 * silently treat as declaring anything.
 *
 * Exported so a caller choosing WHICH files to hand `detailWiring` can
 * resolve each one's tool name the same way this file does internally —
 * from the syntax tree, keyed on the `TOOL_DEFINITION` declaration
 * specifically. A caller that instead took "the first quoted `name:` in the
 * file" would misidentify any file where an unrelated object carrying its
 * own `name` property sits above the real `TOOL_DEFINITION` — silently
 * dropping that file out of the audit rather than reading the tool it
 * actually is. Needs only a parsed `ts.SourceFile`, not a full `ts.Program`
 * — this walk is syntactic, no type information involved — so a caller can
 * build one with a bare `ts.createSourceFile` per file.
 */
export function toolNameOf(source: ts.SourceFile): string | undefined {
  let name: string | undefined;
  const visit = (node: ts.Node): void => {
    if (name !== undefined) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'TOOL_DEFINITION' &&
      node.initializer !== undefined
    ) {
      const initializer = ts.isAsExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer;
      if (ts.isObjectLiteralExpression(initializer)) {
        const nameProperty = initializer.properties.find(
          (p) => p.name?.getText() === 'name',
        );
        if (
          nameProperty !== undefined &&
          ts.isPropertyAssignment(nameProperty) &&
          ts.isStringLiteralLike(nameProperty.initializer)
        ) {
          name = nameProperty.initializer.text;
        }
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return name;
}

/** Is this expression a call to `detailOf(...)`? */
function isDetailOfCall(expr: ts.Expression): boolean {
  return ts.isCallExpression(expr) && expr.expression.getText() === 'detailOf';
}

/**
 * What a symbol's `const` declaration was initialised with, or `undefined`
 * if there is no such binding — a `let`, a destructured parameter, an
 * import, anything reassignable, or no symbol at all. Shares
 * `isConstBinding`'s reasoning with `carriesAnalyse` above: a `const`
 * binding fixes the REFERENCE, not the value behind it, but that is the
 * convention this repository writes `detail` to, and nothing short of a
 * full mutation analysis would prove more.
 */
function constInitializerOf(
  symbol: ts.Symbol | undefined,
): ts.Expression | undefined {
  const declaration = symbol?.declarations?.[0];
  return declaration !== undefined &&
    ts.isVariableDeclaration(declaration) &&
    declaration.initializer !== undefined &&
    isConstBinding(declaration)
    ? declaration.initializer
    : undefined;
}

/**
 * Does `answer()`'s third argument actually vary with the SAME `detail`
 * binding the context resolved to?
 *
 *  'dynamic'  — yes: `project(detail, …)` (or `project(detailOf(args), …)`
 *               directly) reading the identical variable, or a hand-written
 *               projection function whose body references that same
 *               variable somewhere.
 *  'literal'  — no: `project('terse', …)`, or a hand-written projection
 *               that never reaches the binding at all.
 *  'unknown'  — not provable from here (no binding to compare against, an
 *               identifier this walk cannot resolve, some other shape) —
 *               reported only when reported some other way already, never
 *               used on its own to accuse a tool of ignoring `detail`.
 *
 * **Symbol identity, not text.** A hand-written projection is scanned for
 * any identifier resolving to the SAME symbol the context's `detail`
 * resolved to — not for the literal substring `"detail"`, which a
 * shadowing parameter of the same name would satisfy without actually
 * reading the outer binding, and a renamed variable would fail to satisfy
 * despite reading it correctly. `checker.getSymbolAtLocation` disambiguates
 * both cases the way it already does for `carriesAnalyse`'s `const`-tracing
 * above.
 */
function classifyProjection(
  projection: ts.Expression | undefined,
  bindingSymbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
): 'dynamic' | 'literal' | 'unknown' {
  if (projection === undefined) return 'unknown';

  // A projection bound to a `const` and passed by name — `const project =
  // (entries) => ({...}); return answer(ctx, call, project);`
  // (`RuntimeListFeeds`, the two profiler readers, the two class-run
  // handlers all write exactly this shape) — resolves the SAME way the
  // context's own `detail` identifier does, via `constInitializerOf`, and
  // is then classified as whatever that initializer turns out to be:
  // another `project(...)` call, a hand-written function, or (an import,
  // the shape every one of those five handlers' own `terseClassRun`/
  // `terseProfilingRun` is) something this walk cannot see into, which
  // stays 'unknown' the same way an unresolvable ctx value does. Skipping
  // this resolution — the gap fix round 2 found — let a hardcoded
  // projection hide behind a name: `project('terse', …)` written once,
  // bound to a `const`, and handed to every `answer()` call by identifier
  // reads as unreadable at every site rather than as the one hardcoded
  // literal it is.
  if (ts.isIdentifier(projection)) {
    const symbol = checker.getSymbolAtLocation(projection);
    const initializer = constInitializerOf(symbol);
    return initializer === undefined
      ? 'unknown'
      : classifyProjection(initializer, bindingSymbol, checker);
  }

  if (
    ts.isCallExpression(projection) &&
    projection.expression.getText() === 'project'
  ) {
    const first = projection.arguments[0];
    if (first === undefined) return 'unknown';
    if (isDetailOfCall(first)) return 'dynamic';
    if (ts.isIdentifier(first)) {
      const symbol = checker.getSymbolAtLocation(first);
      if (bindingSymbol !== undefined && symbol === bindingSymbol) {
        return 'dynamic';
      }
      const initializer = constInitializerOf(symbol);
      if (initializer !== undefined) {
        return isDetailOfCall(initializer) ? 'dynamic' : 'literal';
      }
      return 'unknown';
    }
    if (ts.isStringLiteralLike(first)) return 'literal';
    return 'unknown';
  }

  if (ts.isArrowFunction(projection) || ts.isFunctionExpression(projection)) {
    // No binding to compare against — the context itself did not resolve to
    // a named variable (it may have been a literal, or unreadable, both
    // reported already at the context site). Nothing MORE this check can
    // prove about the projection in that case.
    if (bindingSymbol === undefined) return 'unknown';
    let found = false;
    const visit = (node: ts.Node): void => {
      if (found) return;
      if (
        ts.isIdentifier(node) &&
        checker.getSymbolAtLocation(node) === bindingSymbol
      ) {
        found = true;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(projection.body);
    return found ? 'dynamic' : 'literal';
  }

  return 'unknown';
}

/** Calls to `answer(...)` — the only place a detail reaches a caller. */
function answerCallsIn(source: ts.SourceFile): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.getText() === 'answer') {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}
