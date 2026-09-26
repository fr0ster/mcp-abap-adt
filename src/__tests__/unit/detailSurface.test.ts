/**
 * Task 28: the audit of `detail` itself.
 *
 * `detail` is the one addition the adt-clients 19 migration may make to the
 * tool surface, and only on a tool whose answer is JSON built from a parsed
 * `AdtReading` — never on a tool that hands a document through whole (the
 * document IS the raw and the parse, so the three levels are the same
 * bytes) and never on a composite this repository assembles from several
 * calls with no reading behind it at all (the two runtime-profiling tools;
 * `IAdtResult<T>` there is `{ value }`, nothing to project three ways).
 *
 * **A fourth shape, found in fix round 1, that the brief's three rows do
 * not name: the delegating wrapper.** A tool whose own handler never calls
 * `answer()` at all — it calls ANOTHER handler's function and returns
 * whatever that answers — can still have a real, `detail`-bearing
 * `AdtReading` behind it, reached through the handler it delegates to,
 * without ever forwarding a `detail` argument of its own. The Check*-high
 * wrappers (`normalizeCheckResponse` over their `Check*Low` sibling) and
 * two `compact/` facades (`HandlerCheckRun`, `HandlerValidate`, each
 * delegating to a `common/low` handler whose own answer is real and
 * `detail`-bearing) are this shape. `detailWiring` reports nothing for any
 * of them — they call no `answer()` of their own to check — so they are
 * not ledger exceptions the way `ActivateObjectLow`'s second call site is;
 * each is instead documented, in its own file, for why the reduced surface
 * it offers deliberately excludes `detail` (the same reduction it already
 * makes for other low-level knobs like `session_id`/`session_state`).
 *
 * **A fifth shape, found in fix round 2: the node-level family.** A real
 * ADT wire document is fetched here too, but the STRATEGY it goes through
 * — `nodeLevel` (`lib/strategies/packageWalk.ts`), the reading every one of
 * these tools shares — parses `answer.data` and returns only the reduced
 * `NodeLevel` it builds, never keeping the wire text beside it. There is no
 * `.raw` for `detail: 'raw'` to answer without changing `nodeLevel` itself
 * to carry one, which none of these tools does on its own. Unlike the
 * runtime-profiling tools (row three: no reading at all) a reading
 * genuinely runs here; unlike the delegating wrapper (a real `AdtReading`
 * reachable, just not forwarded) there is no `AdtReading` to reach — only
 * the strategy's own already-reduced answer. `GetNodeStructureLow`
 * (`system/low/handleGetNodeStructure.ts`), `GetObjectsList`,
 * `GetObjectsByType` (`search/readonly/`) and `GetObjectInfo`
 * (`system/readonly/`) are this shape, each documented at its own
 * `answer()` call for why `(value) => value`/the tool's own composite is
 * the whole answer, not a placeholder for a `detail` this task owes it.
 *
 * Three things have to agree, and each gets its own test below:
 *
 *  1. **The schema.** `JSON_ANSWERING` names every tool whose surface
 *     declares `detail`, written out as data so a reviewer sees the list
 *     rather than trusting a rule applied silently.
 *  2. **The wiring.** A tool that declares `detail` must actually read
 *     `detailOf(args)` and pass it to `answer()`; a tool that does not must
 *     pass a literal. `detailWiring` (`scripts/lib/analyseOmissions.ts`)
 *     proves this from the AST — a schema and a behaviour are two separate
 *     claims, and a count of how many tools carry `detail` cannot tell them
 *     apart (the wrong tools could sum to the right number).
 *  3. **The projection.** Passing `detail` through is necessary but not
 *     sufficient — the one worked example at the bottom proves `raw` and
 *     `terse` actually answer different bytes for a real handler, which
 *     `detailWiring` (a wiring check, not a behavioural one) cannot see.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import {
  detailWiring,
  toolNameOf,
} from '../../../scripts/lib/analyseOmissions';
import { handleCheckClass } from '../../handlers/class/low/handleCheckClass';
import { fakeClientOf, okResponse, reading } from '../helpers/fakeClient';
import { globSync, spawnOptionsForNpx } from '../helpers/platform';

const handlers = globSync('src/handlers/**/handle*.ts');

// Hoisted above the imports above by babel-plugin-jest-hoist, matching every
// other file in this directory that swaps the real client for a fake one
// (`lowTierStrategies.test.ts`, `staticSequences.test.ts`) — written inside a
// `describe` block this registers too late: `handleCheckClass`'s own static
// import of `createAdtClient` above has already linked the real module by
// the time a nested `jest.mock` call would run.
let fakeClient: unknown;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

/**
 * Every tool whose `inputSchema` declares `detail` — the list this migration
 * decided on, task by task, over Tasks 1-27 and closed out here in Task 28.
 *
 * Task 28 fix round 1 added seven tools this audit's first pass missed,
 * found by redoing the enumeration from every `answer()` call's own
 * projection instead of only calls to the shared `project()` helper (the
 * first pass's method, which by construction cannot see a hand-written
 * projection that reads a real `AdtReading` without going through that
 * helper):
 *
 *  - `ValidateServiceBinding` — `project(detail, terseValidation)` over a
 *    genuine parse, exactly like every other `Validate*` tool in this list,
 *    but shipped with `detail: 'terse'` hardcoded and no `detail` in its
 *    schema (the first pass's one finding).
 *  - `GetUnitTestStatus`/`GetCdsUnitTestStatus` — a hand-typed
 *    `(status: AdtReading<unknown>) => ...` projection, the brief's own
 *    second row (a `structured` slot, a real parse), always answering the
 *    whole parse regardless of any `detail`.
 *  - `GetUnitTest`/`GetUnitTestResult`/`GetCdsUnitTest`/
 *    `GetCdsUnitTestResult` — each answers through `pollUntilFinished`'s
 *    `RunOutcome`, whose `status` and (once finished) `result` are BOTH
 *    `structured` `AdtReading`s in their own right; "no single reading
 *    behind a composite" does not excuse these the way it does the two
 *    runtime-profiling tools, because a reading genuinely is behind each of
 *    the two fields this answer combines.
 *
 * A decision belongs where a reviewer can see it — this array, not a rule
 * applied silently at test time — so the surface test below compares
 * against DATA, and a change to it is a change a reviewer has to approve.
 */
const JSON_ANSWERING: readonly string[] = [
  'ActivateBehaviorDefinition',
  'ActivateBehaviorDefinitionLow',
  'ActivateClass',
  'ActivateClassLow',
  'ActivateClassTestClassesLow',
  'ActivateDataElement',
  'ActivateDataElementLow',
  'ActivateDdl',
  'ActivateDdlLow',
  'ActivateDomain',
  'ActivateDomainLow',
  'ActivateFunctionGroup',
  'ActivateFunctionGroupLow',
  'ActivateFunctionModule',
  'ActivateFunctionModuleLow',
  'ActivateInterface',
  'ActivateInterfaceLow',
  'ActivateMetadataExtension',
  'ActivateMetadataExtensionLow',
  'ActivateObjectLow',
  'ActivateProgram',
  'ActivateProgramLow',
  'ActivateServiceBinding',
  'ActivateServiceBindingLow',
  'ActivateServiceDefinition',
  'ActivateServiceDefinitionLow',
  'ActivateStructure',
  'ActivateStructureLow',
  'ActivateTable',
  'ActivateTableLow',
  'AddTransportObject',
  'CheckBdefLow',
  'CheckClassLow',
  'CheckDataElementLow',
  'CheckDdlLow',
  'CheckDomainLow',
  'CheckFunctionGroupLow',
  'CheckFunctionModuleLow',
  'CheckInterfaceLow',
  'CheckMetadataExtensionLow',
  'CheckPackageLow',
  'CheckProgramLow',
  'CheckStructureLow',
  'CheckTableLow',
  'CreateBehaviorDefinition',
  'CreateBehaviorDefinitionLow',
  'CreateBehaviorImplementation',
  'CreateBehaviorImplementationLow',
  'CreateCdsUnitTest',
  'CreateClass',
  'CreateClassLow',
  'CreateDataElement',
  'CreateDataElementLow',
  'CreateDdl',
  'CreateDdlLow',
  'CreateDomain',
  'CreateDomainLow',
  'CreateFunctionGroup',
  'CreateFunctionGroupLow',
  'CreateFunctionInclude',
  'CreateFunctionModule',
  'CreateFunctionModuleLow',
  'CreateInterface',
  'CreateInterfaceLow',
  'CreateMessageClass',
  'CreateMetadataExtension',
  'CreateMetadataExtensionLow',
  'CreatePackage',
  'CreatePackageLow',
  'CreateProgram',
  'CreateProgramLow',
  'CreateServiceBinding',
  'CreateServiceDefinition',
  'CreateStructure',
  'CreateStructureLow',
  'CreateTable',
  'CreateTableLow',
  'CreateTransport',
  'CreateTransportLow',
  'CreateTransportTask',
  'DeleteBehaviorDefinition',
  'DeleteBehaviorDefinitionLow',
  'DeleteBehaviorImplementation',
  'DeleteCdsUnitTest',
  'DeleteClass',
  'DeleteClassLow',
  'DeleteDataElement',
  'DeleteDataElementLow',
  'DeleteDdl',
  'DeleteDdlLow',
  'DeleteDomain',
  'DeleteDomainLow',
  'DeleteFunctionGroup',
  'DeleteFunctionGroupLow',
  'DeleteFunctionInclude',
  'DeleteFunctionModule',
  'DeleteFunctionModuleLow',
  'DeleteInterface',
  'DeleteInterfaceLow',
  'DeleteLocalDefinitions',
  'DeleteLocalMacros',
  'DeleteLocalTestClass',
  'DeleteLocalTypes',
  'DeleteMessageClass',
  'DeleteMetadataExtension',
  'DeleteMetadataExtensionLow',
  'DeletePackageLow',
  'DeleteProgram',
  'DeleteProgramLow',
  'DeleteServiceBinding',
  'DeleteServiceDefinition',
  'DeleteStructure',
  'DeleteStructureLow',
  'DeleteTable',
  'DeleteTableLow',
  // The ATC worklist: `getFindings()` answers the document, this repository
  // reads it into findings, and `raw` is where the document itself is still
  // available. `RunATC` and `GetATCRunStatus` are deliberately absent — the
  // first composes its answer from three calls with no document behind it,
  // the second answers the four fields the client parses out of the run
  // resource, so neither has three levels to offer.
  'GetATCFindings',
  'GetAdtTypes',
  'GetCdsUnitTest',
  'GetCdsUnitTestResult',
  'GetCdsUnitTestStatus',
  'GetInactiveObjects',
  'GetObjectStructure',
  'GetObjectStructureLow',
  'GetSqlQuery',
  'GetTableContents',
  'GetUnitTest',
  'GetUnitTestResult',
  'GetUnitTestStatus',
  'GetVirtualFoldersLow',
  'ListTransports',
  'ReadTransportActionLog',
  'ReadTransportObjects',
  'RemoveTransportObject',
  'SearchObject',
  'UpdateBehaviorDefinition',
  'UpdateBehaviorDefinitionLow',
  'UpdateBehaviorImplementation',
  'UpdateCdsUnitTest',
  'UpdateClass',
  'UpdateClassLow',
  'UpdateClassTestClassesLow',
  'UpdateDataElement',
  'UpdateDdl',
  'UpdateDdlLow',
  'UpdateDomain',
  'UpdateFunctionGroup',
  'UpdateFunctionInclude',
  'UpdateFunctionModule',
  'UpdateFunctionModuleLow',
  'UpdateInterface',
  'UpdateInterfaceLow',
  'UpdateLocalDefinitions',
  'UpdateLocalMacros',
  'UpdateLocalTestClass',
  'UpdateLocalTypes',
  'UpdateMessageClass',
  'UpdateMetadataExtension',
  'UpdateMetadataExtensionLow',
  'UpdateProgram',
  'UpdateProgramLow',
  'UpdateServiceBinding',
  'UpdateServiceDefinition',
  'UpdateStructure',
  'UpdateStructureLow',
  'UpdateTable',
  'UpdateTableLow',
  'ValidateBehaviorDefinitionLow',
  'ValidateBehaviorImplementationLow',
  'ValidateClassLow',
  'ValidateDataElementLow',
  'ValidateDdlLow',
  'ValidateDomainLow',
  'ValidateFunctionGroupLow',
  'ValidateFunctionModuleLow',
  'ValidateInterfaceLow',
  'ValidateMetadataExtensionLow',
  'ValidatePackageLow',
  'ValidateProgramLow',
  'ValidateServiceBinding',
  'ValidateStructureLow',
  'ValidateTableLow',
];

/** The same flat `{ group, name, inputs }` rows Task 1 pins. */
const surface: Array<{ group: string; name: string; inputs: string }> =
  JSON.parse(
    execFileSync('npx', ['tsx', 'scripts/list-tools.ts'], {
      ...spawnOptionsForNpx,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    }),
  );

/** Every tool whose input schema declares the parameter. */
const toolsDeclaring = (param: string): string[] =>
  surface
    .filter((t) =>
      (t.inputs === '(none)' ? [] : t.inputs.split(', ')).includes(param),
    )
    .map((t) => t.name);

it('declares detail on every JSON-answering tool and on no other', () => {
  expect(toolsDeclaring('detail').sort()).toEqual([...JSON_ANSWERING].sort());
});

/**
 * Five files under `src/handlers/common/low/` export a working
 * `TOOL_DEFINITION` and handler that `LowLevelHandlersGroup.ts` never
 * registers (its imports and the entries themselves are commented out) —
 * `CheckObjectLow`, `DeleteObjectLow`, `ValidateObjectLow`, `LockObjectLow`,
 * `UnlockObjectLow`. Four of the five are reached in production anyway: the
 * `compact` facades call the underlying `handle*` FUNCTION directly,
 * bypassing the dead `TOOL_DEFINITION` — `HandlerCheckRun` calls
 * `handleCheckObject`, `HandlerValidate` calls `handleValidateObject`,
 * `HandlerLock` calls `handleLockObject`, `HandlerUnlock` calls
 * `handleUnlockObject` (verified by reading each compact handler's own
 * import, not assumed from the name). Only `handleDeleteObject` has no live
 * caller anywhere in this tree.
 *
 * None of the five is a REGISTERED tool — `surface` (this file's own load of
 * `scripts/list-tools.ts`) never lists any of them — so none belongs in this
 * audit: `detail` is a claim about the tool SURFACE, and a file the surface
 * never exposes makes no such claim regardless of what its own schema or
 * handler body happen to do internally. Left unfiltered, `detailWiring`
 * would report all four live-but-unregistered ones as offenders — their
 * `TOOL_DEFINITION.name` resolves to a tool `declaresDetail` (built from
 * `surface`, below) has never heard of, while their handler bodies
 * genuinely do read `detailOf(args)` — a real disagreement between "this
 * name is not a registered tool" and "this file behaves like a wired one",
 * but not the disagreement this test exists to catch.
 *
 * **Resolved from the syntax tree, via `toolNameOf` — the same function
 * `detailWiring` uses internally — not a regex.** Fix round 2 proved why:
 * a regex over the whole file text taking "the first quoted `name:` in the
 * file" is fooled by an unrelated object carrying its own `name` property
 * sitting above the real `TOOL_DEFINITION` — a file could then drop out of
 * this filter (misread as some other, unregistered "tool") while a real,
 * hardcoded-projection defect inside it went unaudited. `toolNameOf` reads
 * the `TOOL_DEFINITION` declaration specifically, immune to what sits above
 * it.
 */
const registeredToolNames = new Set(surface.map((t) => t.name));
const registeredHandlers = handlers.filter((file) => {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const name = toolNameOf(source);
  return name !== undefined && registeredToolNames.has(name);
});

/** The tool names the registered surface actually declares `detail` for. */
const declaresDetail = new Set(toolsDeclaring('detail'));

it('resolves the tool name past a decoy name property above TOOL_DEFINITION', () => {
  const file =
    'src/__tests__/fixtures/detail/decoy-name-above-tool-definition.ts';
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  // "First quoted name: in the file" would answer 'NotTheToolName' — the
  // decoy object's own property, textually first. The real tool name,
  // `TOOL_DEFINITION`'s, comes second in the file.
  expect(toolNameOf(source)).toBe('DecoyFixtureTool');
});

it.each([
  // The absence hides six ways: no `detail` property at all, a context
  // assembled in a variable this walk cannot see into, the shorthand
  // `{ detail }` bound to something other than `detailOf(args)` (the exact
  // form the entire already-migrated corpus writes, so the hidden defect is
  // what the shared `const` holds, not the shorthand itself), a projection
  // that ignores a correctly-wired context (passed inline, or bound to a
  // `const` and handed over by name — fix round 2's finding, live today in
  // five handlers that happen not to declare `detail`), and no `answer()`
  // at all.
  ['declares-passes-none', ['FixtureDeclaresPassesNone']],
  ['declares-indirect-context', ['FixtureIndirectContext']],
  ['declares-shorthand', ['FixtureShorthand']],
  ['declares-hardcoded-projection', ['FixtureHardcodedProjection']],
  ['declares-aliased-projection', ['FixtureAliasedProjection']],
  // The emptiest case, and the last one a loop-based check can miss: no
  // `answer()` in the file, so there is nothing to iterate and nothing to
  // report — indistinguishable from correct.
  ['declares-no-answer-call', ['FixtureDeclaresNoAnswerCall']],
] as const)('reports %s rather than skipping it', (fixture, declaring) => {
  expect(
    detailWiring(
      [`src/__tests__/fixtures/detail/${fixture}.ts`],
      new Set(declaring),
    ),
  ).toHaveLength(1);
});

/**
 * The one already-reviewed, deliberate exception `detailWiring` finds in the
 * real, registered corpus.
 *
 * `ActivateObjectLow` genuinely straddles two of the three rows the brief
 * names: for a single object of a type this dispatcher maps to a family
 * (the common case), it calls that family's own `activate()` — a real
 * reading, honouring `detail` through `project(detail, terseActivation)`.
 * For everything else (more than one object, or a type it cannot map) it
 * falls back to `activateObjectsGroup`, which answers a bare run id with no
 * document behind it at all — row three, the same "no reading, no detail"
 * case the two runtime-profiling tools are. One handler, one tool, two
 * genuinely different answers depending on which branch runs; the schema's
 * own `detail` description says so ("Ignored on the group-activation
 * fallback ... there is nothing for 'full' or 'raw' to add"). `detailWiring`
 * checks per `answer()` call site, not per tool, so this second, honest
 * `detail: 'terse'` reads as a mismatch against the tool's `declares: true` —
 * a false positive from a checker that (correctly, for every other
 * registered handler file) assumes one call site per tool.
 *
 * **Keyed on file AND line, not file alone.** A ledger that excuses a whole
 * FILE excuses whatever offender happens to live there — including the
 * HONOURING call site (line 277's `project(detail, terseActivation)`) if a
 * regression ever broke it too. Fix round 1 proved this live: hardcoding
 * that line as well produced two offenders, a file-only ledger swallowed
 * both, and the suite stayed green. Keying on the exact line, and asserting
 * below that the excused set is EXACTLY this one entry — not "at least
 * this many", not "some offender from this file" — closes that hole: a
 * second offender at any other line, in this file or a new one, is not
 * excused by matching the filename.
 */
const DETAIL_WIRING_EXCEPTIONS: ReadonlyArray<{
  file: string;
  line: number;
  reason: string;
}> = [
  {
    file: 'src/handlers/common/low/handleActivateObject.ts',
    line: 321,
    reason:
      'the group-activation fallback: no AdtReading behind activateObjectsGroup, ' +
      "so this second answer() call in the same handler hardcodes detail: 'terse' " +
      "on purpose, documented on both the module and the tool's own detail description.",
  },
];

it('wires detail the way each tool schema claims', () => {
  // The test above says the parameter is offered. This one says it is read
  // — in BOTH places a handler can carry it: the answer() context, and its
  // projection, the third argument. A handler can declare `detail`, read it
  // correctly into the context, and still hand answer() a projection that
  // ignores it — satisfying a context-only check while the parameter does
  // nothing. `registeredHandlers`, not `handlers`: see the comment above
  // `registeredHandlers` for why the five unregistered common/low files are
  // out of scope for this specific audit.
  const offenders = detailWiring(registeredHandlers, declaresDetail);

  const excusedBy = (exc: (typeof DETAIL_WIRING_EXCEPTIONS)[number]) =>
    offenders.find((o) => o.startsWith(`${exc.file}:${exc.line} —`));

  // Every exception must match a real, CURRENT offender at its exact line —
  // a stale entry (nothing left to excuse) is a ledger that has drifted
  // from the code it describes, the same liveness
  // `handlerInvariants.test.ts` holds `ANALYSE_EXCEPTIONS` to.
  const excused = DETAIL_WIRING_EXCEPTIONS.map((exc) => {
    const match = excusedBy(exc);
    expect(match).toBeDefined();
    return match as string;
  });

  // The excused SET, not "at least these" — a file-keyed ledger that only
  // required `.some(...)` is exactly what let a second, real offender in
  // the same file hide behind the one legitimate exception. Removing
  // precisely the matched lines and nothing else is what proves this
  // ledger cannot swallow a neighbour.
  const excusedSet = new Set(excused);
  expect(excusedSet.size).toBe(DETAIL_WIRING_EXCEPTIONS.length);
  const remaining = offenders.filter((o) => !excusedSet.has(o));
  expect(remaining).toEqual([]);
});

// One worked example beside the invariant, since `detailWiring` proves the
// argument is wired and not that the projection honours it.
//
// `detail` is a claim about SUCCESSES only — a failure carries raw_body at
// every level, and answerFailure.test.ts is where that is held.
describe('a JSON-answering tool actually varies with detail', () => {
  const context = {
    connection: { getSessionId: () => null } as any,
    logger: undefined,
  };

  it('answers raw as the document and terse as the summary', async () => {
    const checkDocument =
      '<?xml version="1.0" encoding="utf-8"?><chkrun:checkRunReports/>';
    const value = {
      'chkrun:checkRunReports': {
        'chkrun:checkReport': {
          '@': {
            'chkrun:status': 'processed',
            'chkrun:statusText': 'Check ran without errors',
          },
        },
      },
    };
    fakeClient = fakeClientOf({
      check: async () => okResponse(reading(value, checkDocument, 200)),
    });

    const terse: any = await handleCheckClass(context as any, {
      class_name: 'ZCL_X',
    });
    const raw: any = await handleCheckClass(context as any, {
      class_name: 'ZCL_X',
      detail: 'raw',
    });
    expect(raw.content[0].text).toContain('<?xml');
    expect(terse.content[0].text).not.toContain('<?xml');
  });
});
