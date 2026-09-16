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
import { globSync } from 'node:fs';
import { detailWiring } from '../../../scripts/lib/analyseOmissions';
import { handleCheckClass } from '../../handlers/class/low/handleCheckClass';
import { fakeClientOf, okResponse, reading } from '../helpers/fakeClient';

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
 * decided on, task by task, over Tasks 1-27 and closed out here in Task 28
 * with the one tool this audit found missing (`ValidateServiceBinding`: a
 * `project(detail, terseValidation)` reading exactly like every other
 * `Validate*` tool in this list, that had `detail: 'terse'` hardcoded and
 * no `detail` in its schema).
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
  'GetAdtTypes',
  'GetInactiveObjects',
  'GetObjectStructure',
  'GetObjectStructureLow',
  'GetSqlQuery',
  'GetTableContents',
  'GetVirtualFoldersLow',
  'ListTransports',
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

it.each([
  // The absence hides three ways: no `detail` property at all, a context
  // assembled in a variable this walk cannot see into, and the shorthand
  // `{ detail }` bound to something other than `detailOf(args)` — the exact
  // form the entire already-migrated corpus writes, so the hidden defect
  // here is what the shared `const` holds, not the shorthand itself.
  'declares-passes-none',
  'declares-indirect-context',
  'declares-shorthand',
  // The emptiest case, and the last one a loop-based check can miss: no
  // `answer()` in the file, so there is nothing to iterate and nothing to
  // report — indistinguishable from correct.
  'declares-no-answer-call',
])('reports %s rather than skipping it', (fixture) => {
  expect(
    detailWiring([`src/__tests__/fixtures/detail/${fixture}.ts`]),
  ).toHaveLength(1);
});

/**
 * The one already-reviewed, deliberate exception `detailWiring` finds in the
 * real corpus.
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
 * a false positive from a checker that (correctly, for every one of the
 * other 325 handler files) assumes one call site per tool.
 */
const DETAIL_WIRING_EXCEPTIONS: ReadonlyArray<{
  file: string;
  reason: string;
}> = [
  {
    file: 'src/handlers/common/low/handleActivateObject.ts',
    reason:
      'the group-activation fallback: no AdtReading behind activateObjectsGroup, ' +
      "so this second answer() call in the same handler hardcodes detail: 'terse' " +
      "on purpose, documented on both the module and the tool's own detail description.",
  },
];

it('wires detail the way each tool schema claims', () => {
  // The test above says the parameter is offered. This one says it is read.
  // A handler can declare `detail` and keep `detail: 'terse'` hardcoded in
  // its `answer()` call — satisfying the schema test while ignoring the
  // parameter — and a behavioural test on one handler would never notice
  // for the other hundred.
  const offenders = detailWiring(handlers);

  const isExcused = (offender: string): boolean =>
    DETAIL_WIRING_EXCEPTIONS.some((exc) => offender.startsWith(`${exc.file}:`));

  expect(offenders.filter((o) => !isExcused(o))).toEqual([]);

  // A named exception that no longer matches anything real is a stale entry
  // hiding nothing — each one must still be a live offender, the same
  // liveness `handlerInvariants.test.ts` holds `ANALYSE_EXCEPTIONS` to.
  for (const exc of DETAIL_WIRING_EXCEPTIONS) {
    expect(offenders.some((o) => o.startsWith(`${exc.file}:`))).toBe(true);
  }
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
