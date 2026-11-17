/**
 * CreateDomain cannot create a domain without its package: the schema
 * requires `package_name`, so a call without it is refused before the
 * handler runs, naming the argument.
 */
import {
  handleCreateDomain,
  TOOL_DEFINITION,
} from '../../handlers/domain/high/handleCreateDomain';
import { defineTool } from '../../lib/handlers/interfaces';
import { noConnectionContext } from '../../lib/handlers/registry/expositionRegistry';
import { declaredRequired } from '../helpers/listedJson';

describe('CreateDomain requires package_name', () => {
  it('the schema requires it', () => {
    expect(declaredRequired(TOOL_DEFINITION.inputSchema)).toEqual([
      'domain_name',
      'package_name',
    ]);
  });

  it('a call without it is refused by the schema, the handler not run', async () => {
    const entry = defineTool(TOOL_DEFINITION, handleCreateDomain);
    await expect(
      entry.call(noConnectionContext(), { domain_name: 'ZDOM_A' }),
    ).rejects.toThrow(
      'Invalid arguments for tool CreateDomain: Invalid input: expected string, received undefined at package_name',
    );
  });
});
