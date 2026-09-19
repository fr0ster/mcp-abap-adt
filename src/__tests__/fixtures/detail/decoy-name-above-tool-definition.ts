/**
 * Fixture for detailSurface.test.ts.
 *
 * An unrelated object carrying its own `name` property sits ABOVE the real
 * `TOOL_DEFINITION` — the exact shape fix round 2 proved defeats "the first
 * quoted `name:` in the file" as a way to resolve which tool a handler is.
 * `toolNameOf` must read `DecoyFixtureTool`, the real registered name, not
 * `NotTheToolName`, the decoy's.
 */
export const SOME_UNRELATED_CONSTANT = {
  name: 'NotTheToolName',
  description: 'Not a tool definition at all — just something with a name.',
};

export const TOOL_DEFINITION = {
  name: 'DecoyFixtureTool',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export function handleFixture() {
  return { success: true };
}
