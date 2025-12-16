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

import { AbapConnection } from '@mcp-abap-adt/connection';
import {
  createTestConnectionAndSession,
  SessionInfo
} from '../sessionHelpers';
import {
  loadTestEnv,
  getEnabledTestCase,
  getTimeout,
  getOperationDelay,
  resolvePackageName,
  resolveTransportRequest,
  getCleanupAfter,
  loadTestConfig} from '../configHelpers';
import { createTestLogger, type LoggerWithExtras } from '../loggerHelpers';

export abstract class BaseTester {
  // Configuration
  protected readonly handlerName: string;
  protected readonly testCaseName: string;
  protected readonly logPrefix: string;
  protected readonly paramsGroupName: string | undefined;

  // Connection and session
  protected connection: AbapConnection | null = null;
  protected session: SessionInfo | null = null;
  protected hasConfig: boolean = false;

  // Test case data
  protected testCase: any = null;
  protected testParams: any = null; // Resolved parameters from group (if paramsGroupName is provided)

  // Object name (resolved from test params, set by subclasses in beforeEach)
  protected objectName: string | null = null;

  // Logger
  protected logger: LoggerWithExtras;

  /**
   * Constructor
   * @param handlerName - Name of the handler (e.g., 'create_behavior_definition_low')
   * @param testCaseName - Name of the test case (e.g., 'full_workflow')
   * @param logPrefix - Prefix for log messages (e.g., 'bdef-low')
   * @param paramsGroupName - Optional: Name of parameter group in YAML to use for test parameters
   */
  constructor(
    handlerName: string,
    testCaseName: string,
    logPrefix: string,
    paramsGroupName?: string
  ) {
    this.handlerName = handlerName;
    this.testCaseName = testCaseName;
    this.logPrefix = logPrefix;
    this.paramsGroupName = paramsGroupName;
    this.logger = createTestLogger(logPrefix);
  }

  /**
   * Lifecycle: beforeAll
   * Loads environment variables and prepares configuration
   */
  async beforeAll(): Promise<void> {
    try {
      await loadTestEnv();
      this.hasConfig = true;
      // Only log debug in debug mode
      if (process.env.DEBUG_TESTS === 'true' || process.env.DEBUG_ADT_TESTS === 'true') {
        this.logger?.debug('Configuration loaded successfully');
      }
    } catch (error: any) {
      this.logger?.warn(`⚠️ Skipping tests: No .env file or SAP configuration found: ${error?.message || String(error)}`);
      this.hasConfig = false;
    }
  }

  /**
   * Lifecycle: afterAll
   * Cleanup after all tests
   */
  async afterAll(): Promise<void> {
    // Override in subclasses if needed
    // Only log debug in debug mode
    if (process.env.DEBUG_TESTS === 'true' || process.env.DEBUG_ADT_TESTS === 'true') {
      this.logger?.debug('afterAll: cleanup completed');
    }
  }

  /**
   * Lifecycle: beforeEach
   * Prepares test case for each test
   */
  async beforeEach(): Promise<void> {
    if (!this.hasConfig) {
      return;
    }

    this.testCase = getEnabledTestCase(this.handlerName, this.testCaseName);
    if (!this.testCase) {
      // Only log debug in debug mode
      if (process.env.DEBUG_TESTS === 'true' || process.env.DEBUG_ADT_TESTS === 'true') {
        this.logger?.debug(`No test case found for ${this.handlerName}/${this.testCaseName}`);
      }
      return;
    }

    // Resolve parameters from group if paramsGroupName is provided
    if (this.paramsGroupName) {
      this.testParams = this.resolveParamsFromGroup(this.testCase, this.paramsGroupName);
      if (!this.testParams) {
        this.logger?.warn(`Parameter group "${this.paramsGroupName}" not found in test case`);
        // Fallback to direct params
        this.testParams = this.testCase.params;
      } else {
        // Only log debug in debug mode
        if (process.env.DEBUG_TESTS === 'true' || process.env.DEBUG_ADT_TESTS === 'true') {
          this.logger?.debug(`Using parameters from group: ${this.paramsGroupName}`);
        }
      }
    } else {
      // Use params directly from test case
      this.testParams = this.testCase.params;
    }

    // Only log debug in debug mode
    if (process.env.DEBUG_TESTS === 'true' || process.env.DEBUG_ADT_TESTS === 'true') {
      this.logger?.debug(`Test case loaded: ${this.testCaseName}`);
    }
  }

  /**
   * Resolve parameters from a parameter group in YAML
   * Supports two structures:
   * 1. params_groups.groupName in test case
   * 2. Global params_groups.groupName in config root
   * @param testCase - Test case object
   * @param groupName - Name of the parameter group
   * @returns Parameters object or null if not found
   */
  protected resolveParamsFromGroup(testCase: any, groupName: string): any | null {
    // Try structure 1: params_groups.groupName in test case
    if (testCase.params_groups && testCase.params_groups[groupName]) {
      return testCase.params_groups[groupName];
    }

    // Try structure 2: Global params_groups.groupName in config root
    const config = this.loadTestConfig();
    if (config.params_groups && config.params_groups[groupName]) {
      return config.params_groups[groupName];
    }

    return null;
  }

  /**
   * Get test parameters (resolved from group if paramsGroupName was provided)
   * @returns Test parameters object
   */
  protected getTestParams(): any {
    return this.testParams || this.testCase?.params || {};
  }

  /**
   * Lifecycle: afterEach
   * Cleanup after each test
   */
  async afterEach(): Promise<void> {
    // Override in subclasses if needed
    // Only log debug in debug mode
    if (process.env.DEBUG_TESTS === 'true' || process.env.DEBUG_ADT_TESTS === 'true') {
      this.logger?.debug('afterEach: cleanup completed');
    }
  }

  /**
   * Create connection and session for a test
   * Uses AuthBroker (from destination or .env file directory) or falls back to getSapConfigFromEnv()
   */
  protected async createConnection(): Promise<void> {
    if (!this.hasConfig) {
      throw new Error('Cannot create connection: configuration not loaded');
    }

    try {
      const { connection, session } = await createTestConnectionAndSession();
      this.connection = connection;
      this.session = session;
      // Only log debug in debug mode
      if (process.env.DEBUG_TESTS === 'true' || process.env.DEBUG_ADT_TESTS === 'true') {
        this.logger?.debug('Connection and session created successfully');
      }
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error(`Failed to create connection: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Load test configuration
   * @returns Test configuration object
   */
  protected loadTestConfig(): any {
    return loadTestConfig();
  }

  /**
   * Get logger with prefix
   * @returns Logger instance
   */
  protected getLogger(): LoggerWithExtras {
    return this.logger;
  }

  /**
   * Get timeout for test
   * @param testCase - Optional test case override
   * @returns Timeout in milliseconds
   */
  protected getTimeout(testCase?: any): number {
    return getTimeout(testCase || this.testCase);
  }

  /**
   * Get operation delay
   * @param operation - Operation name (e.g., 'create', 'lock')
   * @param testCase - Optional test case override
   * @returns Delay in milliseconds
   */
  protected getOperationDelay(operation: string, testCase?: any): number {
    return getOperationDelay(operation, testCase || this.testCase);
  }

  /**
   * Resolve package name
   * @param testCase - Optional test case override
   * @returns Package name
   */
  protected resolvePackageName(testCase?: any): string {
    return resolvePackageName(testCase || this.testCase);
  }

  /**
   * Resolve transport request
   * @param testCase - Optional test case override
   * @returns Transport request or undefined
   */
  protected resolveTransportRequest(testCase?: any): string | undefined {
    return resolveTransportRequest(testCase || this.testCase);
  }

  /**
   * Get cleanup after test flag
   * @param testCase - Optional test case override
   * @returns Whether to cleanup after test
   */
  protected getCleanupAfter(testCase?: any): boolean {
    // If testParams are resolved from a group, merge them with testCase for cleanup check
    // This ensures skip_cleanup and cleanup_after from params group are respected
    if (!testCase && this.testParams && this.testCase) {
      // Create a merged test case object that includes params from group
      const mergedTestCase = {
        ...this.testCase,
        params: {
          ...this.testCase.params,
          ...this.testParams // Params from group override direct params
        }
      };
      const result = getCleanupAfter(mergedTestCase);
      // Only log debug in debug mode
      if (process.env.DEBUG_TESTS === 'true' || process.env.DEBUG_ADT_TESTS === 'true') {
        const skipCleanup = mergedTestCase.params?.skip_cleanup;
        const cleanupAfter = mergedTestCase.params?.cleanup_after;
        this.logger?.debug(`Cleanup check: skip_cleanup=${skipCleanup}, cleanup_after=${cleanupAfter}, result=${result}`);
      }
      return result;
    }
    const result = getCleanupAfter(testCase || this.testCase);
    // Only log debug in debug mode
    if (process.env.DEBUG_TESTS === 'true' || process.env.DEBUG_ADT_TESTS === 'true') {
      const tc = testCase || this.testCase;
      const skipCleanup = tc?.params?.skip_cleanup;
      const cleanupAfter = tc?.params?.cleanup_after;
      this.logger?.debug(`Cleanup check: skip_cleanup=${skipCleanup}, cleanup_after=${cleanupAfter}, result=${result}`);
    }
    return result;
  }

  /**
   * Check if test should be skipped
   * @returns True if test should be skipped
   */
  protected shouldSkipTest(): boolean {
    return !this.hasConfig || !this.testCase || !this.connection || !this.session;
  }

  /**
   * Get skip reason
   * @returns Reason for skipping test
   */
  protected getSkipReason(): string {
    const reasons: string[] = [];
    if (!this.hasConfig) reasons.push('no config');
    if (!this.testCase) reasons.push('no test case');
    if (!this.connection) reasons.push('no connection');
    if (!this.session) reasons.push('no session');
    return reasons.join(', ');
  }

  /**
   * Abstract method: run
   * Must be implemented by subclasses
   */
  abstract run(): Promise<void>;

  /**
   * Get connection (readonly)
   */
  getConnection(): AbapConnection | null {
    return this.connection;
  }

  /**
   * Get session (readonly)
   */
  getSession(): SessionInfo | null {
    return this.session;
  }

  /**
   * Get test case (readonly)
   */
  getTestCase(): any {
    return this.testCase;
  }

  /**
   * Get hasConfig flag
   */
  getHasConfig(): boolean {
    return this.hasConfig;
  }

  /**
   * Get tester context for workflow functions
   * Provides all infrastructure (connection, session, logger, params, etc.)
   * that tests need to call handlers
   *
   * This allows tests to define workflow functions (lambdas) that receive
   * all necessary infrastructure from tester, making tests simpler and
   * ensuring all tests use the same connection/session/logger setup.
   */
  protected getContext(): any {
    if (!this.connection || !this.session) {
      throw new Error('Connection and session must be created before getting context');
    }

    const params = this.getTestParams();
    const packageName = this.resolvePackageName();
    const transportRequest = this.resolveTransportRequest();

    return {
      connection: this.connection,
      session: this.session,
      logger: this.logger,
      objectName: this.objectName,
      params,
      packageName,
      transportRequest,
      // Lock-related (for LowTester)
      lockHandle: (this as any).lockHandle || null,
      lockSession: (this as any).lockSession || null
    };
  }
}
