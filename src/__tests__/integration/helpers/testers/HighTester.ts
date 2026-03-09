/**
 * HighTester - Compatibility wrapper for LambdaTester
 *
 * This is a temporary compatibility layer for tests that haven't been migrated yet.
 * All tests should eventually be migrated to use LambdaTester directly.
 *
 * @deprecated Use LambdaTester instead
 */

import type { HandlerContext } from '../../../../lib/handlers/interfaces';
import { getCleanupAfter } from '../configHelpers';
import type { LoggerWithExtras } from '../loggerHelpers';
import { createHandlerContext, delay } from '../testHelpers';
import {
  callTool,
  isHardModeEnabled,
  resolveEntityFromHandlerName,
  toolCandidates,
} from './hardMode';
import { LambdaTester, type TLambda } from './LambdaTester';
import type { LambdaTesterContext } from './types';

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
    workflowFunctions: HighWorkflowFunctions,
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
          if (isHardModeEnabled()) {
            const entity = resolveEntityFromHandlerName(
              (this as any).handlerName || '',
            );
            const mcp = await this.getHardModeClient();
            const deleteArgs = this.buildDeleteArgs(context);
            await callTool(
              mcp.client,
              mcp.toolNames,
              toolCandidates('delete', entity, 'high', this.handlerName),
              deleteArgs,
            );
            logger?.success?.(`✅ cleanup: deleted ${objectName} successfully`);
            return;
          }

          const handlerContext = createHandlerContext({
            connection,
            logger: logger || undefined,
          });
          const deleteArgs = this.buildDeleteArgs(context);
          const deleteResponse = await deleteFunction(
            handlerContext,
            deleteArgs,
          );

          if (deleteResponse?.isError) {
            const errorMsg =
              deleteResponse.content?.[0]?.text || 'Unknown error';
            logger?.error?.(
              `Delete failed: ${errorMsg}. Object left in SAP system.`,
            );
          } else {
            logger?.success?.(`✅ cleanup: deleted ${objectName} successfully`);
          }
        } catch (error: any) {
          logger?.error?.(
            `Cleanup delete error: ${error?.message || String(error)}. Object left in SAP system.`,
          );
        }
      };
      return;
    }

    // Cleanup lambda is mandatory - either provide it or include delete function in workflowFunctions
    throw new Error(
      'Cleanup lambda is mandatory. Either provide cleanupAfter lambda in beforeAll() method, ' +
        'or include delete function in workflowFunctions. The test decides whether to run it via YAML config (skip_cleanup or cleanup_after flags).',
    );
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

    if (isHardModeEnabled()) {
      await this.runInHardMode();
      return;
    }

    const handlerContext = createHandlerContext({
      connection: this.context.connection,
      logger: this.context.logger,
    });
    const logger = this.context.logger;

    try {
      // Execute create workflow
      if (this.workflowFunctions.create) {
        logger?.info(`   • create ${this.context.objectName}`);
        const args = this.buildCreateArgs(this.context);
        await this.retryOnConflict(
          () => this.workflowFunctions!.create(handlerContext, args),
          `Create ${this.context.objectName}`,
          logger,
        );
        logger?.info(`   ✅ create completed`);
      }

      // Execute update workflow
      if (this.workflowFunctions.update) {
        logger?.info(`   • update ${this.context.objectName}`);
        const args = this.buildUpdateArgs(this.context);
        await this.retryOnConflict(
          () => this.workflowFunctions!.update(handlerContext, args),
          `Update ${this.context.objectName}`,
          logger,
        );
        logger?.info(`   ✅ update completed`);
      }
    } catch (error: any) {
      // Check if error is a skip condition
      if (error.message?.startsWith('SKIP:')) {
        const skipReason = error.message.replace(/^SKIP:\s*/, '');
        this.context.logger?.testSkip(`Skipping test: ${skipReason}`);
        return;
      }

      this.context.logger?.error(`❌ Test failed: ${error.message}`);
      throw error;
    }
  }

  private async runInHardMode(): Promise<void> {
    if (!this.context) {
      throw new Error('Tester not initialized. Call beforeAll() first.');
    }
    const logger = this.context.logger;
    const entity = resolveEntityFromHandlerName(
      (this as any).handlerName || '',
    );
    const mcp = await this.getHardModeClient();

    try {
      if (this.workflowFunctions?.create) {
        logger?.info(`   • create ${this.context.objectName} (hard mode)`);
        const args = this.buildCreateArgs(this.context);
        await this.retryOnConflict(
          () =>
            callTool(
              mcp.client,
              mcp.toolNames,
              toolCandidates('create', entity, 'high', this.handlerName),
              args,
            ),
          `Create ${this.context.objectName} (hard mode)`,
          logger,
        );
        logger?.info(`   ✅ create completed`);
      }

      if (this.workflowFunctions?.update) {
        logger?.info(`   • update ${this.context.objectName} (hard mode)`);
        const args = this.buildUpdateArgs(this.context);
        await this.retryOnConflict(
          () =>
            callTool(
              mcp.client,
              mcp.toolNames,
              toolCandidates('update', entity, 'high', this.handlerName),
              args,
            ),
          `Update ${this.context.objectName} (hard mode)`,
          logger,
        );
        logger?.info(`   ✅ update completed`);
      }
    } catch (error: any) {
      if (error.message?.startsWith('SKIP:')) {
        const skipReason = error.message.replace(/^SKIP:\s*/, '');
        this.context.logger?.testSkip(`Skipping test: ${skipReason}`);
        return;
      }

      this.context.logger?.error(`❌ Test failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Retry operation on HTTP 409 Conflict (TADIR stale entry).
   * SAP BTP Cloud trial can return 409/TK754 after delete+create due to stale TADIR entries.
   * SAP's own recommendation: "Repeat the function."
   */
  private async retryOnConflict<T>(
    operation: () => Promise<T>,
    label: string,
    logger?: LoggerWithExtras | null,
    maxRetries = 2,
    delayMs = 3000,
  ): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        const isTadirConflict =
          error.response?.status === 409 ||
          (typeof error.message === 'string' &&
            error.message.includes('object directory entry'));
        if (isTadirConflict && attempt < maxRetries) {
          logger?.warn?.(
            `⚠️ ${label}: TADIR conflict (stale entry), retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`,
          );
          await delay(delayMs);
          continue;
        }
        throw error;
      }
    }
    throw new Error(`${label}: exceeded max retries`);
  }

  private buildCreateArgs(context: LambdaTesterContext): any {
    const { objectName, params, packageName, transportRequest, session } =
      context;
    const nameField = this.getCreateUpdateNameField();
    return {
      [nameField]: objectName,
      package_name: packageName,
      description: params.description || objectName,
      ...(params.ddl_code && { ddl_code: params.ddl_code }),
      ...(params.source_code && { source_code: params.source_code }),
      ...(params.superclass && { superclass: params.superclass }),
      // BehaviorDefinition specific
      ...(params.root_entity && { root_entity: params.root_entity }),
      ...(params.implementation_type && {
        implementation_type: params.implementation_type,
      }),
      // BehaviorImplementation specific
      ...(params.behavior_definition && {
        behavior_definition: params.behavior_definition,
      }),
      ...(params.implementation_code && {
        implementation_code: params.implementation_code,
      }),
      // Data element specific fields
      ...(params.type_kind && { type_kind: params.type_kind }),
      ...(params.data_type && { data_type: params.data_type }),
      ...(params.length !== undefined && { length: params.length }),
      ...(params.decimals !== undefined && { decimals: params.decimals }),
      ...(params.short_label && { short_label: params.short_label }),
      ...(params.medium_label && { medium_label: params.medium_label }),
      ...(params.long_label && { long_label: params.long_label }),
      ...(params.heading_label && { heading_label: params.heading_label }),
      // Structure specific fields
      ...(params.fields && { fields: params.fields }),
      // Domain specific fields
      ...(params.datatype && { datatype: params.datatype }),
      ...(params.lowercase !== undefined && { lowercase: params.lowercase }),
      ...(params.sign_exists !== undefined && {
        sign_exists: params.sign_exists,
      }),
      // ServiceDefinition specific
      ...(params.ddl_source && { ddl_source: params.ddl_source }),
      // FunctionGroup specific
      ...(params.function_group_name && {
        function_group_name: params.function_group_name,
      }),
      ...(params.function_group_description && {
        function_group_description: params.function_group_description,
      }),
      ...(params.function_module_name && {
        function_module_name: params.function_module_name,
      }),
      ...(params.function_module_description && {
        function_module_description: params.function_module_description,
      }),
      ...(transportRequest && { transport_request: transportRequest }),
      ...(session?.session_id && { session_id: session.session_id }),
      ...(session?.session_state && { session_state: session.session_state }),
    };
  }

  private buildUpdateArgs(context: LambdaTesterContext): any {
    const { objectName, params, packageName, transportRequest, session } =
      context;
    const nameField = this.getCreateUpdateNameField();
    return {
      [nameField]: objectName,
      ...(packageName && { package_name: packageName }),
      ...(transportRequest && { transport_request: transportRequest }),
      ...(params.update_ddl_code && { ddl_code: params.update_ddl_code }),
      ...(params.ddl_code &&
        !params.update_ddl_code && { ddl_code: params.ddl_code }),
      ...(params.source_code && { source_code: params.source_code }),
      ...(params.update_source_code && {
        source_code: params.update_source_code,
      }),
      ...(params.update_description && {
        description: params.update_description,
      }),
      // BehaviorDefinition specific for update
      ...(params.root_entity && { root_entity: params.root_entity }),
      // BehaviorImplementation specific for update
      ...(params.behavior_definition && {
        behavior_definition: params.behavior_definition,
      }),
      ...(params.update_implementation_code && {
        implementation_code: params.update_implementation_code,
      }),
      ...(params.implementation_code &&
        !params.update_implementation_code && {
          implementation_code: params.implementation_code,
        }),
      // Data element specific fields for update
      ...(params.type_kind && { type_kind: params.type_kind }),
      ...(params.data_type && { data_type: params.data_type }),
      ...(params.length !== undefined && { length: params.length }),
      ...(params.decimals !== undefined && { decimals: params.decimals }),
      // Structure specific fields for update
      ...(params.fields && { fields: params.fields }),
      // Domain specific fields for update
      ...(params.datatype && { datatype: params.datatype }),
      ...(params.lowercase !== undefined && { lowercase: params.lowercase }),
      ...(params.sign_exists !== undefined && {
        sign_exists: params.sign_exists,
      }),
      // ServiceDefinition specific for update
      ...(params.update_ddl_source && {
        ddl_source: params.update_ddl_source,
      }),
      ...(params.ddl_source &&
        !params.update_ddl_source && { ddl_source: params.ddl_source }),
      ...(session?.session_id && { session_id: session.session_id }),
      ...(session?.session_state && { session_state: session.session_state }),
    };
  }

  private buildDeleteArgs(context: LambdaTesterContext): any {
    const { objectName, transportRequest, session } = context;
    const nameField = this.getNameField();
    return {
      [nameField]: objectName,
      ...(transportRequest && { transport_request: transportRequest }),
      ...(session?.session_id && { session_id: session.session_id }),
      ...(session?.session_state && { session_state: session.session_state }),
    };
  }

  /**
   * Returns the name field used for DELETE operations.
   * May differ from the create/update name field for some types.
   */
  private getNameField(): string {
    const handlerName = (this as any).handlerName || '';
    // behavior_implementation must be checked before behavior_definition (substring)
    if (handlerName.includes('behavior_implementation')) return 'class_name';
    if (handlerName.includes('behavior_definition'))
      return 'behavior_definition_name';
    if (handlerName.includes('data_element')) return 'data_element_name';
    if (handlerName.includes('metadata_extension')) return 'ddlx_name';
    if (handlerName.includes('service_definition'))
      return 'service_definition_name';
    if (handlerName.includes('class')) return 'class_name';
    if (handlerName.includes('table')) return 'table_name';
    if (handlerName.includes('view')) return 'view_name';
    if (handlerName.includes('program')) return 'program_name';
    if (handlerName.includes('interface')) return 'interface_name';
    if (handlerName.includes('domain')) return 'domain_name';
    if (handlerName.includes('structure')) return 'structure_name';
    if (handlerName.includes('function')) return 'function_name';
    return 'name'; // fallback
  }

  /**
   * Returns the name field used for CREATE and UPDATE operations.
   * For some types this differs from the delete name field.
   */
  private getCreateUpdateNameField(): string {
    const handlerName = (this as any).handlerName || '';
    // behavior_implementation: create/update use class_name (same as delete)
    if (handlerName.includes('behavior_implementation')) return 'class_name';
    // behavior_definition: create/update use 'name', delete uses 'behavior_definition_name'
    if (handlerName.includes('behavior_definition')) return 'name';
    return this.getNameField();
  }

  // Compatibility methods - HighTester doesn't use lambdas for lifecycle hooks
  async afterAll(): Promise<void> {
    await super.afterAll(async () => {});
  }

  async beforeEach(): Promise<void> {
    // Pre-cleanup: Remove leftover objects from previous failed tests
    const shouldCleanup = getCleanupAfter(this.testCase);
    if (shouldCleanup && this.cleanupAfterLambda && this.context) {
      try {
        this.context.logger?.debug?.(
          '🧹 Running pre-cleanup (removing leftover objects)...',
        );
        await this.cleanupAfterLambda(this.context);
        this.context.logger?.debug?.('✅ Pre-cleanup completed');
        // Wait for SAP to propagate the deletion before starting the test
        const cleanupDelay = this.context.getOperationDelay('cleanup');
        if (cleanupDelay > 0) {
          this.context.logger?.debug?.(
            `⏳ Waiting ${cleanupDelay}ms for SAP to propagate cleanup...`,
          );
          await delay(cleanupDelay);
        }
      } catch (error: any) {
        // Pre-cleanup errors are non-fatal - object might not exist
        this.context.logger?.debug?.(
          `⚠️ Pre-cleanup warning (ignored): ${error?.message || String(error)}`,
        );
      }
    }
  }

  async afterEach(): Promise<void> {
    // HighTester compatibility - cleanup handled by cleanupAfter
    // Use this.cleanupAfter() to ensure YAML parameter checking works correctly
    await this.cleanupAfter();
  }
}
