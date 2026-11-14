/**
 * The eight fixed-enum compact tools whose definitions the deny list
 * rebuilds from a member set (`HandlerBatch`, `HandlerDebugBatch`,
 * `HandlerSession`, `HandlerDebugSession`, `HandlerDebugStep`,
 * `HandlerDebugBreakpoints`, `HandlerDebugMaintain`, `HandlerGetData`):
 * with every value present, each tool's description, every property's
 * description and every enum stay as the base wrote them. The expectation is
 * `tests/fixtures/tools/rebuilt-descriptions.json`, written from the base
 * (`WRITE_REBUILT_DESCRIPTIONS=1 npm test -- <this file>`); no other fixture
 * holds these texts (`variant-surface.json` keeps only the twelve projected
 * tools').
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, describe, it } from 'node:test';
import { TOOL_DEFINITION as getData } from '../../../../compact-readonly-entries/src/handlers/handleHandlerGetData';
import { TOOL_DEFINITION as batch } from '../../../lib/compact/batch/handleHandlerBatch';
import { TOOL_DEFINITION as debugBatch } from '../../../lib/compact/debug/handleHandlerDebugBatch';
import { TOOL_DEFINITION as debugBreakpoints } from '../../../lib/compact/debug/handleHandlerDebugBreakpoints';
import { TOOL_DEFINITION as debugMaintain } from '../../../lib/compact/debug/handleHandlerDebugMaintain';
import { TOOL_DEFINITION as debugSession } from '../../../lib/compact/debug/handleHandlerDebugSession';
import { TOOL_DEFINITION as debugStep } from '../../../lib/compact/debug/handleHandlerDebugStep';
import { TOOL_DEFINITION as session } from '../../../lib/compact/longSession/handleHandlerSession';
import type { ToolDefinition } from '../../../lib/handlers/interfaces';
import { type JsonSchema, listedJson } from '../../helpers/listedJson';
import { repositoryRoot } from '../../helpers/repoRoot';

const FIXTURE = path.join(
  repositoryRoot(__dirname),
  'tests',
  'fixtures',
  'tools',
  'rebuilt-descriptions.json',
);
const WRITE = process.env.WRITE_REBUILT_DESCRIPTIONS === '1';

const DEFINITIONS: readonly ToolDefinition[] = [
  batch,
  debugBatch,
  session,
  debugSession,
  debugStep,
  debugBreakpoints,
  debugMaintain,
  getData,
];

/** Every description and enum under `node`, by its dotted path. */
function texts(
  node: JsonSchema,
  at: string,
  into: Record<string, unknown>,
): Record<string, unknown> {
  if (node.description !== undefined)
    into[`${at}.description`] = node.description;
  if (node.enum !== undefined) into[`${at}.enum`] = node.enum;
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    if (typeof child !== 'boolean') texts(child, `${at}.${key}`, into);
  }
  const items = node.items;
  if (
    items !== undefined &&
    typeof items !== 'boolean' &&
    !Array.isArray(items)
  ) {
    texts(items, `${at}[]`, into);
  }
  return into;
}

/** What a definition states, as the pin compares it. */
function stated(definition: ToolDefinition): Record<string, unknown> {
  return texts(listedJson(definition.inputSchema), 'inputSchema', {
    description: definition.description,
  });
}

function pinned(): Readonly<Record<string, unknown>> {
  if (WRITE) return {};
  const parsed: unknown = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('the fixture is not an object');
  }
  return Object.fromEntries(Object.entries(parsed));
}

describe('the eight rebuilt definitions with every value present', () => {
  const expected = pinned();
  const written: Record<string, unknown> = {};
  after(() => {
    if (WRITE) {
      fs.writeFileSync(FIXTURE, `${JSON.stringify(written, null, 2)}\n`);
    }
  });

  it('pins exactly these tools', () => {
    if (WRITE) return;
    assert.deepEqual(
      DEFINITIONS.map((definition) => definition.name),
      Object.keys(expected),
    );
  });

  for (const definition of DEFINITIONS) {
    it(`${definition.name} states what the base stated`, () => {
      const now = stated(definition);
      written[definition.name] = now;
      if (!WRITE) assert.deepEqual(now, expected[definition.name]);
    });
  }
});
