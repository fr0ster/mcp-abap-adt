/**
 * Writing test classes into the include that holds them, for a tool: lock the
 * object that owns the include, write, unlock, activate — one call.
 *
 * Three owners, three includes:
 * - a class's `testclasses` include, under the class's lock
 *   (`getLocalTestClass()`);
 * - a report's test include, a standalone `PROG/I` under its own lock
 *   (`getInclude()`);
 * - a function group's test include, under its own lock
 *   (`getFunctionInclude()`).
 *
 * The include's name is derived, never asked for: a report's is
 * `<report>_T99`, a function group's `L<group>T99`.
 */

import {
  classDocuments,
  functionIncludeDocuments,
  includeDocuments,
  programDocuments,
} from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import {
  type AdtHeadersContext,
  withAdtHeaders,
} from '../../../lib/adtHeaders/withAdtHeaders';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type ActivationRunSource,
  awaitActivationRun,
  isRefusal,
} from '../../../lib/strategies/activationRun';
import { analyseLock } from '../../../lib/strategies/lockAnswer';
import type { AdtReading } from '../../../lib/strategies/reading';
import { ourUtils, resultsFor } from '../../../lib/strategies/resultSets';
import {
  failedWith,
  sequence,
  succeededWith,
} from '../../../lib/strategies/sequence';
import { atStep } from '../../../lib/strategies/step';
import { carryCleanup, withLock } from '../../../lib/strategies/withLock';

type Answer = IAdtResponse<AdtReading<unknown>, IAdtError>;

export function programTestInclude(programName: string): string {
  return `${programName.toUpperCase()}_T99`;
}

/**
 * A function group's includes are named after its main program, `SAPL<group>`,
 * with `SAPL` shortened to `L` — and a namespace stays in front: the group
 * `/NS/GROUP` has the main program `/NS/SAPLGROUP` and the includes
 * `/NS/LGROUP…`.
 */
export function functionGroupTestInclude(functionGroupName: string): string {
  const name = functionGroupName.toUpperCase();
  const namespaced = /^(\/[^/]+\/)(.+)$/.exec(name);
  return namespaced ? `${namespaced[1]}L${namespaced[2]}T99` : `L${name}T99`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Write (or, with an empty source, clear) a class's test classes, and activate. */
export async function writeClassTests(
  context: HandlerContext,
  className: string,
  source: string,
  transportRequest?: string,
): Promise<Answer> {
  const name = className.toUpperCase();
  const tests = createAdtClient(
    context.connection,
    context.logger,
  ).getLocalTestClass(resultsFor(classDocuments));
  const written = await withLock(
    () => tests.lock({ className: name }, { analyse: analyseLock }),
    atStep('update', (lockHandle) =>
      withAdtHeaders(context, 'localTestClass.update', (headers) =>
        tests.update(
          { className: name, transportRequest },
          { headers, source, lockHandle, analyse: analyseException },
        ),
      ),
    ),
    (lockHandle) =>
      tests.unlock({ className: name }, lockHandle, {
        analyse: analyseException,
      }),
  );
  if (!written.ok) return written as Answer;
  return carryCleanup(
    written,
    atStep('activate', () =>
      withAdtHeaders(context, 'localTestClass.activate', (headers) =>
        tests.activate(
          { className: name },
          { headers, analyse: analyseActivation },
        ),
      ),
    ),
  ) as Promise<Answer>;
}

/** Where a new include goes: the report's own package, read off its metadata. */
function packageOf(metadata: string): string | undefined {
  return /adtcore:packageRef[^>]*adtcore:name="([^"]+)"/.exec(metadata)?.[1];
}

/**
 * Write a report's test classes into its test include and activate both.
 *
 * With `create`, the include is created first — in the report's package — and
 * the report gains an `INCLUDE` of it unless its source already has one. ADT
 * adds nothing to a report on its own (it does for a function group).
 */
export async function writeProgramTests(
  context: HandlerContext,
  programName: string,
  source: string,
  options: { create: boolean; transportRequest?: string },
): Promise<Answer> {
  const client = createAdtClient(context.connection, context.logger);
  const program = client.getProgram(resultsFor(programDocuments));
  const include = client.getInclude(resultsFor(includeDocuments));
  const name = programName.toUpperCase();
  const includeName = programTestInclude(name);
  const transportRequest = options.transportRequest;

  if (options.create) {
    const metadata = await atStep('read program metadata', () =>
      program.readMetadata(
        { programName: name },
        { analyse: analyseException },
      ),
    )();
    if (!metadata.ok) return metadata as unknown as Answer;
    const created = await atStep('create include', () =>
      withAdtHeaders(context, 'include.create', (headers) =>
        include.create(
          {
            includeName,
            packageName: packageOf(metadata.getResult().value.raw),
            description: `ABAP Unit tests of ${name}`,
            transportRequest,
          },
          { headers, analyse: analyseException },
        ),
      ),
    )();
    if (!created.ok) return created as unknown as Answer;
  }

  const written = await withLock(
    () => include.lock({ includeName }, { analyse: analyseLock }),
    atStep('update', (lockHandle) =>
      withAdtHeaders(context, 'include.update', (headers) =>
        include.update(
          { includeName, transportRequest },
          { headers, source, lockHandle, analyse: analyseException },
        ),
      ),
    ),
    (lockHandle) =>
      include.unlock({ includeName }, lockHandle, {
        analyse: analyseException,
      }),
  );
  if (!written.ok) return written as Answer;

  // Activate the include, then the report — as one step after the write, so a
  // lock the write could not release still reaches the caller.
  const activateBoth = () =>
    sequence(
      atStep('activate include', () =>
        withAdtHeaders(context, 'include.activate', (headers) =>
          include.activate(
            { includeName },
            { headers, analyse: analyseActivation },
          ),
        ),
      ),
      atStep('activate program', () =>
        withAdtHeaders(context, 'program.activate', (headers) =>
          program.activate(
            { programName: name },
            { headers, analyse: analyseActivation },
          ),
        ),
      ),
    ) as Promise<Answer>;

  return carryCleanup(written, async (): Promise<Answer> => {
    if (!options.create) return activateBoth();
    // Read and write the report under one lock: a source read before the lock
    // and written after it would overwrite whatever was saved in between.
    const pulledIn = new RegExp(
      `^\\s*INCLUDE\\s+${escapeRegExp(includeName)}\\s*\\.`,
      'im',
    );
    const linked = await withLock(
      () => program.lock({ programName: name }, { analyse: analyseLock }),
      async (lockHandle): Promise<Answer> => {
        const current = await atStep('read program', () =>
          program.read({ programName: name }, 'inactive', {
            analyse: analyseException,
          }),
        )();
        if (!current.ok) return current as unknown as Answer;
        const reportSource = current.getResult().value.raw;
        if (pulledIn.test(reportSource)) {
          return current as unknown as Answer;
        }
        return atStep('update program', () =>
          withAdtHeaders(context, 'program.update', (headers) =>
            program.update(
              { programName: name, transportRequest },
              {
                headers,
                source: `${reportSource.replace(/\s*$/, '')}\n\nINCLUDE ${includeName.toLowerCase()}.\n`,
                lockHandle,
                analyse: analyseException,
              },
            ),
          ),
        )() as Promise<Answer>;
      },
      (lockHandle) =>
        program.unlock({ programName: name }, lockHandle, {
          analyse: analyseException,
        }),
    );
    if (!linked.ok) return linked as Answer;
    return carryCleanup(linked, activateBoth);
  });
}

/**
 * Write a function group's test classes into its test include and activate
 * the include, the group and its main program together. With `create`, the
 * include is created first;
 * ADT adds its `INCLUDE` to the group's main program by itself.
 */
export async function writeFunctionGroupTests(
  context: HandlerContext,
  functionGroupName: string,
  source: string,
  options: { create: boolean; transportRequest?: string },
): Promise<Answer> {
  const client = createAdtClient(context.connection, context.logger);
  const include = client.getFunctionInclude(
    resultsFor(functionIncludeDocuments),
  );
  const groupName = functionGroupName.toUpperCase();
  const includeName = functionGroupTestInclude(groupName);
  const target = { functionGroupName: groupName, includeName };
  const transportRequest = options.transportRequest;

  if (options.create) {
    const created = await atStep('create include', () =>
      withAdtHeaders(context, 'functionInclude.create', (headers) =>
        include.create(
          {
            ...target,
            description: `ABAP Unit tests of ${groupName}`,
            transportRequest,
          },
          { headers, analyse: analyseException },
        ),
      ),
    )();
    if (!created.ok) return created as unknown as Answer;
  }

  const written = await withLock(
    () => include.lock(target, { analyse: analyseLock }),
    atStep('update', (lockHandle) =>
      withAdtHeaders(context, 'functionInclude.update', (headers) =>
        include.update(
          { ...target, transportRequest },
          { headers, source, lockHandle, analyse: analyseException },
        ),
      ),
    ),
    (lockHandle) =>
      include.unlock(target, lockHandle, { analyse: analyseException }),
  );
  if (!written.ok) return written as Answer;

  return carryCleanup(
    written,
    atStep('activate', () =>
      activateWithMainProgram(context, client, groupName, includeName),
    ),
  );
}

/**
 * The group's main program, `SAPL<group>` — a namespace stays in front:
 * `/NS/GROUP` has `/NS/SAPLGROUP`.
 */
export function functionGroupMainProgram(functionGroupName: string): string {
  const name = functionGroupName.toUpperCase();
  const namespaced = /^(\/[^/]+\/)(.+)$/.exec(name);
  return namespaced ? `${namespaced[1]}SAPL${namespaced[2]}` : `SAPL${name}`;
}

/** How many long polls the activation run is waited for. */
const ACTIVATION_POLLS = 6;

/**
 * Activate the test include, the group and its main program in one run.
 *
 * Writing the test include regenerates the main program with the `INCLUDE`
 * added, inactive. Activating the group alone, with the pre-audit, is
 * answered `200` with the inactive list instead of an activation — a
 * document `analyseActivation` does not read, so it passed as a success —
 * and the main program stayed inactive: ABAP Unit then found no test class
 * (measured on premise, BASIS 816, 2026-10-12). The three go in one run
 * without the pre-audit, as Eclipse activates the list it was shown; the run
 * is accepted, not done, so its results are read before answering.
 */
async function activateWithMainProgram(
  context: AdtHeadersContext,
  client: ReturnType<typeof createAdtClient>,
  groupName: string,
  includeName: string,
): Promise<Answer> {
  const utils = client.getUtils(ourUtils);
  const started = await withAdtHeaders(
    context,
    'utils.activateObjectsGroup',
    (headers) =>
      utils.activateObjectsGroup(
        [
          { type: 'FUGR/I', name: includeName, parentName: groupName },
          { type: 'FUGR/F', name: groupName },
          {
            type: 'FUGR/I',
            name: functionGroupMainProgram(groupName),
            parentName: groupName,
          },
        ],
        false,
        { headers, analyse: analyseException },
      ),
  );
  if (!started.ok) return started as unknown as Answer;
  // Long polls back to back, no timer of ours: the server holds each one
  // until the run moves.
  const outcome = await awaitActivationRun(
    utils as unknown as ActivationRunSource,
    started.getResult().value,
    analyseException,
    ACTIVATION_POLLS,
    0,
  );
  // Reading the run failed: the method's error as it is, with its step.
  if (outcome.failure !== undefined) return failedWith(outcome.failure);
  const refusals = outcome.messages.filter(isRefusal);
  if (
    outcome.settled &&
    (refusals.length > 0 ||
      outcome.status === 'failed' ||
      outcome.status === 'error')
  ) {
    // SAP reported the run failed: its messages as they are.
    return failedWith({
      origin: 'refusal',
      message: refusals.length
        ? `Activation failed: ${refusals.map((m) => m.text).join('; ')}`
        : `Activation run ${outcome.runId} ended with status ${outcome.status}`,
    });
  }
  if (!outcome.settled) {
    // Not SAP's refusal: our wait bound ran out while the run went on. Said
    // as a failure on our side, never dressed as SAP's answer.
    throw new Error(
      `The activation run ${outcome.runId} had not finished after ${ACTIVATION_POLLS} polls — the wait bound ran out (status ${outcome.status || 'unknown'}); the run may still be going on in SAP.`,
    );
  }
  // The run's results as the reading: a write's terse answer reads the
  // status, and `raw` shows what SAP said about the activation.
  return succeededWith({
    value: { run_id: outcome.runId, status: outcome.status },
    raw: outcome.results ?? '',
    status: 200,
  }) as unknown as Answer;
}
