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
  functionGroupDocuments,
  functionIncludeDocuments,
  includeDocuments,
  programDocuments,
} from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { analyseLock } from '../../../lib/strategies/lockAnswer';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { sequence } from '../../../lib/strategies/sequence';
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
    (lockHandle) =>
      tests.update(
        { className: name, transportRequest },
        { source, lockHandle, analyse: analyseException },
      ),
    (lockHandle) =>
      tests.unlock({ className: name }, lockHandle, {
        analyse: analyseException,
      }),
  );
  if (!written.ok) return written as Answer;
  return carryCleanup(written, () =>
    tests.activate({ className: name }, { analyse: analyseActivation }),
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
    const metadata = await program.readMetadata(
      { programName: name },
      { analyse: analyseException },
    );
    if (!metadata.ok) return metadata as unknown as Answer;
    const created = await include.create(
      {
        includeName,
        packageName: packageOf(metadata.getResult().value.raw),
        description: `ABAP Unit tests of ${name}`,
        transportRequest,
      },
      { analyse: analyseException },
    );
    if (!created.ok) return created as unknown as Answer;
  }

  const written = await withLock(
    () => include.lock({ includeName }, { analyse: analyseLock }),
    (lockHandle) =>
      include.update(
        { includeName, transportRequest },
        { source, lockHandle, analyse: analyseException },
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
      () => include.activate({ includeName }, { analyse: analyseActivation }),
      () =>
        program.activate({ programName: name }, { analyse: analyseActivation }),
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
        const current = await program.read({ programName: name }, 'inactive', {
          analyse: analyseException,
        });
        if (!current.ok) return current as unknown as Answer;
        const reportSource = current.getResult().value.raw;
        if (pulledIn.test(reportSource)) {
          return current as unknown as Answer;
        }
        return program.update(
          { programName: name, transportRequest },
          {
            source: `${reportSource.replace(/\s*$/, '')}\n\nINCLUDE ${includeName.toLowerCase()}.\n`,
            lockHandle,
            analyse: analyseException,
          },
        ) as Promise<Answer>;
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
 * the include and the group. With `create`, the include is created first;
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
  const group = client.getFunctionGroup(resultsFor(functionGroupDocuments));
  const groupName = functionGroupName.toUpperCase();
  const includeName = functionGroupTestInclude(groupName);
  const target = { functionGroupName: groupName, includeName };
  const transportRequest = options.transportRequest;

  if (options.create) {
    const created = await include.create(
      {
        ...target,
        description: `ABAP Unit tests of ${groupName}`,
        transportRequest,
      },
      { analyse: analyseException },
    );
    if (!created.ok) return created as unknown as Answer;
  }

  const written = await withLock(
    () => include.lock(target, { analyse: analyseLock }),
    (lockHandle) =>
      include.update(
        { ...target, transportRequest },
        { source, lockHandle, analyse: analyseException },
      ),
    (lockHandle) =>
      include.unlock(target, lockHandle, { analyse: analyseException }),
  );
  if (!written.ok) return written as Answer;

  // Writing an include regenerates the group's main program inactive; the
  // group has to be activated after it (see the FunctionInclude suite).
  return carryCleanup(
    written,
    () =>
      sequence(
        () => include.activate(target, { analyse: analyseActivation }),
        () =>
          group.activate(
            { functionGroupName: groupName },
            { analyse: analyseActivation },
          ),
      ) as Promise<Answer>,
  );
}
