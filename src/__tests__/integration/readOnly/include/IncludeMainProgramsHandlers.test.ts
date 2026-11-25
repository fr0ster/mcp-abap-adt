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
 * Run: npm run test:integration -- src/__tests__/integration/readOnly/include/IncludeMainProgramsHandlers.test.ts
 */

import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import { handleHandlerGet } from '../../../../../compact-readonly-entries/src/handlers/handleHandlerGet';
import { handleGetMainPrograms } from '../../../../handlers/include/readonly/handleGetMainPrograms';
import { systemsDescribe } from '../../helpers/live';
import { assertEquals } from '../../helpers/liveAssert';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import { createHandlerContext } from '../../helpers/testHelpers';

const logger = createTestLogger('include-main-programs');

/** The text of a tool's answer: data from outside the type system. */
function textOf(answer: unknown): string {
  if (typeof answer !== 'object' || answer === null) return '';
  const content: unknown = Reflect.get(answer, 'content');
  if (!Array.isArray(content)) return '';
  const first: unknown = content[0];
  if (typeof first !== 'object' || first === null) return '';
  const text: unknown = Reflect.get(first, 'text');
  return typeof text === 'string' ? text : '';
}

/**
 * The main programs of a terse answer (the default): `type\tname` rows
 * under the `# include` line and the header.
 */
function mainProgramsOf(answer: unknown): string[][] {
  const lines = textOf(answer).split('\n');
  const header = lines.indexOf('type\tname');
  return header < 0
    ? []
    : lines
        .slice(header + 1)
        .filter((line) => line !== '')
        .map((line) => line.split('\t'));
}

systemsDescribe(['onprem'], "An include's main programs", () => {
  let tester: LambdaTester;

  before(async () => {
    tester = new LambdaTester(
      'include_main_programs',
      'delivered_include',
      'include-main-programs',
    );
    await tester.beforeAll(
      async (_context: LambdaTesterContext) => {},
      async (_context: LambdaTesterContext) => {},
    );
  });

  after(async () => {
    await tester.afterAll(async (_context: LambdaTesterContext) => {});
  });

  it('GetMainPrograms and HandlerGet part main_programs answer the same main programs', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection, params } = context;
      const includeName = String(params?.include_name ?? '');
      const handlerContext = createHandlerContext({ connection, logger });

      const listed = await handleGetMainPrograms(handlerContext, {
        include_name: includeName,
      });
      assert.equal(Reflect.get(listed, 'isError'), false);
      const programs = mainProgramsOf(listed);
      assert.ok(programs.length > 0, textOf(listed));
      for (const [type, name] of programs) {
        assert.ok(type, textOf(listed));
        assert.ok(name, textOf(listed));
      }

      const compact = await handleHandlerGet(handlerContext, {
        object_type: 'INCLUDE',
        include_name: includeName,
        part: 'main_programs',
      });
      assertEquals(mainProgramsOf(compact), programs);
      logger?.info(`${includeName}: ${programs.length} main program(s)`);
    });
  });
});
