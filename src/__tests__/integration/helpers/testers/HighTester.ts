/**
 * HighTester - Test class for high-level handler workflows
 *
 * Executes high-level workflow: Create (with activate) → Update (with activate)
 * Handles cleanup: Delete (if needed)
 */

import { BaseTester } from './BaseTester';
import {
  parseHandlerResponse,
  delay,
  extractErrorMessage
} from '../testHelpers';
import {
  updateSessionFromResponse
} from '../sessionHelpers';

import type { HighWorkflowFunctions, TesterContext } from './types';

// Re-export for convenience
export type { TesterContext, HighWorkflowFunctions } from './types';

// Support both old handler functions and new workflow functions
export type HighHandlerFunctions =
  | HighWorkflowFunctions  // New: workflow functions with context
  | {
      create: (connection: any, args: any) => Promise<any>;
      update: (connection: any, args: any) => Promise<any>;
      delete?: (connection: any, args: any) => Promise<any>;
    };  // Old: handler functions

export class HighTester extends BaseTester {
  // Handler functions (must be provided by subclass or via constructor)
  protected handlers: HighHandlerFunctions;

  // Object tracking
  protected objectWasCreated: boolean = false;

  // Object name (resolved from test params)
  protected objectName: string | null = null;

  /**
   * Constructor
   * @param handlerName - Name of the handler (e.g., 'create_class_high')
   * @param testCaseName - Name of the test case (e.g., 'create_and_update')
   * @param logPrefix - Prefix for log messages (e.g., 'class-high')
   * @param handlers - Handler functions for create, update, delete
   * @param paramsGroupName - Optional: Name of parameter group in YAML
   */
  constructor(
    handlerName: string,
    testCaseName: string,
    logPrefix: string,
    handlers: HighHandlerFunctions,
    paramsGroupName?: string
  ) {
    super(handlerName, testCaseName, logPrefix, paramsGroupName);
    this.handlers = handlers;
  }

  /**
   * Lifecycle: beforeEach
   * Prepares test case and resolves object name
   */
  async beforeEach(): Promise<void> {
    await super.beforeEach();
    if (this.testCase) {
      const params = this.getTestParams();
      // Try common parameter names for object name
      this.objectName = params.name || params.class_name || params.interface_name ||
                        params.function_name || params.program_name || params.table_name ||
                        params.view_name || params.domain_name || params.data_element_name ||
                        params.structure_name || params.bdef_name || params.ddlx_name ||
                        params.bimp_name || params.metadata_extension_name ||
                        params.service_definition_name || null;
    }
  }

  /**
   * Lifecycle: afterEach
   * Cleanup after each test
   */
  async afterEach(): Promise<void> {
    await this.cleanup();
    await super.afterEach();
  }

  /**
   * Main run method - executes high-level workflow
   */
  async run(): Promise<void> {
    // Check basic prerequisites (config, test case) before creating connection
    if (!this.hasConfig || !this.testCase) {
      this.logger?.testSkip(`Skipping test: ${this.getSkipReason()}`);
      return;
    }

    // Create connection if not already created
    if (!this.connection || !this.session) {
      await this.createConnection();
    }

    // Check if connection creation failed
    if (!this.connection || !this.session) {
      this.logger?.testSkip(`Skipping test: ${this.getSkipReason()}`);
      return;
    }

    if (!this.connection || !this.session) {
      throw new Error('Failed to create connection and session');
    }

    const params = this.getTestParams();
    const packageName = this.resolvePackageName();
    const transportRequest = this.resolveTransportRequest();

    // Log test start
    this.logger?.info(`🚀 Starting high-level workflow test for ${this.objectName || 'object'}`);
    this.logger?.info(`   Workflow steps: create → update`);

    try {
      // Get context for workflow functions
      const context = this.getContext();

      // Step 1: Create (high-level handler handles validate, create, activate internally)
      if (this.isWorkflowFunction(this.handlers.create)) {
        await this.handlers.create(context);
      } else {
        await this.runCreate(params, packageName, transportRequest);
      }

      // Step 2: Update (high-level handler handles lock, update, unlock, activate internally)
      if (this.isWorkflowFunction(this.handlers.update)) {
        await this.handlers.update(context);
      } else {
        await this.runUpdate(params);
      }

      // Log test completion
      this.logger?.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      this.logger?.success(`✨ High-level workflow completed successfully for ${this.objectName}`);
    } catch (error: any) {
      // Check if error is a skip condition
      if (error.message && error.message.startsWith('SKIP:')) {
        const skipReason = error.message.replace(/^SKIP:\s*/, '');
        this.logger?.testSkip(`Skipping test: ${skipReason}`);
        return; // Don't throw, just skip the test
      }

      this.logger?.error(`💥 Test failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Step 1: Create (high-level)
   */
  protected async runCreate(params: any, packageName: string, transportRequest?: string): Promise<void> {
    if (!this.handlers.create || !this.connection || !this.session) {
      throw new Error('Create handler or connection/session not available');
    }

    this.logger?.info(`   • create: ${this.objectName}`);

    // For high-level handlers, source_code might not be required (e.g., DataElement, Domain use type_kind, data_type, etc.)
    const sourceCode = this.getSourceCode(params);
    // Only require source_code if it's actually needed (for classes, interfaces, etc.)
    // For DataElement/Domain, we use type_kind, data_type, length, decimals instead

    const createArgs = this.buildCreateArgs(params, packageName, transportRequest, sourceCode || '');

    let createResponse;
    try {
      createResponse = await this.handlers.create(this.connection, createArgs);
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      // Retry once if backend not yet ready and we hit 404
      if (errorMsg.includes('404')) {
        const retryDelay = this.getOperationDelay('create_verify_retry') || 1000;
        await delay(retryDelay);
        createResponse = await this.handlers.create(this.connection, createArgs);
      } else {
        throw error;
      }
    }

    if (createResponse.isError) {
      const errorMsg = extractErrorMessage(createResponse);
      // If validation fails (object already exists or invalid), skip test
      if (errorMsg.includes('already exists') ||
          errorMsg.includes('ExceptionResourceAlreadyExists') ||
          errorMsg.includes('ResourceAlreadyExists') ||
          errorMsg.includes('InvalidClifName') ||
          errorMsg.includes('InvalidObjName')) {
        const reason = errorMsg.includes('already exists') ||
                     errorMsg.includes('ExceptionResourceAlreadyExists') ||
                     errorMsg.includes('ResourceAlreadyExists')
          ? ' (object already exists)'
          : ' (validation failed)';
        const skipReason = `Create operation for ${this.objectName} failed validation${reason}: ${errorMsg}`;
        this.logger?.info(`⏭️  SKIP: ${skipReason}`);
        throw new Error(`SKIP: ${skipReason}`);
      }
      throw new Error(`Create failed: ${errorMsg}`);
    }

    const createData = parseHandlerResponse(createResponse);
    if (!createData.success) {
      throw new Error(`Create failed: ${JSON.stringify(createData)}`);
    }

    this.objectWasCreated = true;
    this.logger?.success(`✅ Step 1: Created ${this.objectName} successfully (high-level)`);

    this.session = updateSessionFromResponse(this.session, createData);
    await delay(this.getOperationDelay('create'));
  }

  /**
   * Step 2: Update (high-level)
   */
  protected async runUpdate(params: any): Promise<void> {
    if (!this.handlers.update || !this.connection || !this.session) {
      throw new Error('Update handler or connection/session not available');
    }

    this.logger?.info(`   • update: ${this.objectName}`);

    const updatedSourceCode = this.getUpdatedSourceCode(params);
    if (!updatedSourceCode) {
      throw new Error('update_source_code is required in test configuration for update step');
    }

    const updateResponse = await this.handlers.update(this.connection, {
      ...this.buildUpdateArgs(params, updatedSourceCode),
      session_id: this.session.session_id,
      session_state: this.session.session_state
    });

    if (updateResponse.isError) {
      const errorMsg = extractErrorMessage(updateResponse);
      throw new Error(`Update failed: ${errorMsg}`);
    }

    const updateData = parseHandlerResponse(updateResponse);
    if (!updateData.success) {
      throw new Error(`Update failed: ${JSON.stringify(updateData)}`);
    }

    this.logger?.success(`✅ Step 2: Updated ${this.objectName} successfully (high-level)`);
  }

  /**
   * Cleanup: Delete if needed
   */
  protected async cleanup(): Promise<void> {
    if (!this.objectWasCreated) {
      return;
    }

    const shouldCleanup = this.getCleanupAfter();
    if (!shouldCleanup) {
      return;
    }

    if (!this.connection || !this.handlers.delete) {
      return;
    }

    try {
      if (this.isWorkflowFunction(this.handlers.delete)) {
        const context = this.getContext();
        await this.handlers.delete(context);
      } else {
        await delay(1000);
        const transportRequest = this.resolveTransportRequest();
        await this.handlers.delete(this.connection, {
          ...this.buildDeleteArgs(),
          transport_request: transportRequest
        });
      }
      // Only log debug in debug mode
      if (process.env.DEBUG_TESTS === 'true' || process.env.DEBUG_ADT_TESTS === 'true') {
        this.logger?.debug(`✅ Cleanup: Deleted ${this.objectName}`);
      }
    } catch (deleteError: any) {
      // Log but don't fail test on cleanup errors
      this.logger?.warn(`Cleanup delete error (ignored): ${deleteError?.message || String(deleteError)}`);
    }
  }

  // Helper methods to build handler arguments (can be overridden in subclasses)

  protected buildCreateArgs(params: any, packageName: string, transportRequest: string | undefined, sourceCode: string): any {
    const args: any = {
      [this.getObjectNameKey()]: this.objectName,
      package_name: packageName,
      activate: true
    };

    // For high-level handlers, source_code might not be required (e.g., DataElement uses type_kind, data_type, etc.)
    if (sourceCode) {
      args.source_code = sourceCode;
    }

    if (transportRequest) {
      args.transport_request = transportRequest;
    }

    // Add common optional parameters
    if (params.description) args.description = params.description;
    if (params.superclass) args.superclass = params.superclass;
    if (params.final !== undefined) args.final = params.final;
    if (params.abstract !== undefined) args.abstract = params.abstract;
    if (params.create_protected !== undefined) args.create_protected = params.create_protected;

    // DataElement-specific parameters
    if (params.type_kind) args.type_kind = params.type_kind;
    if (params.data_type) args.data_type = params.data_type;
    if (params.length !== undefined) args.length = params.length;
    if (params.decimals !== undefined) args.decimals = params.decimals;
    if (params.domain_name) args.domain_name = params.domain_name;
    if (params.short_label) args.short_label = params.short_label;
    if (params.medium_label) args.medium_label = params.medium_label;
    if (params.long_label) args.long_label = params.long_label;
    if (params.heading_label) args.heading_label = params.heading_label;

    // Domain-specific parameters
    if (params.datatype) args.datatype = params.datatype;
    if (params.lowercase !== undefined) args.lowercase = params.lowercase;
    if (params.sign_exists !== undefined) args.sign_exists = params.sign_exists;

    return args;
  }

  protected buildUpdateArgs(params: any, sourceCode: string): any {
    return {
      [this.getObjectNameKey()]: this.objectName,
      source_code: sourceCode,
      activate: true
    };
  }

  protected buildDeleteArgs(): any {
    return {
      [this.getObjectNameKey()]: this.objectName
    };
  }

  protected getObjectNameKey(): string {
    // Determine object name key based on handler name
    if (this.handlerName.includes('class')) return 'class_name';
    if (this.handlerName.includes('interface')) return 'interface_name';
    if (this.handlerName.includes('function')) return 'function_name';
    if (this.handlerName.includes('program')) return 'program_name';
    if (this.handlerName.includes('table')) return 'table_name';
    if (this.handlerName.includes('view')) return 'view_name';
    if (this.handlerName.includes('domain')) return 'domain_name';
    if (this.handlerName.includes('data_element')) return 'data_element_name';
    if (this.handlerName.includes('structure')) return 'structure_name';
    if (this.handlerName.includes('service_definition')) return 'service_definition_name';
    if (this.handlerName.includes('behavior_definition')) return 'name';
    if (this.handlerName.includes('behavior_implementation')) return 'class_name';
    if (this.handlerName.includes('metadata_extension') || this.handlerName.includes('ddlx')) return 'name';
    return 'name'; // default
  }

  protected getSourceCode(params: any): string | null {
    return params.source_code || null;
  }

  protected getUpdatedSourceCode(params: any): string | null {
    return params.update_source_code || null;
  }

  /**
   * Check if a function is a workflow function (takes context) or handler function (takes connection, args)
   */
  protected isWorkflowFunction(fn: any): fn is (context: TesterContext) => Promise<any> {
    // Workflow functions have exactly 1 parameter (context)
    // Handler functions have 2 parameters (connection, args)
    // We can check by function length, but it's not 100% reliable
    // Better approach: check if function accepts TesterContext-like object
    return typeof fn === 'function' && fn.length === 1;
  }
}
