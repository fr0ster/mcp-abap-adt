/**
 * Every text that tells the model to send a state_handle names the argument,
 * the x-mcp-state-handle header as the alternative for clients that set
 * headers (#308, spec §1): the held-lock refusal and the descriptions of the
 * tools that answer or need a handle.
 */
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import { LOCK_NOT_HELD_WORDS } from '../../../lib/state/heldLocks';
import { compactToolSetOf, fullToolSet } from '../../../lib/toolSet';

// The spec's words, copied here, never imported: the test is the copy.
const NOT_HELD_WORDS =
  'lock_handle is not held by this instance: send the state_handle HandlerLock answered as the state_handle argument (or in the x-mcp-state-handle header)';
const ARGUMENT = 'send it as the state_handle argument of every call';
const HEADER = '(or in the x-mcp-state-handle header)';

const TOOLS = [
  'HandlerLock',
  'HandlerUpdate',
  'HandlerDelete',
  'HandlerUnlock',
  'HandlerBatch',
  'BatchBegin',
  'DebugBatchBegin',
  'HandlerDebugBatch',
];

const descriptions = new Map(
  [
    fullToolSet,
    compactToolSetOf({
      readOnly: compactReadOnlyEntries,
      modify: compactModifyEntries,
    }),
  ]
    .flatMap((set) => set.groups({ connection: undefined as never }, 'http'))
    .flatMap((group) => group.getHandlers())
    .map((entry) => [
      entry.toolDefinition.name,
      entry.toolDefinition.description,
    ]),
);

describe('the texts that ask for a state_handle name the argument', () => {
  it('the held-lock refusal', () => {
    expect(LOCK_NOT_HELD_WORDS).toBe(NOT_HELD_WORDS);
  });

  it.each(TOOLS)(
    '%s names the argument, the header as the alternative',
    (tool) => {
      const description = descriptions.get(tool);
      expect(description).toContain(ARGUMENT);
      expect(description).toContain(HEADER);
      // Never the header alone, as before.
      expect(description).not.toContain(
        'send in the x-mcp-state-handle header',
      );
      expect(description).not.toContain(
        "carries the lock's state_handle in the x-mcp-state-handle header",
      );
      expect(description).not.toContain(
        'send it in the x-mcp-state-handle header',
      );
    },
  );
});
