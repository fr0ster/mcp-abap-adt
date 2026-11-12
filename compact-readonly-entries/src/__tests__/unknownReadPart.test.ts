/**
 * `HandlerGet`'s `part` is one of the parts it reads. A part outside them —
 * reaching the handler past its schema, as an embedder's call can — is
 * refused in words naming the parts, and nothing is sent: it is never read as
 * another part (a service binding's URLs, say).
 */
import { noConnectionContext } from '@mcp-abap-adt/lib/handlers';
import { handleHandlerGet } from '../handlers/handleHandlerGet';

// The process declares its system type, as every launcher requires.
process.env.SAP_SYSTEM_TYPE = 'onprem';

describe('HandlerGet: a part it does not read', () => {
  it.each([['nonsense'], [5]])(
    'refuses part %j, naming its parts',
    async (part) => {
      const answered = await handleHandlerGet(noConnectionContext(), {
        object_type: 'SERVICE_BINDING',
        service_binding_name: 'ZSB',
        part,
      });
      const content: unknown = JSON.parse(JSON.stringify(answered));
      expect(content).toMatchObject({ isError: true });
      const words = JSON.stringify(content);
      expect(words).toContain(
        `part=${String(part)} is not a part HandlerGet reads`,
      );
      expect(words).toContain(
        'source, metadata, urls, contents, main_programs, object_structure',
      );
      expect(words).not.toContain('No connection');
    },
  );
});
