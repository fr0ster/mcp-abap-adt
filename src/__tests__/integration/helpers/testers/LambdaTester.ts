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

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import {
  getCleanupAfter,
  getCleanupAfterRun,
  getTestCase,
  loadTestConfig,
  loadTestEnv,
  resolvePackageName,
  resolveTestSystemContext,
  resolveTransportRequest,
  testCaseKey,
} from '../configHelpers';
import {
  type ConfiguredSystemKind,
  configuredSystemKindOf,
  NO_KIND_STATED,
} from '../configuredSystemKind';
import { heldLocksIfAny, heldLocksOf } from '../heldLiveLocks';
import { createTestLogger, type LoggerWithExtras } from '../loggerHelpers';
import { PackageGuardRefusal } from '../packageGuard';
import { primeSystemContext } from '../primeSystemContext';
import { credentialRefused } from '../refusalGuard';
import { skipRunningTest } from '../runningTest';
import {
  createTestConnectionAndSession,
  type SessionInfo,
} from '../sessionHelpers';
import type { CaseParams, TestCase } from '../testConfigSchema';
import { thrownWords } from '../thrownValue';
import {
  createHardModeClient,
  type HardModeClient,
  isHardModeEnabled,
  parseToolText,
} from './hardMode';
import type { LambdaTesterContext } from './types';

/** The parameters naming the object a case works on, in the order they are read. */
const OBJECT_NAME_PARAMS = [
  'name',
  'class_name',
  'interface_name',
  'function_name',
  'program_name',
  'table_name',
  'ddl_name',
  'domain_name',
  'data_element_name',
  'structure_name',
  'bdef_name',
  'ddlx_name',
  'bimp_name',
  'metadata_extension_name',
  'service_binding_name',
  'service_definition_name',
  'test_package',
] as const;

/** The first of `OBJECT_NAME_PARAMS` the case states as a non-empty string. */
function objectNameOf(params: CaseParams): string | null {
  for (const key of OBJECT_NAME_PARAMS) {
    const value = params[key];
    if (typeof value === 'string' && value !== '') return value;
  }
  return null;
}

/** The authentication a connection reports through a `getConfig()` beyond its contract, if any. */
function reportedAuthType(connection: object): string | undefined {
  if (!('getConfig' in connection)) return undefined;
  const getConfig = connection.getConfig;
  if (typeof getConfig !== 'function') return undefined;
  const config: unknown = Reflect.apply(getConfig, connection, []);
  if (typeof config !== 'object' || config === null) return undefined;
  const authType: unknown = Reflect.get(config, 'authType');
  return typeof authType === 'string' ? authType : undefined;
}

export type TLambda = (context: LambdaTesterContext) => Promise<void>;
type HandlerLikeResponse = {
  isError: boolean;
  content: Array<{ type: 'text'; text: string }>;
};
const HARD_MODE_RUN_ID = Math.random().toString(36).slice(2, 6).toUpperCase();

/**
 * The kind a tester runs on, or why it skips: stated only
 * (`configuredSystemKindOf` — the config's `environment.system_type`, then
 * `SAP_SYSTEM_TYPE`), never from the credential (a JWT is no sign of a cloud
 * system) and never `onprem` by default.
 */
export function testerSystemKind(
  config: unknown,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): { kind: ConfiguredSystemKind; isCloudSystem: boolean } | { skip: string } {
  const kind = configuredSystemKindOf(config, env);
  return kind === undefined
    ? { skip: NO_KIND_STATED }
    : { kind, isCloudSystem: kind === 'cloud' };
}

/**
 * A cleanup that is part of the test: deleting what the test created was
 * refused, or the object still reads after its delete. The tester passes it
 * on, so the test fails; any other cleanup error is only logged.
 */
export class CleanupFailure extends Error {}

export class LambdaTester {
  // Configuration
  protected readonly handlerName: string;
  protected readonly testCaseName: string;
  protected readonly logPrefix: string;
  protected readonly paramsGroupName: string | undefined;
  protected testCase: TestCase | null = null;
  protected testParams: CaseParams | null = null;
  protected context: LambdaTesterContext | undefined;
  protected cleanupAfterLambda: TLambda | null = null;
  /**
   * Set when the test body threw (a skip does not count). `cleanupAfter`
   * reads it: a failed test keeps its objects for analysis — see
   * `getCleanupAfterRun`.
   */
  protected testFailed = false;
  /** A test that skipped itself created nothing, so nothing is deleted. */
  protected testSkipped = false;
  /** Why the tester does not run at all: no system kind stated. */
  protected kindSkip: string | undefined;
  /** Why the tester has no case to run: the config key it lacks, or why it could not start. */
  protected configSkip: string | undefined;
  protected hardModeMcp: HardModeClient | null = null;

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
   * The package the case creates in (`context.packageName`), checked by the
   * package guard: the case's `package_name`, else the default package. A
   * suite whose `package_name` names what it reads, not where it creates,
   * overrides this.
   */
  protected creationPackage(testCase: TestCase): string {
    return resolvePackageName(testCase);
  }

  /**
   * Initialize tester - loads config, creates connection, sets up context
   * Must be called before using tester
   */
  async init(): Promise<void> {
    let hasConfig = false;
    let connection: IAbapConnection | null = null;
    let session: SessionInfo | null = null;
    let logger: LoggerWithExtras | null = null;
    let testCase: TestCase | null = null;
    let testParams: CaseParams = {};
    let objectName: string | null = null;
    let packageName = '';
    let transportRequest: string | undefined;
    let authType: string | undefined;
    let connectionSource: 'auth_broker' | 'env' | 'unknown' = 'unknown';
    let isCloudSystem = false;

    try {
      // Load test config from YAML
      const config = loadTestConfig();
      // The system kind, stated: the tester refuses to start without one.
      const stated = testerSystemKind(config);
      if ('skip' in stated) {
        this.kindSkip = stated.skip;
        throw new Error(stated.skip);
      }
      isCloudSystem = stated.isCloudSystem;
      const hardModeEnabled =
        config?.environment?.integration_hard_mode?.enabled === true ||
        config?.integration_hard_mode?.enabled === true;

      // Load environment variables only for in-process mode
      if (!hardModeEnabled) {
        await loadTestEnv();
      }
      hasConfig = true;

      testCase = getTestCase(this.handlerName, this.testCaseName);

      if (!testCase) {
        this.configSkip = `the test config has no ${testCaseKey(this.handlerName, this.testCaseName)}`;
        throw new Error(this.configSkip);
      }

      // Resolve parameters from group if paramsGroupName is provided
      if (this.paramsGroupName) {
        // Try structure 1: params_groups.groupName in test case
        const fromCase = testCase.params_groups?.[this.paramsGroupName];
        // Try structure 2: Global params_groups.groupName in config root
        const fromConfig = config.params_groups?.[this.paramsGroupName];
        // Fallback to direct params
        testParams = fromCase ?? fromConfig ?? testCase.params ?? {};
      } else {
        // Use params directly from test case
        testParams = testCase.params ?? {};
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
        const originalObjectName = objectNameOf(testParams);

        objectName = originalObjectName;
        if (originalObjectName && suffixRaw) {
          const normalizedSuffix = `${suffixRaw}_${HARD_MODE_RUN_ID}`
            .toUpperCase()
            .replace(/[^A-Z0-9_]/g, '_');
          const suffixed = `${originalObjectName.toUpperCase()}_${normalizedSuffix}`;
          const renamed = suffixed.slice(0, 30);
          objectName = renamed;

          // Keep params in sync with object name for arg builders
          if (testParams.program_name) testParams.program_name = renamed;
          if (testParams.class_name) testParams.class_name = renamed;
          if (testParams.interface_name) testParams.interface_name = renamed;
          if (testParams.function_name) testParams.function_name = renamed;
          if (testParams.table_name) testParams.table_name = renamed;
          if (testParams.ddl_name) testParams.ddl_name = renamed;
          if (testParams.domain_name) testParams.domain_name = renamed;
          if (testParams.data_element_name)
            testParams.data_element_name = renamed;
          if (testParams.structure_name) testParams.structure_name = renamed;
          if (testParams.service_binding_name)
            testParams.service_binding_name = renamed;
          if (testParams.test_package) testParams.test_package = renamed;
          if (testParams.name) testParams.name = renamed;

          // Adjust embedded source to avoid name mismatch in checks/update
          if (typeof testParams.source_code === 'string') {
            testParams.source_code = testParams.source_code.replace(
              new RegExp(String(originalObjectName), 'gi'),
              renamed,
            );
          }
          if (typeof testParams.update_source_code === 'string') {
            testParams.update_source_code =
              testParams.update_source_code.replace(
                new RegExp(String(originalObjectName), 'gi'),
                renamed,
              );
          }
          if (typeof testParams.ddl_code === 'string') {
            testParams.ddl_code = testParams.ddl_code.replace(
              new RegExp(String(originalObjectName), 'gi'),
              renamed,
            );
          }
          if (typeof testParams.update_ddl_code === 'string') {
            testParams.update_ddl_code = testParams.update_ddl_code.replace(
              new RegExp(String(originalObjectName), 'gi'),
              renamed,
            );
          }
        }

        const testCaseWithParams = { ...testCase, params: testParams };
        packageName = this.creationPackage(testCaseWithParams);
        transportRequest = resolveTransportRequest(testCaseWithParams);
        const defaultPackage = config.environment?.default_package;
        this.context = {
          hasConfig: true,
          connection: {} as IAbapConnection,
          session: {} as SessionInfo,
          logger,
          authType: undefined,
          connectionSource: 'unknown',
          isCloudSystem,
          objectName,
          params: testParams,
          packageName,
          transportRequest,
          cleanupAfter: this.cleanupAfter.bind(this),
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
      // A soft-mode run connection: the locks it holds are owned by its
      // registry until SAP answered their release (#394, spec §3).
      heldLocksOf(connection);

      // Resolve system context for tests (set SAP_MASTER_SYSTEM from YAML if not already set)
      const testCtx = resolveTestSystemContext();
      if (testCtx.masterSystem && !process.env.SAP_MASTER_SYSTEM) {
        process.env.SAP_MASTER_SYSTEM = testCtx.masterSystem;
      }
      if (testCtx.responsible && !process.env.SAP_RESPONSIBLE) {
        process.env.SAP_RESPONSIBLE = testCtx.responsible;
      }
      // Populate system context cache so createAdtClient() picks it up
      await primeSystemContext(connection);
      authType = connectionResult.authType || reportedAuthType(connection);
      connectionSource = connectionResult.connectionSource || 'unknown';

      // Resolve object name from params
      objectName = objectNameOf(testParams);

      // Resolve package name and transport request
      // Create testCase object with resolved params for resolve functions
      const testCaseWithParams = { ...testCase, params: testParams };
      packageName = this.creationPackage(testCaseWithParams);
      transportRequest = resolveTransportRequest(testCaseWithParams);

      // Get default package from config
      const defaultPackage = config.environment?.default_package;

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
        defaultPackage,
        testCase,
      };

      this.testCase = testCase;
      this.testParams = testParams;
    } catch (error) {
      // The package guard's refusal fails the case: it is never a skip.
      if (error instanceof PackageGuardRefusal) throw error;
      // If initialization failed, create minimal context
      const errorLogger = createTestLogger(this.logPrefix);
      errorLogger?.warn(`⚠️ Failed to initialize tester: ${thrownWords(error)}`);
      this.configSkip ??= `the tester could not start: ${thrownWords(error)}`;

      this.context = {
        hasConfig: false,
        connection: connection || ({} as IAbapConnection),
        session: session || ({} as SessionInfo),
        logger: errorLogger,
        authType: undefined,
        connectionSource: 'unknown',
        isCloudSystem,
        objectName: null,
        params: {},
        packageName: '',
        transportRequest: undefined,
        cleanupAfter: async () => {},
        defaultPackage: undefined,
        testCase: null,
      };
    }
  }

  /**
   * Sends, once, the unlock of every lock the soft-mode run connection still
   * holds (`held`), each on the handler context that took it; a lock whose
   * unlock was already sent is not sent again, and every lock still owned is
   * reported. Nothing after a credential refusal; nothing in hard mode, where
   * the server owns its locks.
   */
  protected async releaseOwnedLocks(): Promise<void> {
    const connection = this.context?.connection;
    if (connection === undefined) return;
    const locks = heldLocksIfAny(connection);
    if (locks === undefined || locks.stillHeld.length === 0) return;
    const logger = this.context?.logger;
    if (credentialRefused()) {
      for (const { lock, state } of locks.stillOwned) {
        logger?.warn?.(
          `🔒 not released after a credential refusal (${state}): ${lock.object_type} ${lock.object_name}`,
        );
      }
      return;
    }
    await locks.releaseAll(undefined, (line) => logger?.warn?.(`🔒 ${line}`));
  }

  /**
   * Cleanup after test - checks if cleanup is needed and performs it
   * Checks YAML parameters first, then calls cleanup lambda from test
   * This method is designed to be safe to call even if test failed
   */
  protected async cleanupAfter(): Promise<void> {
    // Locks first, unconditionally (#394, spec §4): whatever the YAML
    // policy says about deleting, every lock still `held` is released, once.
    await this.releaseOwnedLocks();
    if (!this.context || !this.testCase) {
      this.context?.logger?.warn?.(
        '⚠️ Cleanup skipped: context or testCase not available',
      );
      return;
    }

    // `SKIP:` is thrown before a test creates anything (read-only suites, and
    // the package suite over RFC). Deleting after it only asked SAP to delete
    // an object nobody made — "Package … has no TDEVC record".
    if (this.testSkipped) {
      this.context.logger?.info?.(
        'ℹ️ Cleanup skipped: the test skipped itself and created nothing',
      );
      return;
    }

    // A failed test keeps what it created, so the objects themselves can say
    // why it failed. Every lock was already released by the test's own
    // finally/unlock steps; only the delete is withheld.
    if (!getCleanupAfterRun(this.testCase, this.testFailed)) {
      if (this.testFailed) {
        this.context.logger?.warn?.(
          '🔎 Test failed — cleanup skipped, its objects are kept for analysis. Delete them once analysed, or set test_settings.cleanup_on_failure: true to have them deleted anyway.',
        );
        return;
      }
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
    // TODO: Legacy systems may report a delete error (false negative) even though the object
    // is actually deleted successfully. Do not treat cleanup errors on legacy as real failures.
    try {
      this.context.logger?.info?.('🧹 Running cleanup...');
      await this.cleanupAfterLambda(this.context);
      this.context.logger?.success?.('✅ Cleanup completed successfully');
    } catch (error) {
      // A delete that must succeed and read back absent fails the test.
      if (error instanceof CleanupFailure) throw error;
      // Log cleanup errors but don't throw - cleanup should not fail the test suite
      this.context.logger?.error?.(
        `⚠️ Cleanup error: ${thrownWords(error)}. Object left in SAP system.`,
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
   * @param lambda - Lambda to execute before each test
   */
  async beforeEach(lambda: TLambda): Promise<void> {
    if (!this.context) {
      throw new Error('Context not initialized');
    }

    // No delete before a test. The name check before create says whether the
    // name can be used, and why not; deleting first only adds requests that
    // fail on their own (an object gone but still in the object directory of
    // an open request). Cleaning up after itself is the test's job.

    await lambda(this.context);
  }

  /**
   * Lifecycle: afterEach
   * Cleanup after each test
   * Automatically checks YAML parameters and executes cleanup if needed
   * This method is guaranteed to run by node:test even if the test fails
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
    } catch (error) {
      // Log custom lambda errors but continue with cleanup
      this.context.logger?.warn?.(
        `⚠️ Custom afterEach lambda error (continuing with cleanup): ${thrownWords(error)}`,
      );
    }

    // Always check YAML parameters and execute cleanup if needed
    // This ensures cleanup runs even if test failed
    // node:test runs afterEach regardless of the test's outcome
    try {
      await this.cleanupAfter();
    } catch (error) {
      if (error instanceof CleanupFailure) throw error;
      // Cleanup errors are already handled in cleanupAfter(), but log here for visibility
      this.context.logger?.warn?.(
        `⚠️ Cleanup process error: ${thrownWords(error)}`,
      );
    }
  }

  /**
   * Main run method - executes test function (lambda) with context
   * Ensures cleanup runs even if test fails (cleanup is called by afterEach, which node:test always runs)
   * Note: node:test's afterEach hook runs cleanup even if the test fails, so we don't need try-finally here.
   * The cleanup is handled by afterEach() which node:test calls regardless of the test's outcome.
   */
  async run(testFunc: TLambda): Promise<void> {
    if (!this.context) {
      throw new Error('Tester not initialized. Call beforeAll() first.');
    }

    if (this.kindSkip !== undefined) {
      skipRunningTest(`${this.kindSkip}`);
      return;
    }

    if (!this.context.hasConfig) {
      skipRunningTest(this.configSkip ?? 'No configuration found');
      return;
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

    this.testFailed = false;
    this.testSkipped = false;
    try {
      // Execute test function (lambda) with context
      // Lambda decides what messages to log and whether to pass logger to handlers
      await testFunc(this.context);
    } catch (error) {
      // Check if error is a skip condition
      const words = thrownWords(error);
      if (words.startsWith('SKIP:')) {
        const skipReason = words.replace(/^SKIP:\s*/, '');
        skipRunningTest(`${skipReason}`);
        this.testSkipped = true;
        return; // Don't throw, just skip the test
      }

      this.testFailed = true;
      this.context.logger?.error(`❌ Test failed: ${words}`);
      // afterEach() still runs, and cleanupAfter() sees testFailed: the
      // objects stay for analysis, and nothing but the delete is skipped.
      throw error;
    }
  }

  isHardMode(): boolean {
    return isHardModeEnabled();
  }

  getConnection():
    | import('@mcp-abap-adt/interfaces-adt-connection').IAbapConnection
    | null {
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

    const result = await mcp.call(toolName, args);
    if (result.isError) {
      const text = result.content.map((c) => c.text).join('\n');
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

  protected async getHardModeClient(): Promise<HardModeClient> {
    if (!this.hardModeMcp) {
      this.hardModeMcp = await createHardModeClient('full');
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
   * **No ADT endpoint is addressed from this repository.** What used to sit
   * here — `resolveObjectUri` and `forceReleaseLock`, a `deletion/check` and a
   * `ddic/ddlock/locks` built by hand — is gone: every endpoint belongs to
   * `@mcp-abap-adt/adt-clients`, and a test helper reaching past it addresses a
   * URL nobody else maintains. It had no callers for as long as it existed, and
   * measured on BTP ABAP on 2026-09-24 the release half could not have worked:
   * `/sap/bc/adt/ddic/ddlock/locks` answers `404 — Resource does not exist`
   * there.
   *
   * Asking whether an object is locked is a member — `checkDeletion` on the
   * object's own accessor, which answers `isDeletable` with the holder in
   * `lockUser`. Releasing another session's lock is not a member, and not
   * something ADT offers us: the protection that works is a suite never
   * orphaning its lock, which is what the unlock discipline in these suites is
   * for.
   */
}
