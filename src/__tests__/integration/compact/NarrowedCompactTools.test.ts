/**
 * The compact tools with values denied, live (plan Task 14): an in-process
 * server started with denied actions (`withRestriction`) refuses a denied
 * value at the parse of its listed schema, sending nothing, and runs the
 * values left.
 *
 * - `HandlerGet.CLAS/OC`: `object_structure` of an interface runs; of a
 *   class by `CLAS/OC`, refused.
 * - `HandlerActivate.CLASS`: a class is activated by `CLAS/OC`;
 *   `object_type: 'CLASS'` refused.
 * - one value of each compact write and check denied (`DOMAIN`, or
 *   `INTERFACE` for the lock tools and the update): each refused; the class
 *   created, locked, written, unlocked, validated, checked, its usages read,
 *   its deletion checked and deleted, all by `CLASS`.
 * - `HandlerBatch.end`: `begin` runs, `end` refused.
 *
 * Every object is the run's own and deleted after.
 *
 * Run: MCP_TEST_CONFIG=<config> npm run test:integration -- src/__tests__/integration/compact/NarrowedCompactTools.test.ts
 */

import { randomBytes } from 'node:crypto';
import { after, it } from 'node:test';
import { parseDeniedEntry } from '../../../lib/access/deniedActions';
import {
  configuredSystemKind,
  resolvePackageName,
  resolveTransportRequest,
} from '../helpers/configHelpers';
import {
  deleteRecorded,
  expectAbsent,
  livePrepare,
  liveSuite,
  recordCreated,
  type ToolArgs,
  withRestriction,
} from '../helpers/live';
import {
  answerField,
  refusedAtParse,
  succeeded,
} from '../helpers/restrictedCalls';

const S = randomBytes(2).toString('hex').toUpperCase().slice(0, 3);
const onprem = (): boolean => configuredSystemKind() === 'onprem';
const packageName = (): string => (onprem() ? '$TMP' : resolvePackageName());
function onRequest(): ToolArgs {
  if (onprem()) return {};
  const request = resolveTransportRequest();
  return request === undefined || request === ''
    ? {}
    : { transport_request: request };
}
const denied = (...entries: string[]) => ({
  deniedActions: entries.map((entry) =>
    parseDeniedEntry(entry, 'deny-actions'),
  ),
});

const classSource = (name: string) =>
  [
    `CLASS ${name.toLowerCase()} DEFINITION PUBLIC FINAL CREATE PUBLIC.`,
    '  PUBLIC SECTION.',
    '    METHODS a.',
    'ENDCLASS.',
    `CLASS ${name.toLowerCase()} IMPLEMENTATION.`,
    '  METHOD a.',
    '  ENDMETHOD.',
    'ENDCLASS.',
  ].join('\n');

liveSuite(['onprem', 'cloud'], 'compact tools with values denied', () => {
  after(async () => {
    await deleteRecorded();
  });

  withRestriction(
    'HandlerGet with CLAS/OC denied',
    denied('HandlerGet.CLAS/OC'),
    () => {
      it('object_structure of an interface with CLAS/OC denied', async () => {
        succeeded(
          'HandlerGet object_structure',
          await livePrepare('HandlerGet', {
            part: 'object_structure',
            object_adt_type: 'INTF/OI',
            object_name: 'ZIF_MCP_SHARED',
          }),
        );
      });

      it('CLAS/OC refused at the parse', async () => {
        await refusedAtParse('HandlerGet', {
          part: 'object_structure',
          object_adt_type: 'CLAS/OC',
          object_name: 'ZCL_MCP_SHARED_CLS',
        });
      });
    },
  );

  const activated = `ZCL_MNC${S}_A`;
  withRestriction(
    'HandlerActivate with CLASS denied',
    denied('HandlerActivate.CLASS'),
    () => {
      it('activates a class by CLAS/OC with CLASS denied', async () => {
        recordCreated('DeleteClass', { class_name: activated, ...onRequest() });
        succeeded(
          'CreateClass',
          await livePrepare('CreateClass', {
            class_name: activated,
            package_name: packageName(),
            description: 'Narrowed live',
            ...onRequest(),
          }),
        );
        succeeded(
          'UpdateClass',
          await livePrepare('UpdateClass', {
            class_name: activated,
            source_code: classSource(activated),
            activate: false,
            ...onRequest(),
          }),
        );
        succeeded(
          'HandlerActivate by CLAS/OC',
          await livePrepare('HandlerActivate', {
            object_adt_type: 'CLAS/OC',
            object_name: activated,
          }),
        );
      });

      it('object_type CLASS refused at the parse', async () => {
        await refusedAtParse('HandlerActivate', {
          object_type: 'CLASS',
          object_name: activated,
        });
      });
    },
  );

  const written = `ZCL_MNC${S}_W`;
  withRestriction(
    'one value of each compact write and check denied',
    denied(
      'HandlerCreate.DOMAIN',
      'HandlerDelete.DOMAIN',
      'HandlerDeletionCheck.DOMAIN',
      'HandlerValidate.DOMAIN',
      'HandlerCheckRun.DOMAIN',
      'HandlerWhereUsed.DOMAIN',
      'HandlerLock.INTERFACE',
      'HandlerUpdate.INTERFACE',
      'HandlerUnlock.INTERFACE',
    ),
    () => {
      it('each denied value refused at the parse', async () => {
        await refusedAtParse('HandlerCreate', {
          object_type: 'DOMAIN',
          domain_name: 'ZMNC_DENIED',
          package_name: packageName(),
        });
        await refusedAtParse('HandlerDelete', {
          object_type: 'DOMAIN',
          domain_name: 'ZMNC_DENIED',
        });
        await refusedAtParse('HandlerDeletionCheck', {
          object_type: 'DOMAIN',
          object_name: 'ZMNC_DENIED',
        });
        await refusedAtParse('HandlerValidate', {
          object_type: 'DOMAIN',
          object_name: 'ZMNC_DENIED',
        });
        await refusedAtParse('HandlerCheckRun', {
          object_type: 'DOMAIN',
          object_name: 'ZMNC_DENIED',
        });
        await refusedAtParse('HandlerWhereUsed', {
          object_type: 'DOMAIN',
          object_name: 'ZMNC_DENIED',
        });
        await refusedAtParse('HandlerLock', {
          object_type: 'INTERFACE',
          object_name: 'ZIF_MCP_SHARED',
        });
        await refusedAtParse('HandlerUpdate', {
          object_type: 'INTERFACE',
          interface_name: 'ZIF_MCP_SHARED',
          source_code: 'x',
          lock_handle: 'NONE',
        });
        await refusedAtParse('HandlerUnlock', {
          object_type: 'INTERFACE',
          object_name: 'ZIF_MCP_SHARED',
          lock_handle: 'NONE',
        });
      });

      it('another value runs: a class created, locked, written, unlocked, validated, checked, read for usages, its deletion checked, deleted', async () => {
        succeeded(
          'HandlerValidate CLASS',
          await livePrepare('HandlerValidate', {
            object_type: 'CLASS',
            object_name: written,
            package_name: packageName(),
          }),
        );
        // Deleted by HandlerDelete below; by DeleteClass when the case fails first.
        let deleted = false;
        try {
          succeeded(
            'HandlerCreate CLASS',
            await livePrepare('HandlerCreate', {
              object_type: 'CLASS',
              class_name: written,
              package_name: packageName(),
              description: 'Narrowed live',
              ...onRequest(),
            }),
          );
          const locked = succeeded(
            'HandlerLock CLASS',
            await livePrepare('HandlerLock', {
              object_type: 'CLASS',
              object_name: written,
            }),
          );
          const handle = answerField(locked, 'lock_handle');
          if (typeof handle !== 'string' || handle === '') {
            throw new Error('HandlerLock answered no lock_handle');
          }
          try {
            succeeded(
              'HandlerUpdate CLASS',
              await livePrepare('HandlerUpdate', {
                object_type: 'CLASS',
                class_name: written,
                source_code: classSource(written),
                lock_handle: handle,
                ...onRequest(),
              }),
            );
          } finally {
            succeeded(
              'HandlerUnlock CLASS',
              await livePrepare('HandlerUnlock', {
                object_type: 'CLASS',
                object_name: written,
                lock_handle: handle,
              }),
            );
          }
          succeeded(
            'HandlerCheckRun CLASS',
            await livePrepare('HandlerCheckRun', {
              object_type: 'CLASS',
              object_name: written,
            }),
          );
          succeeded(
            'HandlerWhereUsed CLASS',
            await livePrepare('HandlerWhereUsed', {
              object_type: 'CLASS',
              object_name: written,
            }),
          );
          succeeded(
            'HandlerDeletionCheck CLASS',
            await livePrepare('HandlerDeletionCheck', {
              object_type: 'CLASS',
              object_name: written,
            }),
          );
          succeeded(
            'HandlerDelete CLASS',
            await livePrepare('HandlerDelete', {
              object_type: 'CLASS',
              class_name: written,
              ...onRequest(),
            }),
          );
          deleted = true;
          await expectAbsent({
            tool: 'GetClass',
            args: { class_name: written },
          });
        } finally {
          if (!deleted) {
            await livePrepare('DeleteClass', {
              class_name: written,
              ...onRequest(),
            });
          }
        }
      });
    },
  );

  withRestriction(
    'HandlerBatch with end denied',
    denied('HandlerBatch.end'),
    () => {
      it('end denied: begin runs, end refused at the parse', async () => {
        succeeded(
          'HandlerBatch begin',
          await livePrepare('HandlerBatch', { action: 'begin' }),
        );
        await refusedAtParse('HandlerBatch', { action: 'end' });
      });
    },
  );
});
