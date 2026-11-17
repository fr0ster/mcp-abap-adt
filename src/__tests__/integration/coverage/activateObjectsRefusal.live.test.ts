/**
 * ActivateObjects, live: a set of objects in which one cannot activate is
 * answered as SAP's refusal, naming that object.
 *
 * The test creates three classes of its own (each name read free first,
 * recorded for cleanup before its create): `GOOD_A` and `GOOD_C` with
 * valid sources, `BROKEN` with a misspelt keyword in a method (`DAAT` for
 * `DATA`), all written inactive. In order:
 *
 * 1. `ActivateObjects` with the two good classes activates them (a group
 *    activation answered `isError: false`, `activated: true`);
 * 2. `GetClass` reads one of them back (a plain read);
 * 3. `GOOD_C` is written inactive again with a changed, valid source, and
 *    `ActivateObjects` with `GOOD_C` and `BROKEN` is an error: its `origin`
 *    is `refusal`, and the broken class is named in the answer;
 * 4. `GetClass` of a name nobody created is SAP's `404`, answered as a tool
 *    answer.
 *
 * Objects are created only in `$TMP` or the development package on premise
 * and only in the build package on the cloud: the configured package is
 * checked to be one of them before anything is created.
 *
 * Every call goes through `livePrepare`: ActivateObjects and GetClass are not
 * coverage keys (`tests/fixtures/tools/coverage-ledger.json`).
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, it } from 'node:test';
import {
  configuredSystemKind,
  resolvePackageName,
  resolveTransportRequest,
} from '../helpers/configHelpers';
import {
  deleteRecorded,
  expectAbsent,
  expectNameFree,
  type LiveAnswer,
  livePrepare,
  liveSuite,
  recordCreated,
} from '../helpers/live';
import { CREATION_PACKAGES } from '../helpers/packageGuard';

const SUFFIX = randomBytes(3).toString('hex').toUpperCase();
const GOOD_A = `ZMCP_AOR_${SUFFIX}_A`;
const GOOD_C = `ZMCP_AOR_${SUFFIX}_C`;
const BROKEN = `ZMCP_AOR_${SUFFIX}_B`;
/** A name the test never creates: its read is SAP's "not found". */
const NEVER_CREATED = `ZMCP_AOR_${SUFFIX}_X`;

/** A class with one method; `keyword` is the declaration's keyword. */
function sourceOf(name: string, value: number, keyword = 'DATA'): string {
  const lower = name.toLowerCase();
  return [
    `CLASS ${lower} DEFINITION PUBLIC FINAL CREATE PUBLIC.`,
    '  PUBLIC SECTION.',
    '    METHODS m RETURNING VALUE(r) TYPE i.',
    'ENDCLASS.',
    `CLASS ${lower} IMPLEMENTATION.`,
    '  METHOD m.',
    `    ${keyword} lv TYPE i.`,
    `    lv = ${value}.`,
    '    r = lv.',
    '  ENDMETHOD.',
    'ENDCLASS.',
  ].join('\n');
}

/** An answer's JSON payload. */
function payloadOf(answer: LiveAnswer): unknown {
  return JSON.parse(answer.text);
}

/** A field of a JSON value; `undefined` where it has none. */
function fieldOf(value: unknown, field: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, field)
    : undefined;
}

/** The answer, or the case fails naming the step and what was answered. */
function succeeded(step: string, answer: LiveAnswer): LiveAnswer {
  if (answer.isError) throw new Error(`${step}: ${answer.text}`);
  return answer;
}

liveSuite(
  ['onprem', 'cloud'],
  'ActivateObjects answers a set with a broken object as a refusal',
  () => {
    /**
     * The packages a run may create in: `$TMP` or the development package on
     * premise, the build package on the cloud (which has no `$TMP`). The
     * configured package must be exactly one of them, read before anything
     * is created; otherwise the case refuses, naming only the accepted ones.
     */
    const packageName = (): string => {
      const accepted =
        CREATION_PACKAGES[
          configuredSystemKind() === 'onprem' ? 'onprem' : 'cloud'
        ];
      const configured = resolvePackageName();
      if (!accepted.includes(configured)) {
        throw new Error(
          `the configured package is none of ${accepted.join(', ')}: nothing is created`,
        );
      }
      return configured;
    };
    /** No request for `$TMP`; the configured one for any other package. */
    const transport = () =>
      packageName() === '$TMP' ? undefined : resolveTransportRequest();
    const onRequest = () => {
      const request = transport();
      return request === undefined || request === ''
        ? {}
        : { transport_request: request };
    };

    /** The names this run recorded for cleanup: only these are deleted. */
    const recorded: string[] = [];

    after(async () => {
      await deleteRecorded();
      for (const name of recorded) {
        await expectAbsent({ tool: 'GetClass', args: { class_name: name } });
      }
    });

    it('activates a good set, reads it, refuses a set with a broken class, answers a missing class', async () => {
      const inPackage = packageName();
      console.log(
        `[activateObjectsRefusal] system kind: ${configuredSystemKind()}, package: ${inPackage}`,
      );
      for (const [name, source] of [
        [GOOD_A, sourceOf(GOOD_A, 1)],
        [GOOD_C, sourceOf(GOOD_C, 2)],
        [BROKEN, sourceOf(BROKEN, 3, 'DAAT')],
      ] as const) {
        await expectNameFree({ tool: 'GetClass', args: { class_name: name } });
        recordCreated('DeleteClass', { class_name: name, ...onRequest() });
        recorded.push(name);
        succeeded(
          `CreateClass ${name}`,
          await livePrepare('CreateClass', {
            class_name: name,
            package_name: inPackage,
            description: 'MCP ActivateObjects refusal',
            ...onRequest(),
          }),
        );
        succeeded(
          `UpdateClass ${name} (inactive)`,
          await livePrepare('UpdateClass', {
            class_name: name,
            source_code: source,
            activate: false,
            ...onRequest(),
          }),
        );
      }

      // 1. The good set activates.
      const good = succeeded(
        'ActivateObjects (good set)',
        await livePrepare('ActivateObjects', {
          objects: [
            { name: GOOD_A, type: 'CLAS/OC' },
            { name: GOOD_C, type: 'CLAS/OC' },
          ],
        }),
      );
      console.log(`[activateObjectsRefusal] good set: ${good.text}`);
      assert.equal(fieldOf(payloadOf(good), 'activated'), true);

      // 2. A plain read of an activated class.
      const read = succeeded(
        `GetClass ${GOOD_A}`,
        await livePrepare('GetClass', { class_name: GOOD_A }),
      );
      assert.ok(read.text.toLowerCase().includes(GOOD_A.toLowerCase()));

      // 3. A set with the broken class is SAP's refusal, naming it.
      succeeded(
        `UpdateClass ${GOOD_C} (inactive again)`,
        await livePrepare('UpdateClass', {
          class_name: GOOD_C,
          source_code: sourceOf(GOOD_C, 4),
          activate: false,
          ...onRequest(),
        }),
      );
      const refused = await livePrepare('ActivateObjects', {
        objects: [
          { name: GOOD_C, type: 'CLAS/OC' },
          { name: BROKEN, type: 'CLAS/OC' },
        ],
      });
      console.log(`[activateObjectsRefusal] broken set: ${refused.text}`);
      assert.equal(refused.isError, true);
      const refusal = payloadOf(refused);
      assert.equal(fieldOf(refusal, 'origin'), 'refusal');
      assert.ok(
        refused.text.includes(BROKEN),
        `the refusal names ${BROKEN}: ${refused.text}`,
      );

      // 4. SAP's "not found" is a tool answer, not a throw.
      const missing = await livePrepare('GetClass', {
        class_name: NEVER_CREATED,
      });
      console.log(`[activateObjectsRefusal] missing class: ${missing.text}`);
      assert.equal(missing.isError, true);
      assert.equal(fieldOf(payloadOf(missing), 'status'), 404);
    });
  },
);
