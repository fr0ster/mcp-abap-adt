/**
 * `HandlerGet`'s `part` is one of the parts it reads. The model's call names
 * it through the tool's schema: a part outside them is refused there, naming
 * the argument, and nothing is sent — it is never read as another part (a
 * service binding's URLs, say).
 */
import { defineTool, noConnectionContext } from '@mcp-abap-adt/lib/handlers';
import {
  handleHandlerGet,
  TOOL_DEFINITION,
} from '../handlers/handleHandlerGet';

// The process declares its system type, as every launcher requires.
process.env.SAP_SYSTEM_TYPE = 'onprem';

describe('HandlerGet: a part it does not read', () => {
  it.each([['nonsense'], [5]])(
    'refuses part %j at its schema, naming the argument',
    async (part) => {
      const refused = expect(
        defineTool(TOOL_DEFINITION, handleHandlerGet).call(
          noConnectionContext(),
          {
            object_type: 'SERVICE_BINDING',
            service_binding_name: 'ZSB',
            part,
          },
        ),
      ).rejects.toThrow(/Invalid arguments for tool HandlerGet: .* at part/);
      await refused;
    },
  );
});
