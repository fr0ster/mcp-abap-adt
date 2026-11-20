/**
 * `HandlerGet`'s `part` is one of the parts it reads. The model's call names
 * it through the tool's schema: a part outside them is refused there, naming
 * the argument, and nothing is sent — it is never read as another part (a
 * service binding's URLs, say).
 */
import { describe, it } from 'node:test';
import { format } from 'node:util';
import { defineTool, noConnectionContext } from '@mcp-abap-adt/lib/handlers';
import { assertRejects } from '../../../src/__tests__/helpers/assertions';
import {
  handleHandlerGet,
  TOOL_DEFINITION,
} from '../handlers/handleHandlerGet';

// The process declares its system type, as every launcher requires.
process.env.SAP_SYSTEM_TYPE = 'onprem';

describe('HandlerGet: a part it does not read', () => {
  for (const [part] of [['nonsense'], [5]]) {
    it(
      format('refuses part %j at its schema, naming the argument', part),
      async () => {
        const refused = assertRejects(
          defineTool(TOOL_DEFINITION, handleHandlerGet).call(
            noConnectionContext(),
            {
              object_type: 'SERVICE_BINDING',
              service_binding_name: 'ZSB',
              part,
            },
          ),
          /Invalid arguments for tool HandlerGet: .* at part/,
        );
        await refused;
      },
    );
  }
});
