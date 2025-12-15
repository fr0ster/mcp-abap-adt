/**
 * LowTester - Test class for low-level handler workflows
 *
 * Executes full workflow: Validate → Create → Lock → Update → Unlock → Activate
 * Handles cleanup: Unlock → Delete (if needed)
 */

import { BaseTester } from './BaseTester';
import {
  parseHandlerResponse,
  extractLockHandle,
  delay,
  extractErrorMessage
} from '../testHelpers';
import {
  updateSessionFromResponse,
  extractLockSession,
  SessionInfo
} from '../sessionHelpers';
import { createDiagnosticsTracker } from '../persistenceHelpers';

export type HandlerFunctions = {
  validate?: (connection: any, args: any) => Promise<any>;
  create: (connection: any, args: any) => Promise<any>;
  lock: (connection: any, args: any) => Promise<any>;
  update: (connection: any, args: any) => Promise<any>;
  unlock: (connection: any, args: any) => Promise<any>;
  activate: (connection: any, args: any) => Promise<any>;
  delete?: (connection: any, args: any) => Promise<any>;
};

export class LowTester extends BaseTester {
  // Handler functions (must be provided by subclass or via constructor)
  protected handlers: HandlerFunctions;

  // Lock tracking
  protected lockHandle: string | null = null;
  protected lockSession: SessionInfo | null = null;
  protected objectWasCreated: boolean = false;

  // Object name (resolved from test params)
  protected objectName: string | null = null;

  /**
   * Constructor
   * @param handlerName - Name of the handler (e.g., 'create_behavior_definition_low')
   * @param testCaseName - Name of the test case (e.g., 'full_workflow')
   * @param logPrefix - Prefix for log messages (e.g., 'bdef-low')
   * @param handlers - Handler functions for validate, create, lock, update, unlock, activate, delete
   * @param paramsGroupName - Optional: Name of parameter group in YAML
   */
  constructor(
    handlerName: string,
    testCaseName: string,
    logPrefix: string,
    handlers: HandlerFunctions,
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
                        params.bimp_name || null;
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
   * Main run method - executes full workflow
   */
  async run(): Promise<void> {
    if (this.shouldSkipTest()) {
      this.logger.testSkip(`Skipping test: ${this.getSkipReason()}`);
      return;
    }

    if (!this.connection || !this.session) {
      await this.createConnection();
    }

    if (!this.connection || !this.session) {
      throw new Error('Failed to create connection and session');
    }

    const params = this.getTestParams();
    const packageName = this.resolvePackageName();
    const transportRequest = this.resolveTransportRequest();

    // Initialize diagnostics tracker
    const diagnosticsTracker = createDiagnosticsTracker(
      `${this.handlerName}_${this.testCaseName}`,
      this.testCase,
      this.session,
      {
        handler: this.handlerName,
        object_name: this.objectName
      }
    );

    // Log test start
    const totalSteps = this.handlers.validate ? 6 : 5;
    this.logger.info(`🚀 Starting low-level workflow test for ${this.objectName || 'object'}`);
    this.logger.info(`   Workflow steps: ${this.handlers.validate ? 'validate → ' : ''}create → lock → update → unlock → activate`);

    try {
      let currentStep = 0;
      // Step 1: Validate (if handler provided)
      if (this.handlers.validate) {
        currentStep = 1;
        await this.runValidate(params, packageName, currentStep, totalSteps);
      }

      // Step 2: Create
      currentStep = this.handlers.validate ? 2 : 1;
      await this.runCreate(params, packageName, transportRequest, currentStep, totalSteps);

      // Step 3: Lock
      currentStep = this.handlers.validate ? 3 : 2;
      await this.runLock(currentStep, totalSteps);

      // Step 4: Update
      currentStep = this.handlers.validate ? 4 : 3;
      await this.runUpdate(params, currentStep, totalSteps);

      // Step 5: Unlock
      currentStep = this.handlers.validate ? 5 : 4;
      await this.runUnlock(currentStep, totalSteps);

      // Step 6: Activate
      currentStep = this.handlers.validate ? 6 : 5;
      await this.runActivate(currentStep, totalSteps);

      this.logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      this.logger.success(`✨ Full workflow completed successfully for ${this.objectName}`);
    } catch (error: any) {
      this.logger.error(`❌ Test failed: ${error.message}`);
      throw error;
    } finally {
      // Persist lock info for diagnostics
      if (this.lockSession && this.lockHandle) {
        diagnosticsTracker.persistLock(this.lockSession, this.lockHandle, {
          object_type: this.getObjectType(),
          object_name: this.objectName || 'unknown',
          transport_request: transportRequest
        });
      }
    }
  }

  /**
   * Step 1: Validate
   */
  protected async runValidate(params: any, packageName: string, stepNum: number, totalSteps: number): Promise<void> {
    if (!this.handlers.validate || !this.connection || !this.session) {
      return;
    }

    this.logger.info(`   • validate: ${this.objectName}`);

    const validateArgs = this.buildValidateArgs(params, packageName);
    const validateResponse = await this.handlers.validate(this.connection, validateArgs);

    if (validateResponse.isError) {
      const errorMsg = extractErrorMessage(validateResponse);
      this.logger.info(`⏭️  Validation error for ${this.objectName}: ${errorMsg}, skipping test`);
      throw new Error(`Validation failed: ${errorMsg}`);
    }

    const validateData = parseHandlerResponse(validateResponse);

    if (!validateData.validation_result?.valid) {
      const message = validateData.validation_result?.message || '';
      this.logger.info(`⏭️  Validation failed for ${this.objectName}: ${message}, skipping test`);
      throw new Error(`Validation failed: ${message}`);
    }

    this.session = updateSessionFromResponse(this.session, validateData);
    this.logger.success(`✅ Step ${stepNum}/${totalSteps}: Validation successful for ${this.objectName}`);
  }

  /**
   * Step 2: Create
   */
  protected async runCreate(params: any, packageName: string, transportRequest: string | undefined, stepNum: number, totalSteps: number): Promise<void> {
    if (!this.handlers.create || !this.connection || !this.session) {
      throw new Error('Create handler or connection/session not available');
    }

    this.logger.info(`   • create: ${this.objectName}`);

    const createArgs = this.buildCreateArgs(params, packageName, transportRequest);
    const createResponse = await this.handlers.create(this.connection, createArgs);

    if (createResponse.isError) {
      const errorMsg = extractErrorMessage(createResponse);
      if (errorMsg.includes('already exists') || errorMsg.includes('does already exist')) {
        this.logger.info(`⏭️  Object ${this.objectName} already exists, skipping test`);
        throw new Error(`SKIP: Object already exists: ${errorMsg}`);
      }
      throw new Error(`Create failed: ${errorMsg}`);
    }

    const createData = parseHandlerResponse(createResponse);
    if (!createData.success) {
      throw new Error(`Create failed: ${JSON.stringify(createData)}`);
    }

    this.objectWasCreated = true;
    this.logger.success(`✅ Step ${stepNum}/${totalSteps}: Created ${this.objectName} successfully`);

    this.session = updateSessionFromResponse(this.session, createData);
    await delay(this.getOperationDelay('create'));
  }

  /**
   * Step 3: Lock
   */
  protected async runLock(stepNum: number, totalSteps: number): Promise<void> {
    if (!this.handlers.lock || !this.connection || !this.session) {
      throw new Error('Lock handler or connection/session not available');
    }

    this.logger.info(`   • lock: ${this.objectName}`);

    const lockResponse = await this.handlers.lock(this.connection, {
      ...this.buildLockArgs(),
      session_id: this.session.session_id,
      session_state: this.session.session_state
    });

    if (lockResponse.isError) {
      const errorMsg = extractErrorMessage(lockResponse);
      throw new Error(`Lock failed: ${errorMsg}`);
    }

    const lockData = parseHandlerResponse(lockResponse);
    this.lockHandle = extractLockHandle(lockData);
    this.lockSession = extractLockSession(lockData);

    if (!this.lockSession.session_id || !this.lockSession.session_state) {
      throw new Error('Lock response does not contain valid session information');
    }

    this.logger.success(`✅ Step ${stepNum}/${totalSteps}: Locked ${this.objectName} successfully`);
    await delay(this.getOperationDelay('lock'));
  }

  /**
   * Step 4: Update
   */
  protected async runUpdate(params: any, stepNum: number, totalSteps: number): Promise<void> {
    if (!this.handlers.update || !this.connection || !this.lockSession || !this.lockHandle) {
      throw new Error('Update handler, lock session, or lock handle not available');
    }

    this.logger.info(`   • update: ${this.objectName}`);

    const sourceCode = this.getSourceCode(params);
    if (!sourceCode) {
      throw new Error('source_code is required in test configuration for update step');
    }

    const updateResponse = await this.handlers.update(this.connection, {
      ...this.buildUpdateArgs(params, sourceCode),
      lock_handle: this.lockHandle,
      session_id: this.lockSession.session_id,
      session_state: this.lockSession.session_state
    });

    if (updateResponse.isError) {
      const errorMsg = extractErrorMessage(updateResponse);
      throw new Error(`Update failed: ${errorMsg}`);
    }

    const updateData = parseHandlerResponse(updateResponse);
    if (!updateData.success) {
      throw new Error(`Update failed: ${JSON.stringify(updateData)}`);
    }

    this.logger.success(`✅ Step ${stepNum}/${totalSteps}: Updated ${this.objectName} successfully`);
    await delay(this.getOperationDelay('update'));
  }

  /**
   * Step 5: Unlock
   */
  protected async runUnlock(stepNum: number, totalSteps: number): Promise<void> {
    if (!this.handlers.unlock || !this.connection || !this.lockSession || !this.lockHandle) {
      throw new Error('Unlock handler, lock session, or lock handle not available');
    }

    this.logger.info(`   • unlock: ${this.objectName}`);

    const unlockResponse = await this.handlers.unlock(this.connection, {
      ...this.buildUnlockArgs(),
      lock_handle: this.lockHandle,
      session_id: this.lockSession.session_id,
      session_state: this.lockSession.session_state
    });

    if (unlockResponse.isError) {
      const errorMsg = extractErrorMessage(unlockResponse);
      throw new Error(`Unlock failed: ${errorMsg}`);
    }

    const unlockData = parseHandlerResponse(unlockResponse);
    if (!unlockData.success) {
      throw new Error(`Unlock failed: ${JSON.stringify(unlockData)}`);
    }

    this.session = updateSessionFromResponse(this.session, unlockData);
    this.logger.success(`✅ Step ${stepNum}/${totalSteps}: Unlocked ${this.objectName} successfully`);
    await delay(this.getOperationDelay('unlock'));
  }

  /**
   * Step 6: Activate
   */
  protected async runActivate(stepNum: number, totalSteps: number): Promise<void> {
    if (!this.handlers.activate || !this.connection || !this.session) {
      throw new Error('Activate handler or connection/session not available');
    }

    this.logger.info(`   • activate: ${this.objectName}`);

    const activateResponse = await this.handlers.activate(this.connection, {
      ...this.buildActivateArgs(),
      session_id: this.session.session_id,
      session_state: this.session.session_state
    });

    if (activateResponse.isError) {
      const errorMsg = extractErrorMessage(activateResponse);
      throw new Error(`Activate failed: ${errorMsg}`);
    }

    const activateData = parseHandlerResponse(activateResponse);
    if (!activateData.success) {
      throw new Error(`Activate failed: ${JSON.stringify(activateData)}`);
    }

    this.logger.success(`✅ Step ${stepNum}/${totalSteps}: Activated ${this.objectName} successfully`);
  }

  /**
   * Cleanup: Unlock and Delete if needed
   */
  protected async cleanup(): Promise<void> {
    if (!this.objectWasCreated) {
      return;
    }

    const shouldCleanup = this.getCleanupAfter();
    if (!shouldCleanup) {
      return;
    }

    if (!this.connection) {
      return;
    }

    // Always unlock (unlock is always performed)
    if (this.lockHandle && this.lockSession && this.handlers.unlock) {
      try {
        await this.handlers.unlock(this.connection, {
          ...this.buildUnlockArgs(),
          lock_handle: this.lockHandle,
          session_id: this.lockSession.session_id,
          session_state: this.lockSession.session_state
        });
      } catch (unlockError: any) {
        // Ignore unlock errors during cleanup
        this.logger.debug(`Cleanup unlock error (ignored): ${unlockError?.message || String(unlockError)}`);
      }
    }

    // Delete if cleanup is enabled
    if (shouldCleanup && this.handlers.delete) {
      try {
        await delay(1000);
        const transportRequest = this.resolveTransportRequest();
        await this.handlers.delete(this.connection, {
          ...this.buildDeleteArgs(),
          transport_request: transportRequest
        });
        this.logger.debug(`✅ Cleanup: Deleted ${this.objectName}`);
      } catch (deleteError: any) {
        // Log but don't fail test on cleanup errors
        this.logger.warn(`Cleanup delete error (ignored): ${deleteError?.message || String(deleteError)}`);
      }
    }
  }

  // Helper methods to build handler arguments (can be overridden in subclasses)

  protected buildValidateArgs(params: any, packageName: string): any {
    return {
      ...this.getCommonArgs(params, packageName),
      session_id: this.session!.session_id,
      session_state: this.session!.session_state
    };
  }

  protected buildCreateArgs(params: any, packageName: string, transportRequest?: string): any {
    const args: any = {
      ...this.getCommonArgs(params, packageName),
      session_id: this.session!.session_id,
      session_state: this.session!.session_state
    };
    if (transportRequest) {
      args.transport_request = transportRequest;
    }
    return args;
  }

  protected buildLockArgs(): any {
    return {
      [this.getObjectNameKey()]: this.objectName
    };
  }

  protected buildUpdateArgs(params: any, sourceCode: string): any {
    return {
      [this.getObjectNameKey()]: this.objectName,
      source_code: sourceCode
    };
  }

  protected buildUnlockArgs(): any {
    return {
      [this.getObjectNameKey()]: this.objectName
    };
  }

  protected buildActivateArgs(): any {
    return {
      [this.getObjectNameKey()]: this.objectName
    };
  }

  protected buildDeleteArgs(): any {
    return {
      [this.getObjectNameKey()]: this.objectName
    };
  }

  protected getCommonArgs(params: any, packageName: string): any {
    const args: any = {
      [this.getObjectNameKey()]: this.objectName,
      package_name: packageName
    };

    // Add common optional parameters
    if (params.description) args.description = params.description;
    if (params.root_entity) args.root_entity = params.root_entity;
    if (params.implementation_type) {
      const implType = params.implementation_type;
      args.implementation_type = implType.charAt(0).toUpperCase() + implType.slice(1).toLowerCase();
    }

    // Class-specific parameters
    if (params.superclass) args.superclass = params.superclass;
    if (params.final !== undefined) args.final = params.final;
    if (params.abstract !== undefined) args.abstract = params.abstract;
    if (params.create_protected !== undefined) args.create_protected = params.create_protected;

    return args;
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
    if (this.handlerName.includes('behavior_definition')) return 'name';
    if (this.handlerName.includes('behavior_implementation')) return 'class_name';
    if (this.handlerName.includes('metadata_extension') || this.handlerName.includes('ddlx')) return 'name';
    return 'name'; // default
  }

  protected getObjectType(): string {
    if (this.handlerName.includes('class')) return 'CLAS';
    if (this.handlerName.includes('interface')) return 'INTF';
    if (this.handlerName.includes('function')) return 'FUGR';
    if (this.handlerName.includes('program')) return 'PROG';
    if (this.handlerName.includes('table')) return 'TABL';
    if (this.handlerName.includes('view')) return 'VIEW';
    if (this.handlerName.includes('domain')) return 'DOMA';
    if (this.handlerName.includes('data_element')) return 'DTEL';
    if (this.handlerName.includes('structure')) return 'TABL';
    if (this.handlerName.includes('behavior_definition')) return 'BDEF';
    if (this.handlerName.includes('behavior_implementation')) return 'BIMP';
    if (this.handlerName.includes('metadata_extension') || this.handlerName.includes('ddlx')) return 'DDLX';
    return 'UNKNOWN';
  }

  protected getSourceCode(params: any): string | null {
    return params.source_code || params.implementation_code || null;
  }
}
