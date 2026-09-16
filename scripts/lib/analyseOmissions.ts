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
function compilerOptions(): ts.CompilerOptions {
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
 * Which `(handler, Legacy class, member)` pairs land on a member the legacy
 * contract does not parameterise — meaning: does not accept, in any form,
 * what a caller on a modern system would pass it.
 *
 * A handler reaches a member through `client.getPackage().readMetadata(...)`;
 * the factory (`getPackage`) decides which class serves the call on a legacy
 * system, and only four of the ten overridden classes are affected —
 * eighteen members across them, measured against the shipped `.js`, not the
 * `.d.ts`.
 *
 * **Not all eighteen drop the same thing, and calling all of it "the
 * strategy" overstates nine of them.** Nine genuinely drop `analyse` — a
 * caller-supplied failure verdict modern accepts and legacy ignores. The
 * other nine never accepted `analyse` on modern either; what legacy drops
 * there is something else — a positional argument, a run identifier, a table
 * name, an already-single-purpose options field — which is a different
 * failure mode, and in the unit-test trio's case a worse one (see
 * `AdtUnitTestLegacy.js` below and issue #208, which this ledger's
 * construction surfaced rather than caused).
 *
 * - `AdtPackageLegacy.js` (6: 5 genuinely drop `analyse`, 1 never had one):
 *   `create`, `readMetadata`, `validate`, `updateMetadata`, `delete` are
 *   declared with an EMPTY parameter list and always answer
 *   `failed(UNSUPPORTED)` — modern `AdtPackage` accepts
 *   `IAdtOperationOptions<E>`/`IAdtCreateOptions<E>` on every one of these, so
 *   whatever a caller passes, including `analyse`, is discarded before it is
 *   ever bound to a name. `read()` is also declared and overridden with an
 *   empty parameter list, but modern `AdtPackage` implements
 *   `IAdtMetadataReadable`, not `IAdtReadable` — it has no public `read`
 *   member at all, so no caller on either system could ever have handed this
 *   one an `analyse` to begin with; the legacy override is dead code from the
 *   type's perspective, not a dropped strategy.
 * - `AdtUnitTestLegacy.js` (3, none of which had a caller `analyse` to drop):
 *   `run(tests, options)` binds `options` but the wire call underneath is
 *   `startClassUnitTestRunLegacy(connection, tests, _options)` — renamed,
 *   unread — and `answering(runFn, () => LEGACY_SYNC_RUN_ID)` takes only two
 *   arguments, dropping the shipped `startedRun` verdict modern's `run` adds
 *   as a third; `IClassUnitTestRunOptions` never declared `analyse` on either
 *   system, so what is lost here is the library's own default check, not a
 *   caller's. `getStatus()`/`getResult()` are declared and called with NO
 *   parameters at all — not even the run id modern's `getResult(runId,
 *   options)` takes, and modern's `getStatus`/`getResult` never accepted
 *   `analyse` either — and simply replay whatever `run()` already captured.
 * - `AdtRequestLegacy.js` (5: 4 genuinely drop `analyse`, 1 never had one):
 *   `create`, `readMetadata`, `updateMetadata`, `delete` all either take no
 *   parameters (`create`/`updateMetadata`/`delete`, hardcoded refusal, same
 *   shape as `AdtPackageLegacy`) or bind `options`/`config` and never read
 *   `analyse` out of it (`readMetadata`). Modern's `AdtRequest` accepts
 *   `IAdtOperationOptions<E>`/`IAdtCreateOptions<E>` on all four. `list` is
 *   declared and overridden too, and it does bind `options` and reads only
 *   `options?.configUri` out of it — but modern's own `IListTransportsOptions`
 *   is `{ configUri?: string }`, one field and never an `analyse`, so there
 *   was nothing for either system's `list` to drop.
 * - `AdtUtilsLegacy.js` (4, none of which had a caller `analyse` to drop):
 *   `activateObjectsGroup(objects, preauditRequested)` has no third parameter
 *   on legacy OR modern — `AdtUtils.d.ts` declares none either — so this one
 *   is inert everywhere, not legacy-specific (also tracked in #200);
 *   `getTableColumns`, `getTableContents` and `getSqlQuery` all take their
 *   single positional argument renamed with a leading underscore and answer a
 *   hardcoded connection failure instead of making the call — modern accepts
 *   no options on these three either, so what legacy drops is the argument
 *   itself (a table name, a query), not a strategy layered on top of one.
 *
 * **`AdtRequestLegacy.create` is in this list.** It shares `AdtPackageLegacy`'s
 * empty-parameter-list, always-refuse shape and was missing from an earlier
 * draft of this table (which counted seventeen, not eighteen, across a
 * four-entry `getRequest` list rather than this one's five). No handler this
 * repository ships reaches `getRequest()` on a system declaring `'legacy'` in
 * `available_in` (checked against every handler under `src/handlers`), so the
 * whole factory's exposure is real but currently unreachable — the addition
 * changes no entry in `tests/fixtures/legacy-exposure.json`.
 */
export const LEGACY_NO_STRATEGY: Record<string, readonly string[]> = {
  getPackage: [
    'create',
    'read',
    'readMetadata',
    'updateMetadata',
    'delete',
    'validate',
  ],
  getUnitTest: ['run', 'getStatus', 'getResult'],
  getRequest: ['create', 'delete', 'updateMetadata', 'list', 'readMetadata'],
  getUtils: [
    'activateObjectsGroup',
    'getTableContents',
    'getTableColumns',
    'getSqlQuery',
  ],
};

/**
 * Factories `AdtClientLegacy` declares as never available — the no-arg
 * overload throws unconditionally, regardless of any argument a caller
 * passes (a results set does not save it; `getCdsUnitTest(ourUnitTest)`
 * throws exactly like `getCdsUnitTest()`, since the override takes no
 * parameters and JS ignores extras). Read from `AdtClientLegacy.js` directly:
 * every one of these is `throw new Error(unsupportedError(...))`, not an
 * answered failure — the one shape `AdtPackageLegacy`/`AdtRequestLegacy`
 * never take.
 *
 * `getService` is `AdtServiceBinding`'s deprecated alias for
 * `getServiceBinding` and throws the same way; classified as
 * `getServiceBinding` below since it is the same class either name reaches.
 */
export const LEGACY_THROWS = new Set([
  'getCdsUnitTest',
  'getDomain',
  'getDataElement',
  'getStructure',
  'getTable',
  'getTableType',
  'getAccessControl',
  'getServiceDefinition',
  'getServiceBinding',
  'getService',
  'getBehaviorDefinition',
  'getBehaviorImplementation',
  'getMetadataExtension',
  'getEnhancement',
]);

/**
 * The handlers a legacy system can actually reach.
 *
 * **The ledger is meaningless without this filter.** A handful of handlers
 * call the four factories whose `Legacy` class drops the strategy, and most of
 * them are not offered on legacy at all — the package creates, the searches,
 * the transport tools. Recorded unfiltered, the ledger would carry more false
 * entries than real ones and read as a much worse problem than exists.
 *
 * A file with no `available_in` is available everywhere, legacy included. No
 * handler is in that state today; the branch is here because the field is
 * optional by contract, not because something needs it.
 *
 * **Approximation, recorded and not fixed.** This reads `available_in`
 * out of the handler's own file. Forty-one tools declare their availability
 * in a shared table elsewhere rather than in their own `TOOL_DEFINITION`, so
 * for those this function's "no `available_in` found" branch answers
 * "available everywhere" whether or not the shared table actually restricts
 * them — a handler-level fixture is an approximation of a tool-level fact.
 * Left as a known gap rather than papered over with a second data source this
 * function would then have to trust blindly.
 */
export function legacyEnabledHandlers(
  pattern = 'src/handlers/**/handle*.ts',
): string[] {
  const AVAILABLE_IN = /available_in\s*:\s*\[([^\]]*)\]/;
  // Either quote style. The repository writes single quotes today, and a
  // formatter switching them would otherwise empty this list without a word.
  const LEGACY = /['"`]legacy['"`]/;
  return globSync(pattern).filter((file) => {
    const declared = AVAILABLE_IN.exec(readFileSync(file, 'utf8'));
    return declared === null || LEGACY.test(declared[1]);
  });
}

export function legacyExposure(handlers: string[]): string[] {
  const program = ts.createProgram(handlers, compilerOptions());
  const checker = program.getTypeChecker();
  const found = new Set<string>();
  for (const file of handlers) {
    const source = program.getSourceFile(file);
    if (source === undefined) continue;
    for (const call of memberCallsIn(source)) {
      const access = call.expression as ts.PropertyAccessExpression;
      const member = access.name.getText();
      const factory = factoryOf(access.expression, checker);
      if (
        factory !== undefined &&
        LEGACY_NO_STRATEGY[factory]?.includes(member)
      ) {
        found.add(
          `${file.replace('src/handlers/', '')} → ${factory}().${member}`,
        );
      }
    }
  }
  return [...found].sort();
}

/**
 * Which handlers reach a factory `AdtClientLegacy` declares never available —
 * one `throw`, not an answered failure, and not gated by anything this
 * repository's own code checks first.
 *
 * Unlike `legacyExposure`, there is no per-member table here: the factory
 * call itself is what throws, before any member on its result could be
 * reached, so the finding is the factory name, once per handler.
 */
export function legacyThrows(handlers: string[]): string[] {
  const program = ts.createProgram(handlers, compilerOptions());
  const checker = program.getTypeChecker();
  const found = new Set<string>();
  for (const file of handlers) {
    const source = program.getSourceFile(file);
    if (source === undefined) continue;
    for (const call of memberCallsIn(source)) {
      const access = call.expression as ts.PropertyAccessExpression;
      const member = access.name.getText();
      if (!LEGACY_THROWS.has(member)) continue;
      const receiver = classify(access.expression, checker);
      if (receiver === 'AdtClient') {
        found.add(`${file.replace('src/handlers/', '')} → ${member}()`);
      }
    }
  }
  return [...found].sort();
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

/** Alias kept for `legacyExposure`'s call site — `factoryOf` reads better there. */
function factoryOf(
  receiver: ts.Expression,
  checker: ts.TypeChecker,
): string | undefined {
  return classify(receiver, checker);
}
