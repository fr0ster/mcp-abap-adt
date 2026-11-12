/**
 * `HandlerProfileRun`, `HandlerGetData`, `HandlerSession` and the five
 * debugger tools with a value denied, live (plan Task 14): an in-process
 * server started with denied actions (`withRestriction`) refuses the denied
 * value at the parse, sending nothing, and runs the values left end to end.
 *
 * - `HandlerProfileRun`: `CLASS` profiles the shared run class; on premise
 *   `PROGRAM` the shared program; with `PROGRAM` denied, `PROGRAM` refused
 *   and `CLASS` runs.
 * - `HandlerGetData`: a table read by `object_name` and by `sql_query`; with
 *   `HandlerGetData.sql` denied, `sql_query` is no argument (a call with it alone
 *   names no table and sends nothing) and `object_name` reads.
 * - `HandlerSession`: `open` then `close`; with `close` denied, refused.
 * - the debugger: a line breakpoint in the shared run class set
 *   (`HandlerDebugBreakpoints`), a listen held (`HandlerDebugSession`)
 *   while the class runs in the background, the debuggee attached, its
 *   stack read in a debugger batch (`HandlerDebugBatch` begin, end) and
 *   directly (`HandlerDebugMaintain`), one step over and a continue
 *   (`HandlerDebugStep`), the breakpoint deleted and the debug state ended;
 *   one operation of each tool denied and refused.
 *
 * The data tools are served as hard mode serves them (every set, data tools
 * on). Nothing is created; the debug state is ended in the case's own
 * `finally`.
 *
 * Run: MCP_TEST_CONFIG=<config> npm run test:integration -- src/__tests__/integration/compact/CompactRestrictedTools.test.ts
 */

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { parseDeniedEntry } from '../../../lib/access/deniedActions';
import { configuredSystemKind } from '../helpers/configHelpers';
import {
  type LiveAnswer,
  livePrepare,
  liveSuite,
  withRestriction,
} from '../helpers/live';
import {
  answerField,
  refusedAtParse,
  sentDuring,
  succeeded,
} from '../helpers/restrictedCalls';
import { skipRunningTest } from '../helpers/runningTest';

const onprem = (): boolean => configuredSystemKind() === 'onprem';
const denied = (...entries: string[]) => ({
  deniedActions: entries.map((entry) =>
    parseDeniedEntry(entry, 'deny-actions'),
  ),
});

/** The shared run class (`shared_dependencies`): running it changes nothing. */
const RUN_CLASS = 'ZMCP_SHR_PROF_CLS';
/** The shared run program, on premise. */
const RUN_PROGRAM = 'ZMCP_SHR_PROF_PROG';
/** The line of the shared run class that writes its output. */
const OUTPUT_LINE = 12;

liveSuite(
  ['onprem', 'cloud'],
  'compact tools with a value denied, run end to end',
  () => {
    withRestriction(
      'HandlerProfileRun with PROGRAM denied',
      denied('HandlerProfileRun.PROGRAM'),
      () => {
        it('PROGRAM denied: refused at the parse, CLASS profiles a class run', async () => {
          if (onprem()) {
            await refusedAtParse('HandlerProfileRun', {
              target_type: 'PROGRAM',
              program_name: RUN_PROGRAM,
              background: false,
            });
          }
          const ran = succeeded(
            'HandlerProfileRun CLASS',
            await livePrepare('HandlerProfileRun', {
              target_type: 'CLASS',
              class_name: RUN_CLASS,
              background: false,
            }),
          );
          assert.equal(answerField(ran, 'success'), true);
        });
      },
    );

    withRestriction('HandlerProfileRun with nothing denied', {}, () => {
      it('PROGRAM profiles a program run', async () => {
        if (!onprem()) {
          skipRunningTest('ABAP cloud runs no program');
          return;
        }
        const ran = succeeded(
          'HandlerProfileRun PROGRAM',
          await livePrepare('HandlerProfileRun', {
            target_type: 'PROGRAM',
            program_name: RUN_PROGRAM,
            background: false,
          }),
        );
        assert.equal(answerField(ran, 'success'), true);
      });
    });

    withRestriction('HandlerGetData', {}, () => {
      it('reads a table by object_name and by sql_query', async () => {
        succeeded(
          'HandlerGetData object_name',
          await livePrepare('HandlerGetData', {
            object_name: 'ZMCP_SHR_BTABL',
            max_rows: 5,
            background: false,
          }),
        );
        succeeded(
          'HandlerGetData sql_query',
          await livePrepare('HandlerGetData', {
            sql_query: 'SELECT fld1 FROM zmcp_shr_btabl',
            max_rows: 5,
            background: false,
          }),
        );
      });
    });

    withRestriction(
      'HandlerGetData with sql denied',
      denied('HandlerGetData.sql'),
      () => {
        it('sql denied: sql_query is no argument and sends nothing, object_name reads', async () => {
          // sql_query left the schema: the parse drops it, and a call with
          // it alone names no table — refused before anything is sent.
          const alone = await sentDuring('HandlerGetData', {
            sql_query: 'SELECT fld1 FROM zmcp_shr_btabl',
            background: false,
          });
          assert.equal(alone.answer.isError, true);
          assert.deepEqual(alone.sent, []);
          succeeded(
            'HandlerGetData object_name',
            await livePrepare('HandlerGetData', {
              object_name: 'ZMCP_SHR_BTABL',
              max_rows: 5,
              background: false,
            }),
          );
        });
      },
    );

    withRestriction(
      'HandlerSession with close denied',
      denied('HandlerSession.close'),
      () => {
        it('close denied: refused at the parse', async () => {
          await refusedAtParse('HandlerSession', { action: 'close' });
        });
      },
    );

    withRestriction('HandlerSession', {}, () => {
      it('open then close', async () => {
        const opened = succeeded(
          'HandlerSession open',
          await livePrepare('HandlerSession', { action: 'open' }),
        );
        const handle = answerField(opened, 'state_handle');
        assert.equal(typeof handle, 'string');
        succeeded(
          'HandlerSession close',
          await livePrepare('HandlerSession', {
            action: 'close',
            state_handle: handle,
          }),
        );
      });
    });

    withRestriction(
      'the debugger tools, one operation each denied',
      denied(
        'HandlerDebugSession.terminateDebugger',
        'HandlerDebugStep.stepJumpToLine',
        'HandlerDebugBreakpoints.createWatchpoint',
        'HandlerDebugMaintain.setVariableValue',
        'HandlerDebugBatch.answers',
      ),
      () => {
        it('each denied operation refused at the parse', async () => {
          await refusedAtParse('HandlerDebugSession', {
            kind: 'abap',
            operation: 'terminateDebugger',
            state_handle: 'NONE',
          });
          await refusedAtParse('HandlerDebugStep', {
            kind: 'abap',
            operation: 'stepJumpToLine',
            state_handle: 'NONE',
          });
          await refusedAtParse('HandlerDebugBreakpoints', {
            kind: 'abap',
            operation: 'createWatchpoint',
            state_handle: 'NONE',
          });
          await refusedAtParse('HandlerDebugMaintain', {
            kind: 'abap',
            operation: 'setVariableValue',
            state_handle: 'NONE',
          });
          await refusedAtParse('HandlerDebugBatch', {
            action: 'answers',
            state_handle: 'NONE',
          });
        });

        it('a breakpoint, a listen, a catch, the stack read alone and in a debugger batch, a step and a continue, the end', async () => {
          const placed = succeeded(
            'HandlerDebugBreakpoints setBreakpoints',
            await livePrepare('HandlerDebugBreakpoints', {
              kind: 'abap',
              operation: 'setBreakpoints',
              breakpoints: [
                {
                  object_type: 'CLAS',
                  object_name: RUN_CLASS,
                  line: OUTPUT_LINE,
                },
              ],
            }),
          );
          const handle = answerField(placed, 'state_handle');
          if (typeof handle !== 'string' || handle === '') {
            throw new Error('setBreakpoints answered no state_handle');
          }
          try {
            // The listen is held while the class runs on a session of its own.
            const listening: Promise<LiveAnswer> = livePrepare(
              'HandlerDebugSession',
              {
                kind: 'abap',
                operation: 'listen',
                state_handle: handle,
                hold_seconds: 60,
              },
            );
            succeeded(
              'HandlerProfileRun in the background',
              await livePrepare('HandlerProfileRun', {
                target_type: 'CLASS',
                class_name: RUN_CLASS,
                background: true,
              }),
            );
            const caught = succeeded(
              'HandlerDebugSession listen',
              await listening,
            );
            const debuggee = answerField(caught, 'debuggee_id');
            assert.equal(
              typeof debuggee,
              'string',
              'the listen caught no debuggee',
            );
            succeeded(
              'HandlerDebugSession attach',
              await livePrepare('HandlerDebugSession', {
                kind: 'abap',
                operation: 'attach',
                state_handle: handle,
                debuggee_id: debuggee,
                server: answerField(caught, 'server'),
              }),
            );
            succeeded(
              'HandlerDebugMaintain getStack',
              await livePrepare('HandlerDebugMaintain', {
                kind: 'abap',
                operation: 'getStack',
                state_handle: handle,
              }),
            );
            succeeded(
              'HandlerDebugBatch begin',
              await livePrepare('HandlerDebugBatch', {
                action: 'begin',
                state_handle: handle,
              }),
            );
            await livePrepare('HandlerDebugMaintain', {
              kind: 'abap',
              operation: 'getVariables',
              state_handle: handle,
              names: ['LV_X'],
            });
            succeeded(
              'HandlerDebugBatch end',
              await livePrepare('HandlerDebugBatch', {
                action: 'end',
                state_handle: handle,
              }),
            );
            succeeded(
              'HandlerDebugStep stepOver',
              await livePrepare('HandlerDebugStep', {
                kind: 'abap',
                operation: 'stepOver',
                state_handle: handle,
              }),
            );
            succeeded(
              'HandlerDebugStep stepContinue',
              await livePrepare('HandlerDebugStep', {
                kind: 'abap',
                operation: 'stepContinue',
                state_handle: handle,
              }),
            );
            const breakpoint = answerField(placed, 'breakpoints');
            const id =
              Array.isArray(breakpoint) && breakpoint.length > 0
                ? Reflect.get(Object(breakpoint[0]), 'id')
                : undefined;
            if (typeof id === 'string') {
              succeeded(
                'HandlerDebugBreakpoints deleteBreakpoint',
                await livePrepare('HandlerDebugBreakpoints', {
                  kind: 'abap',
                  operation: 'deleteBreakpoint',
                  state_handle: handle,
                  breakpoint_id: id,
                }),
              );
            }
          } finally {
            succeeded(
              'HandlerDebugSession end',
              await livePrepare('HandlerDebugSession', {
                kind: 'abap',
                operation: 'end',
                state_handle: handle,
              }),
            );
          }
        });
      },
    );
  },
);
