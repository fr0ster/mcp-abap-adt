/**
 * `servedEntries` (`helpers/servedEntries.ts`): the entries a system kind
 * serves, by tool name, as the pin harness and the live files read them. The
 * module imports no test runner (D27, plan step 9), so a node:test file reaches
 * it: this file is on the node:test list, and the node:test build refuses it
 * when the module reaches the Jest pin harness (`helpers/pinCases.ts`) or any
 * other Jest API.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listedTool, statedEnvironment } from '../../../lib/listedTool';
import { servedEntries } from '../../helpers/servedEntries';
import type { SystemKind } from '../../helpers/servedTools';

const KINDS: readonly SystemKind[] = ['onprem', 'cloud'];

describe('servedEntries', () => {
  for (const kind of KINDS) {
    it(`${kind}: every entry is listed for the kind, under its own name`, () => {
      const entries = servedEntries(kind);
      assert.ok(entries.size > 0, `${kind} serves no entry`);
      const environment = statedEnvironment(kind);
      for (const [name, entry] of entries) {
        assert.equal(entry.toolDefinition.name, name);
        assert.equal(
          listedTool(entry.toolDefinition, environment).listed,
          true,
          `${kind}: ${name} is not listed`,
        );
      }
    });

    it(`${kind}: read once, the same map after`, () => {
      assert.equal(servedEntries(kind), servedEntries(kind));
    });
  }

  it('the two kinds serve different tool sets', () => {
    assert.notDeepEqual(
      [...servedEntries('onprem').keys()],
      [...servedEntries('cloud').keys()],
    );
  });
});
