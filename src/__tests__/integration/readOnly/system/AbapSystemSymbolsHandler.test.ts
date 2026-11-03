/**
 * GetAbapSystemSymbols resolves a function module: its group found by a
 * repository search, its source read at that group.
 *
 * Where it runs: the SAP system the test config names (tests/test-config.yaml,
 * or the file `MCP_TEST_CONFIG` names), on premise or ABAP cloud, where the
 * config's shared function module `Z_MCP_BLD_SHR_FM` is served (its
 * `available_in`) and exists (shared:setup). Without a configuration,
 * connection or session, or without that module, the case skips, saying why.
 * It only reads, on both paths: in ADT batch envelopes (a fresh port) and one
 * request after another (a port known to have no communication batch).
 *
 * Run: npm test -- --testPathIgnorePatterns='__tests__/admin/' --runInBand --forceExit src/__tests__/integration/readOnly/system/AbapSystemSymbolsHandler.test.ts
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { handleGetAbapSystemSymbols } from '../../../../handlers/system/readonly/handleGetAbapSystemSymbols';
import { createBatchAvailability } from '../../../../lib/batch/availability';
import {
  getSystemType,
  getTimeout,
  isTestAvailableForSystem,
  resolveSharedDependency,
} from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { createTestConnectionAndSession } from '../../helpers/sessionHelpers';
import { createHandlerContext } from '../../helpers/testHelpers';

const testLogger = createTestLogger('get-abap-system-symbols');

describe('GetAbapSystemSymbols resolves a function module (read-only)', () => {
  let connection: IAbapConnection | undefined;

  beforeAll(async () => {
    try {
      connection = (await createTestConnectionAndSession()).connection;
    } catch {
      testLogger?.warn('⚠️ Skipping tests: no SAP configuration found');
    }
  });

  it.each(['batched', 'sequential'] as const)(
    'finds the shared function module in its group (%s)',
    async (path) => {
      if (connection === undefined) {
        testLogger?.info('⏭️  Skipping test: no configuration or connection');
        return;
      }
      const shared = resolveSharedDependency(
        'function_modules',
        'Z_MCP_BLD_SHR_FM',
      );
      if (!shared) {
        testLogger?.info('⏭️  Skipping test: no shared function module');
        return;
      }
      if (!isTestAvailableForSystem(shared.available_in)) {
        testLogger?.info(`⏭️  Skipping test: not served on ${getSystemType()}`);
        return;
      }
      const name = String(shared.name).toUpperCase();
      const group = String(shared.group).toUpperCase();

      const port = createBatchAvailability();
      if (path === 'sequential') port.noteOuterStatus(404);
      const context = {
        ...createHandlerContext({ connection, logger: testLogger }),
        batchAvailability: port,
      };
      const result = await handleGetAbapSystemSymbols(context, {
        code: `FUNCTION ${name.toLowerCase()}.\nENDFUNCTION.`,
      });

      const content: unknown = JSON.parse(JSON.stringify(result.content));
      expect(result.isError).toBe(false);
      expect(content).toMatchObject([
        {
          type: 'json',
          json: {
            symbols: [
              {
                name,
                type: 'function',
                systemInfo: {
                  exists: true,
                  objectType: 'FUNC',
                  functionGroup: group,
                },
              },
            ],
          },
        },
      ]);
    },
    getTimeout('medium'),
  );
});
