/**
 * LowTester - Compatibility wrapper for LambdaTester
 *
 * This is a temporary compatibility layer for tests that haven't been migrated yet.
 * All tests should eventually be migrated to use LambdaTester directly.
 *
 * @deprecated Use LambdaTester instead
 */

import { LambdaTester, type TLambda } from './LambdaTester';
import type { LambdaTesterContext } from './types';
import type { HandlerContext } from '../../../../lib/handlers/interfaces';
import { createHandlerContext, parseHandlerResponse, extractLockHandle } from '../testHelpers';

// Handler function type: (context: HandlerContext, args: any) => Promise<any>
type HandlerFunction = (context: HandlerContext, args: any) => Promise<any>;

export type LowWorkflowFunctions = {
  validate?: HandlerFunction;
  create: HandlerFunction;
  lock: HandlerFunction;
  update: HandlerFunction;
  unlock: HandlerFunction;
  activate: HandlerFunction;
  delete?: HandlerFunction;
};

/**
 * @deprecated Use LambdaTester instead
 */
export class LowTester extends LambdaTester {
  private workflowFunctions?: LowWorkflowFunctions;

  constructor(
    handlerName: string,
    testCaseName: string,
    logPrefix: string,
    workflowFunctions: LowWorkflowFunctions
  ) {
    super(handlerName, testCaseName, logPrefix);
    this.workflowFunctions = workflowFunctions;
  }

  /**
   * Initialize tester and optionally set cleanup lambda
   * Cleanup lambda should be provided by the test, not automatically created
   * @param cleanupAfter - Optional cleanup lambda (checks YAML params before executing)
   */
  async beforeAll(cleanupAfter?: TLambda): Promise<void> {
    await this.init();
    if (!this.context) {
      throw new Error('Context not initialized');
    }

    // Store cleanup lambda if provided by test
    if (cleanupAfter) {
      this.cleanupAfterLambda = cleanupAfter;
    }
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
      // Execute workflow in order: validate -> create -> lock -> update -> unlock -> activate
      if (this.workflowFunctions.validate) {
        const args = this.buildValidateArgs(this.context);
        await this.workflowFunctions.validate(handlerContext, args);
      }

      if (this.workflowFunctions.create) {
        const args = this.buildCreateArgs(this.context);
        await this.workflowFunctions.create(handlerContext, args);
      }

      if (this.workflowFunctions.lock) {
        const args = this.buildLockArgs(this.context);
        const lockResponse = await this.workflowFunctions.lock(handlerContext, args);
        // Extract and store lock handle for subsequent operations
        if (lockResponse && !lockResponse.isError) {
          const lockData = parseHandlerResponse(lockResponse);
          const lockHandle = extractLockHandle(lockData);
          if (this.context) {
            this.context.lockHandle = lockHandle;
          }
        }
      }

      if (this.workflowFunctions.update) {
        const args = this.buildUpdateArgs(this.context);
        await this.workflowFunctions.update(handlerContext, args);
      }

      if (this.workflowFunctions.unlock) {
        const args = this.buildUnlockArgs(this.context);
        await this.workflowFunctions.unlock(handlerContext, args);
      }

      if (this.workflowFunctions.activate) {
        const args = this.buildActivateArgs(this.context);
        await this.workflowFunctions.activate(handlerContext, args);
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

  private buildValidateArgs(context: LambdaTesterContext): any {
    const { objectName, params, packageName, transportRequest, session } = context;
    // Extract object-specific name field (class_name, table_name, etc.)
    const nameField = this.getNameField();
    return {
      [nameField]: objectName,
      package_name: packageName,
      description: params.description || objectName,
      ...(params.superclass && { superclass: params.superclass }),
      ...(transportRequest && { transport_request: transportRequest }),
      ...(session?.session_id && { session_id: session.session_id }),
      ...(session?.session_state && { session_state: session.session_state })
    };
  }

  private buildCreateArgs(context: LambdaTesterContext): any {
    const { objectName, params, packageName, transportRequest, session } = context;
    const nameField = this.getNameField();
    return {
      [nameField]: objectName,
      package_name: packageName,
      description: params.description || objectName,
      ...(params.source_code && { source_code: params.source_code }),
      ...(params.superclass && { superclass: params.superclass }),
      ...(transportRequest && { transport_request: transportRequest }),
      ...(session?.session_id && { session_id: session.session_id }),
      ...(session?.session_state && { session_state: session.session_state })
    };
  }

  private buildLockArgs(context: LambdaTesterContext): any {
    const { objectName, session } = context;
    const nameField = this.getNameField();
    return {
      [nameField]: objectName,
      ...(session?.session_id && { session_id: session.session_id }),
      ...(session?.session_state && { session_state: session.session_state })
    };
  }

  private buildUpdateArgs(context: LambdaTesterContext): any {
    const { objectName, params, lockHandle, session } = context;
    const nameField = this.getNameField();
    return {
      [nameField]: objectName,
      source_code: params.source_code || params.update_source_code || '',
      lock_handle: lockHandle || context.lockHandle,
      ...(session?.session_id && { session_id: session.session_id }),
      ...(session?.session_state && { session_state: session.session_state })
    };
  }

  private buildUnlockArgs(context: LambdaTesterContext): any {
    const { objectName, lockHandle, session } = context;
    const nameField = this.getNameField();
    return {
      [nameField]: objectName,
      lock_handle: lockHandle || context.lockHandle,
      ...(session?.session_id && { session_id: session.session_id }),
      ...(session?.session_state && { session_state: session.session_state })
    };
  }

  private buildActivateArgs(context: LambdaTesterContext): any {
    const { objectName, transportRequest, session } = context;
    const nameField = this.getNameField();
    return {
      [nameField]: objectName,
      ...(transportRequest && { transport_request: transportRequest }),
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

  // Compatibility methods - LowTester doesn't use lambdas for lifecycle hooks
  async afterAll(): Promise<void> {
    // LowTester compatibility - no lambda needed
  }

  async beforeEach(): Promise<void> {
    // LowTester compatibility - no lambda needed
  }

  async afterEach(): Promise<void> {
    // LowTester compatibility - cleanup handled by cleanupAfter
    // Use this.cleanupAfter() to ensure YAML parameter checking works correctly
    await this.cleanupAfter();
  }
}

