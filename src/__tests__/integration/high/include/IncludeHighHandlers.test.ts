/**
 * Integration tests for the program include (PROG/I) tools, high and compact.
 *
 * **Where it runs: on premise only** (`create_include` / `builder_include`,
 * `available_in: ["onprem"]`): ABAP cloud holds no program include of the
 * caller's, and the include writes are not offered there. Elsewhere — a cloud
 * system, or no integration configuration at all — the case skips and says
 * why (LambdaTester: "not available on cloud", "No configuration found").
 *
 * Lifecycle, one run, every object of its own:
 *   CreatePackage ($ZMCP_I<run>, local, no transport)
 *   -> CreateInclude -> GetInclude source (SAP's comment header, no code) and metadata
 *   -> UpdateInclude activate:true -> source reads back equal, GetInactiveObjects
 *      lists nothing of it
 *   -> UpdateIncludeMetadata (description changed) -> metadata reads back changed
 *   -> ActivateIncludeLow -> ActivateObjects PROG/I
 *   -> compact HandlerLock, HandlerUpdate (source, then part 'metadata'),
 *      HandlerUnlock, HandlerGet both parts, HandlerValidate (a free name),
 *      HandlerDeletionCheck, HandlerActivate
 *   -> DeleteInclude -> CreateInclude of the same name right after (SAP's
 *      answer recorded as sent; when it creates, deleted again, absence read)
 *   -> a second include through HandlerCreate / HandlerDelete
 *   -> afterAll: whatever is left deleted, the package last; SearchObject by
 *      the run's names answers no hit.
 *
 * The objects are deleted in afterAll whatever the outcome: a run on a shared
 * system leaves nothing behind (the owner's rule for these live suites).
 *
 * Run: MCP_TEST_CONFIG=<config> npm test -- src/__tests__/integration/high/include/IncludeHighHandlers.test.ts
 */

import { handleHandlerActivate } from '../../../../../compact-modify/src/handlers/handleHandlerActivate';
import { handleHandlerCreate } from '../../../../../compact-modify/src/handlers/handleHandlerCreate';
import { handleHandlerDelete } from '../../../../../compact-modify/src/handlers/handleHandlerDelete';
import { handleHandlerLock } from '../../../../../compact-modify/src/handlers/handleHandlerLock';
import { handleHandlerUnlock } from '../../../../../compact-modify/src/handlers/handleHandlerUnlock';
import { handleHandlerUpdate } from '../../../../../compact-modify/src/handlers/handleHandlerUpdate';
import { handleHandlerDeletionCheck } from '../../../../../compact-readonly-entries/src/handlers/handleHandlerDeletionCheck';
import { handleHandlerGet } from '../../../../../compact-readonly-entries/src/handlers/handleHandlerGet';
import { handleHandlerValidate } from '../../../../../compact-readonly-entries/src/handlers/handleHandlerValidate';
import { handleActivateObjects } from '../../../../handlers/common/high/handleActivateObjects';
import { handleCreateInclude } from '../../../../handlers/include/high/handleCreateInclude';
import { handleDeleteInclude } from '../../../../handlers/include/high/handleDeleteInclude';
import { handleUpdateInclude } from '../../../../handlers/include/high/handleUpdateInclude';
import { handleUpdateIncludeMetadata } from '../../../../handlers/include/high/handleUpdateIncludeMetadata';
import { handleActivateInclude } from '../../../../handlers/include/low/handleActivateInclude';
import { handleGetInclude } from '../../../../handlers/include/readonly/handleGetInclude';
import { handleCreatePackage } from '../../../../handlers/package/high/handleCreatePackage';
import { handleDeletePackage } from '../../../../handlers/package/high/handleDeletePackage';
import { handleSearchObject } from '../../../../handlers/search/readonly/handleSearchObject';
import { handleGetInactiveObjects } from '../../../../handlers/system/readonly/handleGetInactiveObjects';
import type { HandlerContext } from '../../../../lib/handlers/interfaces';
import { patchXmlAttribute } from '../../../../lib/strategies/xmlPatch';
import { getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import { createHandlerContext, delay } from '../../helpers/testHelpers';

/** A tool's answer as the model reads it: the error flag and the first text. */
type Answer = { isError: boolean; text: string };

/** Read a handler's result (typed `unknown` by the compact routes). */
function answerOf(value: unknown): Answer {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Not a tool answer: ${String(value)}`);
  }
  const isError = 'isError' in value && value.isError === true;
  const content = 'content' in value ? value.content : undefined;
  const first: unknown = Array.isArray(content) ? content[0] : undefined;
  const text =
    typeof first === 'object' &&
    first !== null &&
    'text' in first &&
    typeof first.text === 'string'
      ? first.text
      : '';
  return { isError, text };
}

/** A field of a parsed JSON value, or `undefined`. */
function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return key in value ? Reflect.get(value, key) : undefined;
}

/** A tool's JSON text, parsed; `undefined` when it is not JSON. */
function parsed(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return undefined;
  }
}

/** Source text compared as ABAP keeps it: line ends and trailing blanks aside. */
function normalisedSource(source: string): string {
  return source.split('\r\n').join('\n').trimEnd();
}

/** A run-unique suffix: five characters of A–Z and 0–9. */
function runSuffix(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 5; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return suffix;
}

const RUN = runSuffix();
const PACKAGE = `$ZMCP_I${RUN}`;
const NAME_PREFIX = `ZMCP_IT_IN_${RUN}`;
const INCLUDE = `${NAME_PREFIX}A`;
const COMPACT_INCLUDE = `${NAME_PREFIX}B`;
const FREE_NAME = `${NAME_PREFIX}Z`;

const logger = createTestLogger('incl-high');

describe('Include High-Level Handlers Integration', () => {
  let tester: LambdaTester;
  /** Set once the case runs here: only then is absence read back. */
  let ran = false;
  let handlerContext: HandlerContext | undefined;
  /** What this run created and has not deleted yet, in creation order. */
  const created: Array<{ kind: 'package' | 'include'; name: string }> = [];
  /** A compact lock this run holds, released before any delete. */
  let heldLock: { name: string; handle: string } | undefined;
  /** Each step's answer, for the log the run is read from. */
  const record = (label: string, answer: Answer) =>
    logger?.info(
      `[answer] ${label}: ${answer.isError ? 'isError ' : ''}${answer.text}`,
    );

  const forget = (name: string) => {
    const index = created.findIndex((entry) => entry.name === name);
    if (index >= 0) created.splice(index, 1);
  };

  /** Delete everything still listed, the package last. Idempotent. */
  const deleteEverything = async () => {
    const context = handlerContext;
    if (context === undefined) return;
    if (heldLock !== undefined) {
      const lock = heldLock;
      heldLock = undefined;
      record(
        `cleanup HandlerUnlock ${lock.name}`,
        answerOf(
          await handleHandlerUnlock(context, {
            object_type: 'INCLUDE',
            object_name: lock.name,
            lock_handle: lock.handle,
          }),
        ),
      );
    }
    for (const entry of [...created].reverse()) {
      if (entry.kind !== 'include') continue;
      const answer = answerOf(
        await handleDeleteInclude(context, { include_name: entry.name }),
      );
      record(`cleanup DeleteInclude ${entry.name}`, answer);
      if (!answer.isError) forget(entry.name);
    }
    for (const entry of [...created]) {
      if (entry.kind !== 'package') continue;
      const answer = answerOf(
        await handleDeletePackage(context, {
          package_name: entry.name,
          force_new_connection: true,
        }),
      );
      record(`cleanup DeletePackage ${entry.name}`, answer);
      if (!answer.isError) forget(entry.name);
    }
  };

  beforeAll(async () => {
    tester = new LambdaTester('create_include', 'builder_include', 'incl-high');
    await tester.beforeAll(
      async (context: LambdaTesterContext) => {
        if (context.hasConfig) {
          handlerContext = createHandlerContext({
            connection: context.connection,
            logger: context.logger,
          });
        }
      },
      async () => deleteEverything(),
    );
  });

  afterEach(async () => {
    await tester.afterEach();
  });

  afterAll(async () => {
    await tester.afterAll(async () => {
      // Whatever the outcome, nothing of the run stays.
      await deleteEverything();
      const context = handlerContext;
      if (context === undefined || !ran) return;
      const includes = answerOf(
        await handleSearchObject(context, { object_name: `${NAME_PREFIX}*` }),
      );
      record(`absence SearchObject ${NAME_PREFIX}*`, includes);
      const pkg = answerOf(
        await handleSearchObject(context, {
          object_name: PACKAGE,
          object_type: 'DEVC',
        }),
      );
      record(`absence SearchObject ${PACKAGE}`, pkg);
      expect(created).toEqual([]);
      expect(includes.isError).toBe(false);
      expect(includes.text.includes(NAME_PREFIX)).toBe(false);
      expect(pkg.isError).toBe(false);
      expect(pkg.text.includes(PACKAGE)).toBe(false);
    });
  });

  it(
    'creates, writes, reads, activates and deletes an include, high and compact',
    async () => {
      await tester.run(async (ctx: LambdaTesterContext) => {
        const context = handlerContext;
        if (context === undefined) throw new Error('No handler context');
        ran = true;
        const params = ctx.params;
        const description: string =
          params.description || 'Include for the include high-level tests';
        const source: string = params.update_source_code;
        if (!source) throw new Error('update_source_code is required');
        const settle = () => delay(ctx.getOperationDelay('create'));

        /** A step that must succeed: its answer, or the test ends with it. */
        const must = async (label: string, call: () => Promise<unknown>) => {
          const answer = answerOf(await call());
          record(label, answer);
          if (answer.isError) {
            throw new Error(`${label} was refused: ${answer.text}`);
          }
          return answer;
        };

        // The package of the run: local, no transport.
        await must(`CreatePackage ${PACKAGE}`, () =>
          handleCreatePackage(context, {
            package_name: PACKAGE,
            super_package: '$TMP',
            description: `Include suite run ${RUN}`,
            package_type: 'development',
            software_component: 'LOCAL',
          }),
        );
        created.push({ kind: 'package', name: PACKAGE });

        // CreateInclude: inactive and empty.
        await must(`CreateInclude ${INCLUDE}`, () =>
          handleCreateInclude(context, {
            include_name: INCLUDE,
            package_name: PACKAGE,
            description,
          }),
        );
        created.push({ kind: 'include', name: INCLUDE });
        await settle();

        // GetInclude, both parts: a source of no code, the document. SAP
        // writes a comment header naming the include into the new one
        // (measured on premise, 2026-11-01: three `*&` comment lines, the
        // name in lower case).
        const emptySource = await must(`GetInclude ${INCLUDE} source`, () =>
          handleGetInclude(context, { include_name: INCLUDE }),
        );
        const headerLines = normalisedSource(emptySource.text)
          .split('\n')
          .filter((line) => line.trim() !== '');
        expect(headerLines.every((line) => line.startsWith('*'))).toBe(true);
        expect(
          headerLines.some((line) => line.includes(INCLUDE.toLowerCase())),
        ).toBe(true);
        const firstMetadata = await must(`GetInclude ${INCLUDE} metadata`, () =>
          handleGetInclude(context, {
            include_name: INCLUDE,
            part: 'metadata',
          }),
        );
        const document = field(parsed(firstMetadata.text), 'metadata');
        if (typeof document !== 'string') {
          throw new Error(`GetInclude metadata answered no document`);
        }
        expect(document.includes(INCLUDE)).toBe(true);
        expect(document.includes(`adtcore:description="${description}"`)).toBe(
          true,
        );

        // UpdateInclude, activated; the source reads back equal.
        await must(`UpdateInclude ${INCLUDE} activate`, () =>
          handleUpdateInclude(context, {
            include_name: INCLUDE,
            source_code: source,
            activate: true,
          }),
        );
        const written = await must(
          `GetInclude ${INCLUDE} source (active)`,
          () => handleGetInclude(context, { include_name: INCLUDE }),
        );
        expect(normalisedSource(written.text)).toBe(normalisedSource(source));
        const inactive = await must('GetInactiveObjects', () =>
          handleGetInactiveObjects(context, {}),
        );
        expect(inactive.text.includes(INCLUDE)).toBe(false);

        // UpdateIncludeMetadata: the document with its description changed.
        // Its answer measures the include.updateMetadata header pair.
        const changedDescription = `${description} (metadata ${RUN})`;
        await must(`UpdateIncludeMetadata ${INCLUDE}`, () =>
          handleUpdateIncludeMetadata(context, {
            include_name: INCLUDE,
            metadata: patchXmlAttribute(
              document,
              'adtcore:description',
              changedDescription,
            ),
          }),
        );
        const changed = await must(
          `GetInclude ${INCLUDE} metadata (after)`,
          () =>
            handleGetInclude(context, {
              include_name: INCLUDE,
              part: 'metadata',
            }),
        );
        const changedDocument = field(parsed(changed.text), 'metadata');
        if (typeof changedDocument !== 'string') {
          throw new Error('GetInclude metadata answered no document');
        }
        expect(
          changedDocument.includes(
            `adtcore:description="${changedDescription}"`,
          ),
        ).toBe(true);

        await must(`ActivateIncludeLow ${INCLUDE}`, () =>
          handleActivateInclude(context, { include_name: INCLUDE }),
        );
        await must(`ActivateObjects ${INCLUDE} PROG/I`, () =>
          handleActivateObjects(context, {
            objects: [{ name: INCLUDE, type: 'PROG/I' }],
          }),
        );

        // Compact: lock, write the source, then the metadata, unlock.
        const locked = answerOf(
          await handleHandlerLock(context, {
            object_type: 'INCLUDE',
            object_name: INCLUDE,
          }),
        );
        // The lock's answer carries the handle: never logged.
        logger?.info(
          `[answer] HandlerLock INCLUDE ${INCLUDE}: ${locked.isError ? `isError ${locked.text}` : 'locked'}`,
        );
        if (locked.isError) {
          throw new Error(`HandlerLock was refused: ${locked.text}`);
        }
        const handle = field(parsed(locked.text), 'lock_handle');
        if (typeof handle !== 'string' || handle === '') {
          throw new Error('HandlerLock answered no lock handle');
        }
        heldLock = { name: INCLUDE, handle };

        const compactSource = `${source}* written through HandlerUpdate ${RUN}\n`;
        await must(`HandlerUpdate INCLUDE ${INCLUDE} source`, () =>
          handleHandlerUpdate(context, {
            object_type: 'INCLUDE',
            include_name: INCLUDE,
            source_code: compactSource,
            lock_handle: handle,
          }),
        );
        const compactRead = await must(
          `HandlerGet INCLUDE ${INCLUDE} metadata`,
          () =>
            handleHandlerGet(context, {
              object_type: 'INCLUDE',
              include_name: INCLUDE,
              part: 'metadata',
            }),
        );
        const compactDocument = field(parsed(compactRead.text), 'metadata');
        if (typeof compactDocument !== 'string') {
          throw new Error('HandlerGet metadata answered no document');
        }
        const compactDescription = `${description} (compact ${RUN})`;
        await must(`HandlerUpdate INCLUDE ${INCLUDE} metadata`, () =>
          handleHandlerUpdate(context, {
            object_type: 'INCLUDE',
            include_name: INCLUDE,
            part: 'metadata',
            source_code: patchXmlAttribute(
              compactDocument,
              'adtcore:description',
              compactDescription,
            ),
            lock_handle: handle,
          }),
        );
        await must(`HandlerUnlock INCLUDE ${INCLUDE}`, () =>
          handleHandlerUnlock(context, {
            object_type: 'INCLUDE',
            object_name: INCLUDE,
            lock_handle: handle,
          }),
        );
        heldLock = undefined;

        const inactiveSource = await must(
          `HandlerGet INCLUDE ${INCLUDE} source (inactive)`,
          () =>
            handleHandlerGet(context, {
              object_type: 'INCLUDE',
              include_name: INCLUDE,
              version: 'inactive',
            }),
        );
        const readSource = field(parsed(inactiveSource.text), 'source');
        expect(typeof readSource).toBe('string');
        expect(normalisedSource(String(readSource))).toBe(
          normalisedSource(compactSource),
        );
        const compactMetadata = await must(
          `HandlerGet INCLUDE ${INCLUDE} metadata (after)`,
          () =>
            handleHandlerGet(context, {
              object_type: 'INCLUDE',
              include_name: INCLUDE,
              part: 'metadata',
            }),
        );
        const compactChanged = field(parsed(compactMetadata.text), 'metadata');
        expect(typeof compactChanged).toBe('string');
        expect(
          String(compactChanged).includes(
            `adtcore:description="${compactDescription}"`,
          ),
        ).toBe(true);

        await must(`HandlerValidate INCLUDE ${FREE_NAME}`, () =>
          handleHandlerValidate(context, {
            object_type: 'INCLUDE',
            object_name: FREE_NAME,
            package_name: PACKAGE,
            description,
          }),
        );
        await must(`HandlerDeletionCheck INCLUDE ${INCLUDE}`, () =>
          handleHandlerDeletionCheck(context, {
            object_type: 'INCLUDE',
            object_name: INCLUDE,
          }),
        );
        await must(`HandlerActivate INCLUDE ${INCLUDE}`, () =>
          handleHandlerActivate(context, {
            object_type: 'INCLUDE',
            object_name: INCLUDE,
          }),
        );
        const activeAgain = await must(
          `GetInclude ${INCLUDE} source (after HandlerActivate)`,
          () => handleGetInclude(context, { include_name: INCLUDE }),
        );
        expect(normalisedSource(activeAgain.text)).toBe(
          normalisedSource(compactSource),
        );

        // DeleteInclude, then a create of the same name right after: SAP's
        // answer recorded as sent.
        await must(`DeleteInclude ${INCLUDE}`, () =>
          handleDeleteInclude(context, { include_name: INCLUDE }),
        );
        forget(INCLUDE);
        const recreated = answerOf(
          await handleCreateInclude(context, {
            include_name: INCLUDE,
            package_name: PACKAGE,
            description,
          }),
        );
        record(
          `CreateInclude ${INCLUDE} again, right after the delete`,
          recreated,
        );
        if (!recreated.isError) {
          created.push({ kind: 'include', name: INCLUDE });
          await settle();
          await must(`DeleteInclude ${INCLUDE} (the re-created one)`, () =>
            handleDeleteInclude(context, { include_name: INCLUDE }),
          );
          forget(INCLUDE);
          const gone = await must(`SearchObject ${INCLUDE}`, () =>
            handleSearchObject(context, { object_name: INCLUDE }),
          );
          expect(gone.text.includes(INCLUDE)).toBe(false);
        }

        // A second include through the compact create and delete.
        await must(`HandlerCreate INCLUDE ${COMPACT_INCLUDE}`, () =>
          handleHandlerCreate(context, {
            object_type: 'INCLUDE',
            include_name: COMPACT_INCLUDE,
            package_name: PACKAGE,
            description,
          }),
        );
        created.push({ kind: 'include', name: COMPACT_INCLUDE });
        await settle();
        await must(`HandlerDelete INCLUDE ${COMPACT_INCLUDE}`, () =>
          handleHandlerDelete(context, {
            object_type: 'INCLUDE',
            include_name: COMPACT_INCLUDE,
          }),
        );
        forget(COMPACT_INCLUDE);
      });
    },
    getTimeout('long'),
  );
});
