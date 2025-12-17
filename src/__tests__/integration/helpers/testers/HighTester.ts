/**
 * HighTester - Compatibility wrapper for LambdaTester
 *
 * This is a temporary compatibility layer for tests that haven't been migrated yet.
 * All tests should eventually be migrated to use LambdaTester directly.
 *
 * @deprecated Use LambdaTester instead
 */

import { LambdaTester, type TLambda } from './LambdaTester';
import type { LambdaTesterContext } from './types';
import type { HandlerContext } from '../../../../lib/handlers/interfaces';
import { createHandlerContext } from '../testHelpers';

// Handler function type: (context: HandlerContext, args: any) => Promise<any>
type HandlerFunction = (context: HandlerContext, args: any) => Promise<any>;

export type HighWorkflowFunctions = {
  create: HandlerFunction;
  update: HandlerFunction;
  delete?: HandlerFunction;
};

/**
 * @deprecated Use LambdaTester instead
 */
export class HighTester extends LambdaTester {
  private workflowFunctions?: HighWorkflowFunctions;

  constructor(
    handlerName: string,
    testCaseName: string,
    logPrefix: string,
    workflowFunctions: HighWorkflowFunctions
  ) {
    super(handlerName, testCaseName, logPrefix);
    this.workflowFunctions = workflowFunctions;
  }

  /**
   * Initialize tester and set cleanup lambda
   * Cleanup lambda must be provided by the test, or will be auto-generated from delete function if available
   * @param cleanupAfter - Optional cleanup lambda (checks YAML params before executing)
   *                       If not provided and delete function exists, cleanup lambda will be auto-generated.
   *                       Each test must have cleanup lambda set up. Test decides whether to run it via YAML config.
   */
  async beforeAll(cleanupAfter?: TLambda): Promise<void> {
    await this.init();
    if (!this.context) {
      throw new Error('Context not initialized');
    }

    // If cleanup lambda is provided, use it
    if (cleanupAfter) {
      this.cleanupAfterLambda = cleanupAfter;
      return;
    }

    // If no cleanup lambda provided, try to auto-generate from delete function
    if (this.workflowFunctions?.delete) {
      const deleteFunction = this.workflowFunctions.delete;
      this.cleanupAfterLambda = async (context: LambdaTesterContext) => {
        const { connection, objectName, transportRequest, logger } = context;
        if (!objectName) return;

        logger?.info?.(`   • cleanup: delete ${objectName}`);
        try {
          const handlerContext = createHandlerContext({
            connection,
            logger: logger || undefined
          });
          const deleteArgs = this.buildDeleteArgs(context);
          const deleteResponse = await deleteFunction(handlerContext, deleteArgs);

          if (deleteResponse?.isError) {
            const errorMsg = deleteResponse.content?.[0]?.text || 'Unknown error';
            logger?.warn?.(`Delete failed (ignored in cleanup): ${errorMsg}`);
          } else {
            logger?.success?.(`✅ cleanup: deleted ${objectName} successfully`);
          }
        } catch (error: any) {
          logger?.warn?.(`Cleanup delete error (ignored): ${error?.message || String(error)}`);
        }
      };
      return;
    }

    // Cleanup lambda is mandatory - either provide it or include delete function in workflowFunctions
    throw new Error('Cleanup lambda is mandatory. Either provide cleanupAfter lambda in beforeAll() method, ' +
      'or include delete function in workflowFunctions. The test decides whether to run it via YAML config (skip_cleanup or cleanup_after flags).');
  }

  async run(): Promise<void> {
    if (!this.context) {
      throw new Error('Tester not initialized. Call beforeAll() first.');
    }

    if (!this.context.hasConfig) {
      this.context.logger?.testSkip(`Skipping test: No configuration found`);
      return;
    }

    if (!this.workflowFunctions) {
      throw new Error('Workflow functions not provided');
    }

    const handlerContext = createHandlerContext({
      connection: this.context.connection,
      logger: this.context.logger
    });

    try {
      // Execute create workflow
      if (this.workflowFunctions.create) {
        const args = this.buildCreateArgs(this.context);
        await this.workflowFunctions.create(handlerContext, args);
      }

      // Execute update workflow
      if (this.workflowFunctions.update) {
        const args = this.buildUpdateArgs(this.context);
        await this.workflowFunctions.update(handlerContext, args);
      }
    } catch (error: any) {
      // Check if error is a skip condition
      if (error.message && error.message.startsWith('SKIP:')) {
        const skipReason = error.message.replace(/^SKIP:\s*/, '');
        this.context.logger?.testSkip(`Skipping test: ${skipReason}`);
        return;
      }

      this.context.logger?.error(`❌ Test failed: ${error.message}`);
      throw error;
    }
  }

  private buildCreateArgs(context: LambdaTesterContext): any {
    const { objectName, params, packageName, transportRequest, session } = context;
    const nameField = this.getNameField();
    return {
      [nameField]: objectName,
      package_name: packageName,
      description: params.description || objectName,
      ...(params.ddl_code && { ddl_code: params.ddl_code }),
      ...(params.source_code && { source_code: params.source_code }),
      ...(params.superclass && { superclass: params.superclass }),
      ...(transportRequest && { transport_request: transportRequest }),
      ...(session?.session_id && { session_id: session.session_id }),
      ...(session?.session_state && { session_state: session.session_state })
    };
  }

  private buildUpdateArgs(context: LambdaTesterContext): any {
    const { objectName, params, session } = context;
    const nameField = this.getNameField();
    return {
      [nameField]: objectName,
      ...(params.ddl_code && { ddl_code: params.ddl_code }),
      ...(params.source_code && { source_code: params.source_code }),
      ...(params.update_source_code && { source_code: params.update_source_code }),
      ...(session?.session_id && { session_id: session.session_id }),
      ...(session?.session_state && { session_state: session.session_state })
    };
  }

  private buildDeleteArgs(context: LambdaTesterContext): any {
    const { objectName, transportRequest, session } = context;
    const nameField = this.getNameField();
    return {
      [nameField]: objectName,
      ...(transportRequest && { transport_request: transportRequest }),
      ...(session?.session_id && { session_id: session.session_id }),
      ...(session?.session_state && { session_state: session.session_state })
    };
  }

  private getNameField(): string {
    // Determine name field based on handler name
    const handlerName = (this as any).handlerName || '';
    if (handlerName.includes('class')) return 'class_name';
    if (handlerName.includes('table')) return 'table_name';
    if (handlerName.includes('view')) return 'view_name';
    if (handlerName.includes('program')) return 'program_name';
    if (handlerName.includes('interface')) return 'interface_name';
    if (handlerName.includes('domain')) return 'domain_name';
    if (handlerName.includes('data_element')) return 'data_element_name';
    if (handlerName.includes('structure')) return 'structure_name';
    if (handlerName.includes('function')) return 'function_name';
    if (handlerName.includes('behavior_definition')) return 'bdef_name';
    if (handlerName.includes('behavior_implementation')) return 'bimp_name';
    if (handlerName.includes('metadata_extension')) return 'ddlx_name';
    if (handlerName.includes('service_definition')) return 'service_definition_name';
    return 'name'; // fallback
  }

  // Compatibility methods - HighTester doesn't use lambdas for lifecycle hooks
  async afterAll(): Promise<void> {
    // HighTester compatibility - no lambda needed
  }

  async beforeEach(): Promise<void> {
    // HighTester compatibility - no lambda needed
  }

  async afterEach(): Promise<void> {
    // HighTester compatibility - cleanup handled by cleanupAfter
    // Use this.cleanupAfter() to ensure YAML parameter checking works correctly
    await this.cleanupAfter();
  }
}
