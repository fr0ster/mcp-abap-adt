import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { compactDebugEntries } from '../../../lib/compact/debug/group';
import { DebugHandlersGroup } from '../../../lib/handlers/groups/DebugHandlersGroup';
import type { ToolDefinition } from '../../../lib/handlers/interfaces';
import {
  declaredRequired,
  jsonAt,
  jsonFind,
  listedJson,
} from '../../helpers/listedJson';

/** A tool's own text and every parameter description, at any depth. */
const textsOf = (definition: ToolDefinition): string[] => {
  const found: string[] = [definition.description];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node === null || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'description' && typeof value === 'string') found.push(value);
      else walk(value);
    }
  };
  walk(listedJson(definition.inputSchema));
  return found;
};

const coreDebugTools = () =>
  new DebugHandlersGroup({} as never)
    .getHandlers()
    .map((e) => e.toolDefinition);

const START_TOOLS = ['DebugStartListener', 'DebugTakeOverListener'];

describe('the debugger descriptions', () => {
  it('no breakpoint description says every kind takes a condition', () => {
    // not.toEqual({ tool: tool.name, text: stringMatching(re) }) with the
    // same tool: the text does not match (named, spec §3.2).
    for (const tool of [
      ...coreDebugTools(),
      ...compactDebugEntries().map((e) => e.toolDefinition),
    ])
      for (const text of textsOf(tool))
        assert.doesNotMatch(
          text,
          /each with an optional condition|with an optional condition/,
          tool.name,
        );
  });

  it('the breakpoint descriptions say a line breakpoint may carry a condition', () => {
    const set = coreDebugTools().find((t) => t.name === 'DebugSetBreakpoints')!;
    assert.match(
      textsOf(set).join('\n'),
      /a line breakpoint may carry a condition/,
    );
  });

  it('the set is described as shared by the key and rewritten as a whole', () => {
    for (const name of ['DebugSetBreakpoints', ...START_TOOLS]) {
      const tool = coreDebugTools().find((t) => t.name === name)!;
      assert.match(
        textsOf(tool).join('\n'),
        /shared by every IDE of the same SAP user \(in user mode, debugging the same request user; in terminal mode, whatever its ids\)/,
      );
      assert.match(textsOf(tool).join('\n'), /rewrites that set as a whole/);
    }
  });

  it('no new parameter carries a default the boundary would fill in', () => {
    for (const name of [...START_TOOLS, 'DebugSetSettings']) {
      const tool = coreDebugTools().find((t) => t.name === name)!;
      const schema = listedJson(tool.inputSchema);
      for (const key of [
        'request_user',
        'debugging_mode',
        'settings',
        'system_debugging',
      ])
        if (jsonFind(schema, key)) {
          assert.deepStrictEqual(
            { key, default: jsonFind(schema, key)?.default },
            {
              key,
              default: undefined,
            },
          );
          for (const inner of Object.values(
            jsonFind(schema, key)?.properties ?? {},
          ))
            assert.equal(
              typeof inner === 'object' ? inner.default : undefined,
              undefined,
            );
        }
    }
  });

  // The AMDP session takes no mode and no request user: it is the connected user's.
  it('the AMDP tools name no request user and no mode', () => {
    const amdp = coreDebugTools().filter((t) => t.name.startsWith('Amdp'));
    assert.ok(amdp.length > 0);
    // not.toEqual({ tool: tool.name, text: stringMatching(re) }) with the
    // same tool: the text does not match (named, spec §3.2).
    for (const tool of amdp)
      for (const text of textsOf(tool))
        assert.doesNotMatch(
          text,
          /request user|request_user|user mode|terminal mode|debugging mode/i,
          tool.name,
        );
    for (const name of ['AmdpDebugStart', 'AmdpDebugSetBreakpoints'])
      assert.match(
        textsOf(amdp.find((t) => t.name === name)!).join('\n'),
        /every request of the connected SAP user/,
      );
  });

  it('the compact tools scope the request user to abap and give amdp the connected user', () => {
    const description = (name: string) =>
      compactDebugEntries().find((e) => e.toolDefinition.name === name)!
        .toolDefinition.description as string;
    assert.match(
      description('HandlerDebugBreakpoints'),
      /sets the ABAP breakpoints of this debugging identity/i,
    );
    assert.match(
      description('HandlerDebugSession'),
      /starts an AMDP debug session/,
    );
  });

  // The user's decision (2026-10-11): a start without breakpoints is refused, so a
  // model that forgets them learns it at once instead of waiting on a listener
  // that can catch nothing of its own.
  it('both starts require at least one breakpoint, and say so', () => {
    for (const name of START_TOOLS) {
      const tool = coreDebugTools().find((t) => t.name === name)!;
      const schema = listedJson(tool.inputSchema);
      assert.ok(
        declaredRequired(tool.inputSchema).some((e) =>
          isDeepStrictEqual(e, 'breakpoints'),
        ),
        name,
      );
      assert.equal(jsonAt(schema, 'breakpoints').minItems, 1);
      assert.match(textsOf(tool).join('\n'), /at least one breakpoint/);
    }
  });
});
