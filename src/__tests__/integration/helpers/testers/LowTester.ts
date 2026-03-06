/**
 * LowTester - Compatibility wrapper for LambdaTester
 *
 * This is a temporary compatibility layer for tests that haven't been migrated yet.
 * All tests should eventually be migrated to use LambdaTester directly.
 *
 * @deprecated Use LambdaTester instead
 */

import type { HandlerContext } from '../../../../lib/handlers/interfaces';
import { getCleanupAfter } from '../configHelpers';
import {
  createHandlerContext,
  delay,
  extractLockHandle,
  parseHandlerResponse,
} from '../testHelpers';
import {
  callTool,
  createHardModeClient,
  isHardModeEnabled,
  parseToolText,
  resolveEntityFromHandlerName,
  toolCandidates,
} from './hardMode';
import { LambdaTester, type TLambda } from './LambdaTester';
import type { LambdaTesterContext } from './types';

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
    workflowFunctions: LowWorkflowFunctions,
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

        try {
          if (isHardModeEnabled()) {
            const entity = resolveEntityFromHandlerName(
              (this as any).handlerName || '',
            );
            const mcp = await createHardModeClient();
            try {
              await this.ensureHardModeSession(mcp, context);
              const deleteArgs = this.buildDeleteArgs(context);
              await callTool(
                mcp.client,
                mcp.toolNames,
                toolCandidates('delete', entity, 'low', this.handlerName),
                deleteArgs,
              );
              logger?.info?.(`🗑️ Deleted ${objectName}`);
            } finally {
              await mcp.close();
            }
            return;
          }

          await delay(2000); // Ensure object is ready for deletion
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
              `⚠️ Delete failed: ${errorMsg}. Object left in SAP system.`,
            );
          } else {
            logger?.info?.(`🗑️ Deleted ${objectName}`);
          }
        } catch (error: any) {
          logger?.error?.(
            `⚠️ Cleanup error: ${error?.message || String(error)}. Object left in SAP system.`,
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
      // Execute workflow in order: validate -> create -> lock -> update -> unlock -> activate
      if (this.workflowFunctions.validate) {
        const args = this.buildValidateArgs(this.context);
        await this.workflowFunctions.validate(handlerContext, args);
        logger?.info(`✅ Validated ${this.context.objectName}`);
      }

      if (this.workflowFunctions.create) {
        const args = this.buildCreateArgs(this.context);
        await this.workflowFunctions.create(handlerContext, args);
        logger?.info(`✅ Created ${this.context.objectName}`);
      }

      if (this.workflowFunctions.lock) {
        const args = this.buildLockArgs(this.context);
        const lockResponse = await this.workflowFunctions.lock(
          handlerContext,
          args,
        );
        // Extract and store lock handle for subsequent operations
        if (lockResponse && !lockResponse.isError) {
          const lockData = parseHandlerResponse(lockResponse);
          const lockHandle = extractLockHandle(lockData);
          if (this.context) {
            this.context.lockHandle = lockHandle;
          }
        }
        logger?.info(`🔒 Locked ${this.context.objectName}`);
      }

      if (this.workflowFunctions.update) {
        const args = this.buildUpdateArgs(this.context);
        await this.workflowFunctions.update(handlerContext, args);
        logger?.info(`📝 Updated ${this.context.objectName}`);
      }

      if (this.workflowFunctions.unlock) {
        const args = this.buildUnlockArgs(this.context);
        await this.workflowFunctions.unlock(handlerContext, args);
        logger?.info(`🔓 Unlocked ${this.context.objectName}`);
      }

      if (this.workflowFunctions.activate) {
        const args = this.buildActivateArgs(this.context);
        await this.workflowFunctions.activate(handlerContext, args);
        logger?.info(`⚡ Activated ${this.context.objectName}`);
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
    const mcp = await createHardModeClient();

    try {
      await this.ensureHardModeSession(mcp, this.context);

      if (this.workflowFunctions?.validate) {
        const args = this.buildValidateArgs(this.context);
        await callTool(
          mcp.client,
          mcp.toolNames,
          toolCandidates('validate', entity, 'low', this.handlerName),
          args,
        );
        logger?.info(`✅ Validated ${this.context.objectName}`);
      }

      if (this.workflowFunctions?.create) {
        const args = this.buildCreateArgs(this.context);
        await callTool(
          mcp.client,
          mcp.toolNames,
          toolCandidates('create', entity, 'low', this.handlerName),
          args,
        );
        logger?.info(`✅ Created ${this.context.objectName}`);
      }

      if (this.workflowFunctions?.lock) {
        const args = this.buildLockArgs(this.context);
        const lockResult = await callTool(
          mcp.client,
          mcp.toolNames,
          toolCandidates('lock', entity, 'low', this.handlerName),
          args,
        );
        const lockText = parseToolText(lockResult);
        if (lockText) {
          try {
            const parsed = JSON.parse(lockText);
            const lockHandle = extractLockHandle(parsed);
            this.context.lockHandle = lockHandle;
          } catch {
            // keep going - lock handle can already be managed by server-side session
          }
        }
        logger?.info(`🔒 Locked ${this.context.objectName}`);
      }

      if (this.workflowFunctions?.update) {
        const args = this.buildUpdateArgs(this.context);
        await callTool(
          mcp.client,
          mcp.toolNames,
          toolCandidates('update', entity, 'low', this.handlerName),
          args,
        );
        logger?.info(`📝 Updated ${this.context.objectName}`);
      }

      if (this.workflowFunctions?.unlock) {
        const args = this.buildUnlockArgs(this.context);
        await callTool(
          mcp.client,
          mcp.toolNames,
          toolCandidates('unlock', entity, 'low', this.handlerName),
          args,
        );
        logger?.info(`🔓 Unlocked ${this.context.objectName}`);
      }

      if (this.workflowFunctions?.activate) {
        const args = this.buildActivateArgs(this.context);
        await callTool(
          mcp.client,
          mcp.toolNames,
          toolCandidates('activate', entity, 'low', this.handlerName),
          args,
        );
        logger?.info(`⚡ Activated ${this.context.objectName}`);
      }
    } catch (error: any) {
      if (error.message?.startsWith('SKIP:')) {
        const skipReason = error.message.replace(/^SKIP:\s*/, '');
        this.context.logger?.testSkip(`Skipping test: ${skipReason}`);
        return;
      }

      this.context.logger?.error(`❌ Test failed: ${error.message}`);
      throw error;
    } finally {
      await mcp.close();
    }
  }

  private async ensureHardModeSession(
    mcp: { client: any; toolNames: Set<string> },
    context?: LambdaTesterContext,
  ): Promise<void> {
    const target = context || this.context;
    if (!target) {
      return;
    }
    if ((target.session as any)?.session_id) {
      return;
    }
    if (!mcp.toolNames.has('GetSession')) {
      return;
    }

    try {
      const sessionResult = await callTool(
        mcp.client,
        mcp.toolNames,
        ['GetSession'],
        {},
      );
      const sessionText = parseToolText(sessionResult);
      if (!sessionText) {
        return;
      }
      const parsed = JSON.parse(sessionText);
      const sessionId = parsed?.session_id || parsed?.data?.session_id;
      const sessionState = parsed?.session_state || parsed?.data?.session_state;
      if (!sessionId) {
        return;
      }
      (target.session as any) = {
        ...(target.session || {}),
        session_id: sessionId,
        ...(sessionState ? { session_state: sessionState } : {}),
      };
    } catch {
      // Some systems/transports may not expose session API in hard mode; leave unset.
    }
  }

  private buildValidateArgs(context: LambdaTesterContext): any {
    const { objectName, params, packageName, transportRequest, session } =
      context;
    // Extract object-specific name field (class_name, table_name, etc.)
    const nameField = this.getNameField();
    return {
      [nameField]: objectName,
      package_name: packageName,
      description: params.description || objectName,
      ...(params.superclass && { superclass: params.superclass }),
      ...(transportRequest && { transport_request: transportRequest }),
      ...(session?.session_id && { session_id: session.session_id }),
      ...(session?.session_state && { session_state: session.session_state }),
    };
  }

  private buildCreateArgs(context: LambdaTesterContext): any {
    const { objectName, params, packageName, transportRequest, session } =
      context;
    const nameField = this.getNameField();
    return {
      [nameField]: objectName,
      package_name: packageName,
      description: params.description || objectName,
      ...(params.source_code && { source_code: params.source_code }),
      ...(params.superclass && { superclass: params.superclass }),
      ...(transportRequest && { transport_request: transportRequest }),
      ...(session?.session_id && { session_id: session.session_id }),
      ...(session?.session_state && { session_state: session.session_state }),
    };
  }

  private buildLockArgs(context: LambdaTesterContext): any {
    const { objectName, session } = context;
    const nameField = this.getNameField();
    return {
      [nameField]: objectName,
      ...(session?.session_id && { session_id: session.session_id }),
      ...(session?.session_state && { session_state: session.session_state }),
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
      ...(session?.session_state && { session_state: session.session_state }),
    };
  }

  private buildUnlockArgs(context: LambdaTesterContext): any {
    const { objectName, lockHandle, session } = context;
    const nameField = this.getNameField();
    return {
      [nameField]: objectName,
      lock_handle: lockHandle || context.lockHandle,
      ...(session?.session_id && { session_id: session.session_id }),
      ...(session?.session_state && { session_state: session.session_state }),
    };
  }

  private buildActivateArgs(context: LambdaTesterContext): any {
    const { objectName, transportRequest, session } = context;
    const nameField = this.getNameField();
    return {
      [nameField]: objectName,
      ...(transportRequest && { transport_request: transportRequest }),
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
    if (handlerName.includes('behavior_definition')) return 'name'; // behavior definition uses 'name' field
    if (handlerName.includes('behavior_implementation')) return 'name'; // behavior implementation also uses 'name'
    if (handlerName.includes('metadata_extension')) return 'name'; // metadata extension also uses 'name'
    if (handlerName.includes('service_definition')) return 'name'; // service definition also uses 'name'
    return 'name'; // fallback
  }

  // Compatibility methods - LowTester doesn't use lambdas for lifecycle hooks
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
      } catch (error: any) {
        // Pre-cleanup errors are non-fatal - object might not exist
        this.context.logger?.debug?.(
          `⚠️ Pre-cleanup warning (ignored): ${error?.message || String(error)}`,
        );
      }
    }
  }

  async afterEach(): Promise<void> {
    // LowTester compatibility - cleanup handled by cleanupAfter
    // Use this.cleanupAfter() to ensure YAML parameter checking works correctly
    await this.cleanupAfter();
  }
}
