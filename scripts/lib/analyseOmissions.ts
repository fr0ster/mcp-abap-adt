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
 * contract does not parameterise.
 *
 * A handler reaches a member through `client.getPackage().readMetadata(...)`,
 * so the factory name is the property access one level in. That factory decides
 * which class serves the call on a legacy system, and only four of the ten
 * overridden classes drop the strategy — seventeen members across them,
 * measured against the shipped `.js`, not the `.d.ts`:
 *
 * - `AdtPackageLegacy.js`: all six members ignore every argument and always
 *   answer `failed(UNSUPPORTED)` — `create`, `read`, `readMetadata`,
 *   `validate`, `updateMetadata`, `delete` are declared with an EMPTY
 *   parameter list, so whatever a caller passes, including an `analyse`, is
 *   discarded before it is ever bound to a name.
 * - `AdtUnitTestLegacy.js`: `run(tests, options)` binds `options` but the wire
 *   call underneath is `startClassUnitTestRunLegacy(connection, tests,
 *   _options)` — the parameter is renamed with a leading underscore and never
 *   read. It also calls `answering(runFn, () => LEGACY_SYNC_RUN_ID)` with only
 *   two arguments, dropping the shipped `startedRun` analyse modern `run` adds
 *   as its third. `getStatus()` and `getResult()` are declared and called with
 *   NO parameters at all — not even the run id modern's `getResult(runId,
 *   options)` takes — and simply replay whatever `run()` already captured.
 * - `AdtRequestLegacy.js`: `readMetadata(config, options)` and `list(options)`
 *   both bind `options` and never read it (`list` reads only
 *   `options?.configUri`); `create`, `updateMetadata` and `delete` take no
 *   parameters and always answer a hardcoded refusal, the same shape as
 *   `AdtPackageLegacy`.
 * - `AdtUtilsLegacy.js`: `activateObjectsGroup(objects, preauditRequested)`
 *   has no third parameter at all, where modern's declares none either but
 *   the call site (`answering(request, this.results.activation)`) is the same
 *   two-argument shape that drops any caller-supplied `analyse` for the whole
 *   family; `getTableColumns`, `getTableContents` and `getSqlQuery` all take
 *   their single positional argument renamed with a leading underscore and
 *   answer a hardcoded connection failure instead of making the call.
 *
 * **`getRequest.readMetadata` is in this list although no shipped ledger entry
 * for it exists yet.** The four-factory table drafted for this task omitted
 * it — 6 + 3 + 3 + 4 counts sixteen, one short of the seventeen this task's own
 * brief states — and the `.js` above shows it drops `options` exactly like
 * `list` does, on the same class, in the same file. Restored rather than left
 * at sixteen. It changes nothing in the ledger below: no handler this
 * repository ships reaches `getRequest()` on a system declaring `'legacy'` in
 * `available_in` (checked against every handler under `src/handlers`, not only
 * the twenty-three named for this task), so the member is real and unreachable
 * at once.
 */
const LEGACY_NO_STRATEGY: Record<string, readonly string[]> = {
  getPackage: [
    'create',
    'read',
    'readMetadata',
    'updateMetadata',
    'delete',
    'validate',
  ],
  getUnitTest: ['run', 'getStatus', 'getResult'],
  getRequest: ['delete', 'updateMetadata', 'list', 'readMetadata'],
  getUtils: [
    'activateObjectsGroup',
    'getTableContents',
    'getTableColumns',
    'getSqlQuery',
  ],
};

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
 * Which factory produced this receiver?
 *
 * **Both forms, because handlers use both.** Most call sites are the direct
 * chain `client.getPackage().read(...)`; others hold the object in a local
 * first — `const utils = client.getUtils(); utils.getSqlQuery(...)` — and
 * `handleGetPackageContents` is one of them, which is to say one of the
 * twenty-three this ledger exists for. A walk that recognised only the chain
 * would miss the majority of what it is meant to record, and would do it
 * quietly: a shorter ledger reads like progress.
 *
 * Only a `const` is followed, for the reason `carriesAnalyse` follows only a
 * `const`: a rebound `let` no longer describes what the initializer says.
 */
function factoryOf(
  receiver: ts.Expression,
  checker: ts.TypeChecker,
): string | undefined {
  if (
    ts.isCallExpression(receiver) &&
    ts.isPropertyAccessExpression(receiver.expression)
  ) {
    return receiver.expression.name.getText();
  }
  if (ts.isIdentifier(receiver)) {
    const declaration =
      checker.getSymbolAtLocation(receiver)?.declarations?.[0];
    if (
      declaration !== undefined &&
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer !== undefined &&
      isConstBinding(declaration)
    ) {
      return factoryOf(declaration.initializer, checker);
    }
  }
  // Everything that wraps an expression without changing which factory made
  // it. `as any` is the one that matters: several handlers write
  // `const unitTest = client.getUnitTest() as any`, three of them among the
  // twenty-three this ledger is for, and an assertion is invisible to a walk
  // that only knows about calls and identifiers.
  if (
    ts.isAwaitExpression(receiver) ||
    ts.isParenthesizedExpression(receiver) ||
    ts.isAsExpression(receiver) ||
    ts.isTypeAssertionExpression(receiver) ||
    ts.isNonNullExpression(receiver) ||
    ts.isSatisfiesExpression(receiver)
  ) {
    return factoryOf(receiver.expression, checker);
  }
  return undefined;
}
