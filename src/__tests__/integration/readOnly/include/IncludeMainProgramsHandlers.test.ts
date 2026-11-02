/**
 * Integration tests for an include's main programs: `GetMainPrograms` and
 * compact `HandlerGet` INCLUDE part `main_programs`.
 *
 * Where it runs: on premise only (`include_main_programs`, `available_in:
 * ["onprem"]`): the ABAP cloud table lists no `mainPrograms`, and neither tool
 * offers it there. Elsewhere, or with no integration configuration, the case
 * skips and says why. It only reads: the main programs of a delivered include
 * the configuration names (`LSVIMTOP` in the template, an include of function
 * group SVIM).
 *
 * What it asserts is what the system answered: at least one main program, each
 * with a name, a type and a uri, and the compact part answering the same list.
 *
 * Run: npm test -- --testPathIgnorePatterns='__tests__/admin/' --runInBand --forceExit 'integration/readOnly/include/IncludeMainPrograms'
 */

import { handleHandlerGet } from '../../../../../compact-readonly-entries/src/handlers/handleHandlerGet';
import { handleGetMainPrograms } from '../../../../handlers/include/readonly/handleGetMainPrograms';
import { getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import { createHandlerContext } from '../../helpers/testHelpers';

const logger = createTestLogger('include-main-programs');

/** The text of a tool's answer, parsed: data from outside the type system. */
function payloadOf(answer: unknown): unknown {
  if (typeof answer !== 'object' || answer === null) return undefined;
  const content: unknown = Reflect.get(answer, 'content');
  if (!Array.isArray(content)) return undefined;
  const first: unknown = content[0];
  if (typeof first !== 'object' || first === null) return undefined;
  const text: unknown = Reflect.get(first, 'text');
  return typeof text === 'string' ? JSON.parse(text) : undefined;
}

/** The `main_programs` list of an answer's payload. */
function mainProgramsOf(answer: unknown): unknown[] {
  const payload = payloadOf(answer);
  if (typeof payload !== 'object' || payload === null) return [];
  const listed: unknown = Reflect.get(payload, 'main_programs');
  return Array.isArray(listed) ? listed : [];
}

describe("An include's main programs", () => {
  let tester: LambdaTester;

  beforeAll(async () => {
    tester = new LambdaTester(
      'include_main_programs',
      'delivered_include',
      'include-main-programs',
    );
    await tester.beforeAll(
      async (_context: LambdaTesterContext) => {},
      async (_context: LambdaTesterContext) => {},
    );
  }, getTimeout('long'));

  afterAll(async () => {
    await tester.afterAll(async (_context: LambdaTesterContext) => {});
  });

  it(
    'GetMainPrograms and HandlerGet part main_programs answer the same main programs',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection, params } = context;
        const includeName = String(params?.include_name ?? '');
        const handlerContext = createHandlerContext({ connection, logger });

        const full = await handleGetMainPrograms(handlerContext, {
          include_name: includeName,
        });
        expect(Reflect.get(full, 'isError')).toBe(false);
        const programs = mainProgramsOf(full);
        expect(programs.length).toBeGreaterThan(0);
        for (const program of programs) {
          expect(typeof Reflect.get(Object(program), 'name')).toBe('string');
          expect(typeof Reflect.get(Object(program), 'type')).toBe('string');
          expect(typeof Reflect.get(Object(program), 'uri')).toBe('string');
        }

        const compact = await handleHandlerGet(handlerContext, {
          object_type: 'INCLUDE',
          include_name: includeName,
          part: 'main_programs',
        });
        expect(mainProgramsOf(compact)).toEqual(programs);
        logger?.info(`${includeName}: ${programs.length} main program(s)`);
      });
    },
    getTimeout('long'),
  );
});
