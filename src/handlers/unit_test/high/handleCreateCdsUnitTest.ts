/**
 * CreateCdsUnitTest Handler - Create CDS unit test class via AdtClient
 *
 * Uses AdtClient.getCdsUnitTest().validate() and .create() for CDS-specific lifecycle.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateCdsUnitTest',
  description:
    'Create a CDS unit test class with CDS validation, class template, and local test class source.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Global test class name (e.g., ZCL_CDS_TEST).',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_TEST_PKG_01, $TMP).',
      },
      cds_view_name: {
        type: 'string',
        description: 'CDS view name to validate for unit test doubles.',
      },
      class_template: {
        type: 'string',
        description: 'ABAP class template used for CDS unit tests.',
      },
      test_class_source: {
        type: 'string',
        description: 'Local test class ABAP source code.',
      },
      description: {
        type: 'string',
        description: 'Optional description for the global test class.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (required for transportable packages).',
      },
    },
    required: [
      'class_name',
      'package_name',
      'cds_view_name',
      'class_template',
      'test_class_source',
    ],
  },
} as const;

interface CreateCdsUnitTestArgs {
  class_name: string;
  package_name: string;
  cds_view_name: string;
  class_template: string;
  test_class_source: string;
  description?: string;
  transport_request?: string;
}

/**
 * Main handler for CreateCdsUnitTest MCP tool
 *
 * Uses AdtClient.getCdsUnitTest().validate() and .create()
 */
export async function handleCreateCdsUnitTest(
  context: HandlerContext,
  args: CreateCdsUnitTestArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      class_name,
      package_name,
      cds_view_name,
      class_template,
      test_class_source,
      description,
      transport_request,
    } = args as CreateCdsUnitTestArgs;

    if (
      !class_name ||
      !package_name ||
      !cds_view_name ||
      !class_template ||
      !test_class_source
    ) {
      return return_error(
        new Error(
          'Missing required parameters: class_name, package_name, cds_view_name, class_template, test_class_source',
        ),
      );
    }

    const className = class_name.toUpperCase();
    const cdsViewName = cds_view_name.toUpperCase();

    const client = new AdtClient(connection, logger);
    const cdsUnitTest = client.getCdsUnitTest();

    logger?.info(
      `Creating CDS unit test class ${className} for CDS view ${cdsViewName}`,
    );

    try {
      await cdsUnitTest.validate({ cdsViewName });

      const createResult = await cdsUnitTest.create({
        className,
        packageName: package_name,
        cdsViewName,
        classTemplate: class_template,
        testClassSource: test_class_source,
        description,
        transportRequest: transport_request,
      });

      if (!createResult?.testClassState) {
        throw new Error(
          `Create did not return a response for CDS unit test class ${className}`,
        );
      }

      logger?.info(`✅ CreateCdsUnitTest completed successfully: ${className}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            class_name: className,
            cds_view_name: cdsViewName,
            test_class_state: createResult.testClassState,
            message: `CDS unit test class ${className} created successfully.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error creating CDS unit test class ${className}: ${error?.message || error}`,
      );
      return return_error(new Error(error?.message || String(error)));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
