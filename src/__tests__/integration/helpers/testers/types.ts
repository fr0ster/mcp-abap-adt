/**
 * Types for tester workflow functions
 *
 * Workflow functions receive tester context (connection, session, logger, etc.)
 * and return promises with handler responses.
 *
 * This allows tests to define custom workflow logic with logging while
 * testers provide all common infrastructure (connection, session, logger, etc.)
 */

import type { AbapConnection } from '@mcp-abap-adt/connection';
import type { LoggerWithExtras } from '../loggerHelpers';
import type { SessionInfo } from '../sessionHelpers';

export interface LambdaTesterContext {
  hasConfig: boolean;
  connection: AbapConnection;
  session: SessionInfo;
  logger: LoggerWithExtras;
  objectName?: string | null;
  params: any;
  packageName: string;
  transportRequest?: string;
  lockHandle?: string | null;
  lockSession?: SessionInfo | null;
  cleanupAfter: () => Promise<void>;
  // Common configuration parameters shared across all tests
  getOperationDelay: (operation: string) => number;
  defaultPackage?: string;
  testCase: any; // Test case definition from YAML
}

/**
 * Workflow function that receives tester context and executes handler logic
 * Test defines how to call handlers, tester provides all infrastructure
 */
export type WorkflowFunction = (context: LambdaTesterContext) => Promise<any>;

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
