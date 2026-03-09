/**
 * BaseTester - Abstract base class for all test types
 *
 * Provides common functionality for:
 * - Connection management (via AuthBroker or .env)
 * - Session management
 * - Configuration loading
 * - Logging with prefixes
 * - Lifecycle hooks (beforeAll, afterAll, beforeEach, afterEach)
 */

import type { AbapConnection } from '@mcp-abap-adt/connection';
import { resolveSystemContext } from '../../../../lib/systemContext';
import {
  getCleanupAfter,
  getEnabledTestCase,
  getOperationDelay,
  getTimeout,
  loadTestConfig,
  loadTestEnv,
  resolvePackageName,
  resolveTestSystemContext,
  resolveTransportRequest,
} from '../configHelpers';
import { createTestLogger, type LoggerWithExtras } from '../loggerHelpers';
import {
  createTestConnectionAndSession,
  type SessionInfo,
} from '../sessionHelpers';
import { delay } from '../testHelpers';
import {
  createHardModeClient,
  isHardModeEnabled,
  parseToolText,
} from './hardMode';
import type { LambdaTesterContext } from './types';

export type TLambda = (context: LambdaTesterContext) => Promise<void>;
type HandlerLikeResponse = {
  isError: boolean;
  content: Array<{ type: 'text'; text: string }>;
};
const HARD_MODE_RUN_ID = Math.random().toString(36).slice(2, 6).toUpperCase();

export class LambdaTester {
  // Configuration
  protected readonly handlerName: string;
  protected readonly testCaseName: string;
  protected readonly logPrefix: string;
  protected readonly paramsGroupName: string | undefined;
  protected testCase: any = null;
  protected testParams: any = null;
  protected context: LambdaTesterContext | undefined;
  protected cleanupAfterLambda: TLambda | null = null;
  protected hardModeMcp: {
    client: any;
    toolNames: Set<string>;
    close: () => Promise<void>;
  } | null = null;

  /**
   * Constructor
   * Loads test parameters from YAML, creates connection, sets up loggers
   * @param handlerName - Name of the handler (e.g., 'create_behavior_definition_low')
   * @param testCaseName - Name of the test case (e.g., 'full_workflow')
   * @param logPrefix - Prefix for log messages (e.g., 'bdef-low')
   * @param paramsGroupName - Optional: Name of parameter group in YAML to use for test parameters
   */
  constructor(
    handlerName: string,
    testCaseName: string,
    logPrefix: string,
    paramsGroupName?: string,
  ) {
    this.handlerName = handlerName;
    this.testCaseName = testCaseName;
    this.logPrefix = logPrefix;
    this.paramsGroupName = paramsGroupName;

    // Initialize context synchronously (will be populated in async init)
    this.context = undefined;
  }

  /**
   * Initialize tester - loads config, creates connection, sets up context
   * Must be called before using tester
   */
  async init(): Promise<void> {
    let hasConfig = false;
    let connection: AbapConnection | null = null;
    let session: SessionInfo | null = null;
    let logger: LoggerWithExtras | null = null;
    let testCase: any = null;
    let testParams: any = null;
    let objectName: string | null = null;
    let packageName = '';
    let transportRequest: string | undefined;
    let authType: string | undefined;
    let connectionSource: 'auth_broker' | 'env' | 'unknown' = 'unknown';
    let isCloudSystem = false;

    try {
      // Load test config from YAML
      const config = loadTestConfig();
      const hardModeEnabled =
        config?.environment?.integration_hard_mode?.enabled === true ||
        config?.integration_hard_mode?.enabled === true;

      // Load environment variables only for in-process mode
      if (!hardModeEnabled) {
        await loadTestEnv();
      }
      hasConfig = true;

      testCase = getEnabledTestCase(this.handlerName, this.testCaseName);

      if (!testCase) {
        throw new Error(
          `Test case "${this.testCaseName}" not found or disabled for handler "${this.handlerName}"`,
        );
      }

      // Resolve parameters from group if paramsGroupName is provided
      if (this.paramsGroupName) {
        // Try structure 1: params_groups.groupName in test case
        if (testCase.params_groups?.[this.paramsGroupName]) {
          testParams = testCase.params_groups[this.paramsGroupName];
        } else {
          // Try structure 2: Global params_groups.groupName in config root
          if (config.params_groups?.[this.paramsGroupName]) {
            testParams = config.params_groups[this.paramsGroupName];
          } else {
            // Fallback to direct params
            testParams = testCase.params;
          }
        }
      } else {
        // Use params directly from test case
        testParams = testCase.params;
      }

      // Create logger for tests
      logger = createTestLogger(this.logPrefix);

      // Hard mode: do not require direct SAP connection/session in tester init.
      // MCP client connection will be created on-demand inside HighTester/LowTester run methods.
      if (hardModeEnabled) {
        const hardCfg =
          config?.environment?.integration_hard_mode ||
          config?.integration_hard_mode ||
          {};
        const suffixRaw = String(hardCfg.name_suffix || '').trim();

        // Resolve object name from params
        const originalObjectName =
          testParams.name ||
          testParams.class_name ||
          testParams.interface_name ||
          testParams.function_name ||
          testParams.program_name ||
          testParams.table_name ||
          testParams.view_name ||
          testParams.domain_name ||
          testParams.data_element_name ||
          testParams.structure_name ||
          testParams.bdef_name ||
          testParams.ddlx_name ||
          testParams.bimp_name ||
          testParams.metadata_extension_name ||
          testParams.service_definition_name ||
          testParams.test_package ||
          null;

        objectName = originalObjectName;
        if (originalObjectName && suffixRaw) {
          const normalizedSuffix = `${suffixRaw}_${HARD_MODE_RUN_ID}`
            .toUpperCase()
            .replace(/[^A-Z0-9_]/g, '_');
          const suffixed = `${String(originalObjectName).toUpperCase()}_${normalizedSuffix}`;
          objectName = suffixed.slice(0, 30);

          // Keep params in sync with object name for arg builders
          if (testParams.program_name) testParams.program_name = objectName;
          if (testParams.class_name) testParams.class_name = objectName;
          if (testParams.interface_name) testParams.interface_name = objectName;
          if (testParams.function_name) testParams.function_name = objectName;
          if (testParams.table_name) testParams.table_name = objectName;
          if (testParams.view_name) testParams.view_name = objectName;
          if (testParams.domain_name) testParams.domain_name = objectName;
          if (testParams.data_element_name)
            testParams.data_element_name = objectName;
          if (testParams.structure_name) testParams.structure_name = objectName;
          if (testParams.test_package) testParams.test_package = objectName;
          if (testParams.name) testParams.name = objectName;

          // Adjust embedded source to avoid name mismatch in checks/update
          if (typeof testParams.source_code === 'string') {
            testParams.source_code = testParams.source_code.replace(
              new RegExp(String(originalObjectName), 'gi'),
              String(objectName),
            );
          }
          if (typeof testParams.update_source_code === 'string') {
            testParams.update_source_code =
              testParams.update_source_code.replace(
                new RegExp(String(originalObjectName), 'gi'),
                String(objectName),
              );
          }
          if (typeof testParams.ddl_code === 'string') {
            testParams.ddl_code = testParams.ddl_code.replace(
              new RegExp(String(originalObjectName), 'gi'),
              String(objectName),
            );
          }
          if (typeof testParams.update_ddl_code === 'string') {
            testParams.update_ddl_code = testParams.update_ddl_code.replace(
              new RegExp(String(originalObjectName), 'gi'),
              String(objectName),
            );
          }
        }

        const testCaseWithParams = { ...testCase, params: testParams };
        packageName = resolvePackageName(testCaseWithParams);
        transportRequest = resolveTransportRequest(testCaseWithParams);
        const defaultPackage = config.environment?.default_package;
        const getOperationDelayForContext = (operation: string): number =>
          getOperationDelay(operation, testCase);

        this.context = {
          hasConfig: true,
          connection: {} as AbapConnection,
          session: {} as SessionInfo,
          logger,
          authType: undefined,
          connectionSource: 'unknown',
          isCloudSystem: false,
          objectName,
          params: testParams,
          packageName,
          transportRequest,
          cleanupAfter: this.cleanupAfter.bind(this),
          getOperationDelay: getOperationDelayForContext,
          defaultPackage,
          testCase,
        };
        this.testCase = testCase;
        this.testParams = testParams;
        return;
      }

      // Create connection and session
      const connectionResult = await createTestConnectionAndSession();
      connection = connectionResult.connection;
      session = connectionResult.session;

      // Resolve system context for tests (set SAP_MASTER_SYSTEM from YAML if not already set)
      const testCtx = resolveTestSystemContext();
      if (testCtx.masterSystem && !process.env.SAP_MASTER_SYSTEM) {
        process.env.SAP_MASTER_SYSTEM = testCtx.masterSystem;
      }
      if (testCtx.responsible && !process.env.SAP_RESPONSIBLE) {
        process.env.SAP_RESPONSIBLE = testCtx.responsible;
      }
      // Populate system context cache so createAdtClient() picks it up
      await resolveSystemContext(connection);
      authType =
        connectionResult.authType ||
        ((connection as any)?.getConfig?.()?.authType as string | undefined);
      connectionSource = connectionResult.connectionSource || 'unknown';
      isCloudSystem = authType === 'jwt';

      // Resolve object name from params
      objectName =
        testParams.name ||
        testParams.class_name ||
        testParams.interface_name ||
        testParams.function_name ||
        testParams.program_name ||
        testParams.table_name ||
        testParams.view_name ||
        testParams.domain_name ||
        testParams.data_element_name ||
        testParams.structure_name ||
        testParams.bdef_name ||
        testParams.ddlx_name ||
        testParams.bimp_name ||
        testParams.metadata_extension_name ||
        testParams.service_definition_name ||
        testParams.test_package ||
        null;

      // Resolve package name and transport request
      // Create testCase object with resolved params for resolve functions
      const testCaseWithParams = { ...testCase, params: testParams };
      packageName = resolvePackageName(testCaseWithParams);
      transportRequest = resolveTransportRequest(testCaseWithParams);

      // Get default package from config
      const defaultPackage = config.environment?.default_package;

      // Create getOperationDelay function bound to this testCase
      const getOperationDelayForContext = (operation: string): number => {
        return getOperationDelay(operation, testCase);
      };

      // Create context with cleanupAfter method and common config parameters
      this.context = {
        hasConfig,
        connection,
        session,
        logger,
        authType,
        connectionSource,
        isCloudSystem,
        objectName,
        params: testParams,
        packageName,
        transportRequest,
        cleanupAfter: this.cleanupAfter.bind(this),
        getOperationDelay: getOperationDelayForContext,
        defaultPackage,
        testCase,
      };

      this.testCase = testCase;
      this.testParams = testParams;
    } catch (error: any) {
      // If initialization failed, create minimal context
      const errorLogger = createTestLogger(this.logPrefix);
      errorLogger?.warn(
        `⚠️ Failed to initialize tester: ${error?.message || String(error)}`,
      );

      // Create minimal getOperationDelay function for error case (returns default)
      const getOperationDelayForContext = (operation: string): number => {
        return getOperationDelay(operation, null);
      };

      this.context = {
        hasConfig: false,
        connection: connection || ({} as AbapConnection),
        session: session || ({} as SessionInfo),
        logger: errorLogger,
        authType: undefined,
        connectionSource: 'unknown',
        isCloudSystem: false,
        objectName: null,
        params: {},
        packageName: '',
        transportRequest: undefined,
        cleanupAfter: async () => {},
        getOperationDelay: getOperationDelayForContext,
        defaultPackage: undefined,
        testCase: null,
      };
    }
  }

  /**
   * Cleanup after test - checks if cleanup is needed and performs it
   * Checks YAML parameters first, then calls cleanup lambda from test
   * This method is designed to be safe to call even if test failed
   */
  protected async cleanupAfter(): Promise<void> {
    if (!this.context || !this.testCase) {
      this.context?.logger?.warn?.(
        '⚠️ Cleanup skipped: context or testCase not available',
      );
      return;
    }

    // Check YAML parameters first (global skip_cleanup, test case skip_cleanup, cleanup_after flags)
    const shouldCleanup = getCleanupAfter(this.testCase);
    if (!shouldCleanup) {
      this.context.logger?.info?.(
        'ℹ️ Cleanup skipped: disabled in YAML config (skip_cleanup=true or cleanup_after=false)',
      );
      return;
    }

    // Cleanup lambda must be provided - it's mandatory
    if (!this.cleanupAfterLambda) {
      this.context.logger?.error?.(
        '❌ Cleanup lambda not provided! Each test must set cleanup lambda in beforeAll().',
      );
      throw new Error(
        'Cleanup lambda is mandatory. Provide cleanupAfter lambda in beforeAll() method.',
      );
    }

    // Execute cleanup lambda (errors are caught and logged, but don't fail the cleanup process)
    try {
      this.context.logger?.info?.('🧹 Running cleanup...');
      await this.cleanupAfterLambda(this.context);
      this.context.logger?.success?.('✅ Cleanup completed successfully');
    } catch (error: any) {
      // Log cleanup errors but don't throw - cleanup should not fail the test suite
      this.context.logger?.error?.(
        `⚠️ Cleanup error: ${error?.message || String(error)}. Object left in SAP system.`,
      );
    }
  }

  /**
   * Lifecycle: beforeAll
   * Initializes tester (loads config, creates connection), then executes lambda
   * @param lambda - Lambda to execute after initialization
   * @param cleanupAfter - REQUIRED lambda to execute for cleanup (checks YAML params before executing)
   *                       Each test must provide cleanup lambda. Test decides whether to run it via YAML config.
   */
  async beforeAll(lambda: TLambda, cleanupAfter: TLambda): Promise<void> {
    await this.init();
    if (!this.context) {
      throw new Error('Context not initialized');
    }

    // Cleanup lambda is mandatory - each test must set it up
    if (!cleanupAfter) {
      throw new Error(
        'Cleanup lambda is mandatory. Provide cleanupAfter lambda in beforeAll() method. ' +
          'The test decides whether to run it via YAML config (skip_cleanup or cleanup_after flags).',
      );
    }

    // Store cleanup lambda
    this.cleanupAfterLambda = cleanupAfter;
    await lambda(this.context);
  }

  /**
   * Lifecycle: afterAll
   * Cleanup after all tests
   * @param lambda - Lambda to execute for cleanup
   */
  async afterAll(lambda: TLambda): Promise<void> {
    if (!this.context) {
      throw new Error('Context not initialized');
    }
    try {
      await lambda(this.context);
    } finally {
      await this.closeHardModeClient();
    }
  }

  /**
   * Lifecycle: beforeEach
   * Prepares test case for each test
   * Performs pre-cleanup if enabled (removes leftover objects from previous failed tests)
   * @param lambda - Lambda to execute before each test
   */
  async beforeEach(lambda: TLambda): Promise<void> {
    if (!this.context) {
      throw new Error('Context not initialized');
    }

    // Pre-cleanup: Remove leftover objects from previous failed tests
    // This ensures tests start with a clean state even if previous test failed
    const shouldCleanup = getCleanupAfter(this.testCase);
    if (shouldCleanup && this.cleanupAfterLambda) {
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

    await lambda(this.context);
  }

  /**
   * Lifecycle: afterEach
   * Cleanup after each test
   * Automatically checks YAML parameters and executes cleanup if needed
   * This method is guaranteed to run by Jest even if test fails
   * @param lambda - Optional lambda to execute before cleanup check
   */
  async afterEach(lambda?: TLambda): Promise<void> {
    if (!this.context) {
      // If context is not initialized, we can't do cleanup, but don't throw
      // This might happen if beforeAll failed
      return;
    }

    try {
      // Execute custom lambda if provided
      if (lambda) {
        await lambda(this.context);
      }
    } catch (error: any) {
      // Log custom lambda errors but continue with cleanup
      this.context.logger?.warn?.(
        `⚠️ Custom afterEach lambda error (continuing with cleanup): ${error?.message || String(error)}`,
      );
    }

    // Always check YAML parameters and execute cleanup if needed
    // This ensures cleanup runs even if test failed
    // Jest guarantees afterEach runs regardless of test outcome
    try {
      await this.cleanupAfter();
    } catch (error: any) {
      // Cleanup errors are already handled in cleanupAfter(), but log here for visibility
      this.context.logger?.warn?.(
        `⚠️ Cleanup process error: ${error?.message || String(error)}`,
      );
    }
  }

  /**
   * Main run method - executes test function (lambda) with context
   * Ensures cleanup runs even if test fails (cleanup is called by afterEach, which Jest guarantees to run)
   * Note: Jest's afterEach hook will run cleanup even if test fails, so we don't need try-finally here.
   * The cleanup is handled by afterEach() which is called by Jest regardless of test outcome.
   */
  async run(testFunc: TLambda): Promise<void> {
    if (!this.context) {
      throw new Error('Tester not initialized. Call beforeAll() first.');
    }

    if (!this.context.hasConfig) {
      this.context.logger?.testSkip(`Skipping test: No configuration found`);
      return;
    }

    // Check available_in constraint from test case config
    const availableIn = this.context.testCase?.available_in as string[] | undefined;
    if (availableIn && availableIn.length > 0) {
      const systemType = this.context.isCloudSystem ? 'cloud' : 'onprem';
      if (!availableIn.includes(systemType)) {
        this.context.logger?.testSkip(
          `Skipping test: not available on ${systemType} (available_in: ${availableIn.join(', ')})`,
        );
        return;
      }
    }

    if (!this.context.connection || !this.context.session) {
      throw new Error('Connection and session not available');
    }

    // Verify cleanup lambda is set (should be set in beforeAll)
    if (!this.cleanupAfterLambda) {
      throw new Error(
        'Cleanup lambda not set! Each test must provide cleanupAfter lambda in beforeAll(). ' +
          'The test decides whether to run it via YAML config (skip_cleanup or cleanup_after flags).',
      );
    }

    try {
      // Execute test function (lambda) with context
      // Lambda decides what messages to log and whether to pass logger to handlers
      await testFunc(this.context);
    } catch (error: any) {
      // Check if error is a skip condition
      if (error.message?.startsWith('SKIP:')) {
        const skipReason = error.message.replace(/^SKIP:\s*/, '');
        this.context.logger?.testSkip(`Skipping test: ${skipReason}`);
        return; // Don't throw, just skip the test
      }

      this.context.logger?.error(`❌ Test failed: ${error.message}`);
      // Note: Cleanup will still run via afterEach() hook, which Jest guarantees to execute
      // even when test fails. This ensures cleanup runs regardless of test outcome.
      throw error;
    }
  }

  isHardMode(): boolean {
    return isHardModeEnabled();
  }

  getConnection(): import('@mcp-abap-adt/interfaces').IAbapConnection | null {
    return this.context?.connection ?? null;
  }

  async invokeToolOrHandler<T>(
    toolName: string,
    args: Record<string, unknown>,
    directCall: () => Promise<T>,
  ): Promise<T | HandlerLikeResponse> {
    if (!this.isHardMode()) {
      return directCall();
    }

    const mcp = await this.getHardModeClient();
    if (!mcp.toolNames.has(toolName)) {
      throw new Error(`MCP tool "${toolName}" not found in hard mode`);
    }

    const result = await mcp.client.callTool({
      name: toolName,
      arguments: args,
    });
    if (result?.isError) {
      const text = (result.content || [])
        .map((c: any) => (typeof c?.text === 'string' ? c.text : ''))
        .join('\n');
      return {
        isError: true,
        content: [
          { type: 'text', text: text || `${toolName} returned MCP error` },
        ],
      };
    }

    const text = parseToolText(result);
    return {
      isError: false,
      content: [{ type: 'text', text: text || '{}' }],
    };
  }

  protected async getHardModeClient() {
    if (!this.hardModeMcp) {
      this.hardModeMcp = await createHardModeClient();
    }
    return this.hardModeMcp;
  }

  protected async closeHardModeClient(): Promise<void> {
    if (!this.hardModeMcp) {
      return;
    }
    try {
      await this.hardModeMcp.close();
    } finally {
      this.hardModeMcp = null;
    }
  }

  /**
   * Resolve ADT URI for an object based on handler name.
   */
  protected resolveObjectUri(objectName: string): string | null {
    const name = encodeURIComponent(objectName.toLowerCase());
    const handlerName = this.handlerName || '';
    if (handlerName.includes('table')) return `/sap/bc/adt/ddic/tables/${name}`;
    if (handlerName.includes('view'))
      return `/sap/bc/adt/ddic/ddl/sources/${name}`;
    if (handlerName.includes('structure'))
      return `/sap/bc/adt/ddic/structures/${name}`;
    if (handlerName.includes('data_element'))
      return `/sap/bc/adt/ddic/dataelements/${name}`;
    if (handlerName.includes('domain'))
      return `/sap/bc/adt/ddic/domains/${name}`;
    if (handlerName.includes('metadata_extension'))
      return `/sap/bc/adt/ddic/ddlx/sources/${name}`;
    if (handlerName.includes('interface'))
      return `/sap/bc/adt/oo/interfaces/${name}`;
    if (handlerName.includes('class')) return `/sap/bc/adt/oo/classes/${name}`;
    if (handlerName.includes('behavior_definition'))
      return `/sap/bc/adt/bo/behaviordefinitions/${name}`;
    if (handlerName.includes('service_definition'))
      return `/sap/bc/adt/ddic/srvd/sources/${name}`;
    return null;
  }

  /**
   * Force-release DDIC lock on an object if it's locked.
   * Uses /sap/bc/adt/deletion/check to detect locks, then ddlock/locks to release.
   */
  protected async forceReleaseLock(
    connection: any,
    objectName: string,
    logger?: any,
  ): Promise<void> {
    const objectUri = this.resolveObjectUri(objectName);
    if (!objectUri) return;

    const checkResponse = await connection.makeAdtRequest({
      url: '/sap/bc/adt/deletion/check',
      method: 'POST',
      timeout: 30000,
      data: `<?xml version="1.0" encoding="UTF-8"?><del:checkRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core"><del:object adtcore:uri="${objectUri}"/></del:checkRequest>`,
      headers: {
        Accept: 'application/vnd.sap.adt.deletion.check.response.v1+xml',
        'Content-Type': 'application/vnd.sap.adt.deletion.check.request.v1+xml',
      },
    });
    const responseText =
      typeof checkResponse.data === 'string' ? checkResponse.data : '';
    const isLocked =
      responseText.includes('isDeletable="false"') &&
      responseText.includes('lockUser');
    if (isLocked) {
      logger?.debug?.(
        `🔒 Object ${objectName} is locked, releasing DDIC lock...`,
      );
      await connection.makeAdtRequest({
        url: `/sap/bc/adt/ddic/ddlock/locks?lockAction=DELETE&name=${encodeURIComponent(objectName)}`,
        method: 'POST',
        timeout: 30000,
        data: '',
        headers: {},
      });
      logger?.debug?.(`🔓 Released DDIC lock for ${objectName}`);
    }
  }
}
