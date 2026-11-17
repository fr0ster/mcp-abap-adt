/**
 * Types for tester workflow functions
 *
 * Workflow functions receive tester context (connection, session, logger, etc.)
 * and return promises with handler responses.
 *
 * This allows tests to define custom workflow logic with logging while
 * testers provide all common infrastructure (connection, session, logger, etc.)
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { LoggerWithExtras } from '../loggerHelpers';
import type { SessionInfo } from '../sessionHelpers';
import type { CaseParams, TestCase } from '../testConfigSchema';

export interface LambdaTesterContext {
  hasConfig: boolean;
  connection: IAbapConnection;
  session: SessionInfo;
  logger: LoggerWithExtras;
  authType?: string | undefined;
  connectionSource?: 'auth_broker' | 'env' | 'unknown' | undefined;
  isCloudSystem: boolean;
  objectName?: string | null | undefined;
  /** The case's parameters as the YAML states them: a test reads them through its schema (`readCaseParams`). */
  params: CaseParams;
  packageName: string;
  transportRequest?: string | undefined;
  lockHandle?: string | null | undefined;
  lockSession?: SessionInfo | null | undefined;
  cleanupAfter: () => Promise<void>;
  // Common configuration parameters shared across all tests
  defaultPackage?: string | undefined;
  testCase: TestCase | null; // Test case definition from YAML
}

/**
 * Workflow function that receives tester context and executes handler logic
 * Test defines how to call handlers, tester provides all infrastructure
 */
export type WorkflowFunction = (
  context: LambdaTesterContext,
) => Promise<unknown>;

export type HighWorkflowFunctions = {
  create: WorkflowFunction;
  update: WorkflowFunction;
  delete?: WorkflowFunction;
};

export type LowWorkflowFunctions = {
  validate?: WorkflowFunction;
  create: WorkflowFunction;
  lock: WorkflowFunction;
  update: WorkflowFunction;
  unlock: WorkflowFunction;
  activate: WorkflowFunction;
  delete?: WorkflowFunction;
};

export type ReadOnlyWorkflowFunction = WorkflowFunction;

/**
 * @deprecated Use LambdaTesterContext instead
 */
export type TesterContext = LambdaTesterContext;
