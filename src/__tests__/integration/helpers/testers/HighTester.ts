/**
 * HighTester - Compatibility wrapper for LambdaTester
 *
 * This is a temporary compatibility layer for tests that haven't been migrated yet.
 * All tests should eventually be migrated to use LambdaTester directly.
 *
 * @deprecated Use LambdaTester instead
 */

import type {
  HandlerEntry,
  ToolArgs,
} from '../../../../lib/handlers/interfaces';
import { getCleanupAfter, getSystemType } from '../configHelpers';
import type { LoggerWithExtras } from '../loggerHelpers';
import { skipRunningTest } from '../runningTest';
import type { CaseParams } from '../testConfigSchema';
import { createHandlerContext, delay } from '../testHelpers';
import { thrownStatus, thrownWords } from '../thrownValue';
import {
  callTool,
  isHardModeEnabled,
  resolveEntityFromHandlerName,
  toolCandidates,
} from './hardMode';
import { LambdaTester, type TLambda } from './LambdaTester';
import type { LambdaTesterContext } from './types';

/**
 * The tools a high-level test drives, as their entries (`defineTool`): the
 * arguments built from the case go through the tool's schema, as a model's
 * call does, and the handler gets its output.
 */
export type HighWorkflowFunctions = {
  create: HandlerEntry;
  update: HandlerEntry;
  delete?: HandlerEntry;
};

/** The case's `keys` it states (a truthy value), each under its own name. */
function statedOf(
  params: CaseParams,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (params[key]) out[key] = params[key];
  }
  return out;
}

/** The case's `keys` it gives any value, `false` and `0` included. */
function givenOf(
  params: CaseParams,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (params[key] !== undefined) out[key] = params[key];
  }
  return out;
}

/** `to` from the first of `from` the case states, when it states one. */
function firstStated(
  params: CaseParams,
  to: string,
  from: readonly string[],
): Record<string, unknown> {
  for (const key of from) {
    if (params[key]) return { [to]: params[key] };
  }
  return {};
}

/** What a create carries from the case when stated, by type: CDS, class, BDEF, BIMP, DTEL, structure, domain, SRVB, SRVD, FUGR. */
const CREATE_STATED = [
  'ddl_code',
  'source_code',
  'superclass',
  'root_entity',
  'implementation_type',
  'behavior_definition',
  'implementation_code',
  'type_kind',
  'type_name',
  'data_type',
  'short_label',
  'medium_label',
  'long_label',
  'heading_label',
  'fields',
  'datatype',
  'service_definition_name',
  'binding_variant',
  'service_name',
  'service_version',
  'ddl_source',
  'function_group_name',
  'function_group_description',
  'function_module_name',
  'function_module_description',
] as const;

/** The case's values a create or an update carries even when false or 0. */
const GIVEN = ['length', 'decimals', 'lowercase', 'sign_exists'] as const;

/** What an update carries from the case when stated, each under its own name. */
const UPDATE_STATED = [
  'root_entity',
  'behavior_definition',
  'type_kind',
  'type_name',
  'data_type',
  'fields',
  'datatype',
] as const;

/** The text of an axios-shaped thrown value's `response.data`, if it is text. */
function thrownResponseText(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return '';
  }
  const response = error.response;
  if (typeof response !== 'object' || response === null) return '';
  const data: unknown = Reflect.get(response, 'data');
  return typeof data === 'string' ? data : '';
}

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
            const entity = resolveEntityFromHandlerName(this.handlerName);
            const mcp = await this.getHardModeClient();
            const deleteArgs = this.buildDeleteArgs(context);
            await callTool(
              mcp,
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
          const deleteResponse = await deleteFunction.call(
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
        } catch (error) {
          logger?.error?.(
            `Cleanup delete error: ${thrownWords(error)}. Object left in SAP system.`,
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
      skipRunningTest(`No configuration found`);
      return;
    }

    if (this.skipsOnThisSystem()) {
      return;
    }

    if (!this.workflowFunctions) {
      throw new Error('Workflow functions not provided');
    }

    this.testFailed = false;
    if (isHardModeEnabled()) {
      await this.runInHardMode();
      return;
    }

    const handlerContext = createHandlerContext({
      connection: this.context.connection,
      logger: this.context.logger,
    });
    const logger = this.context.logger;
    const { create, update } = this.workflowFunctions;

    try {
      // Execute create workflow
      {
        logger?.info(`   • create ${this.context.objectName}`);
        const args = this.buildCreateArgs(this.context);
        await this.retryOnConflict(
          () => create.call(handlerContext, args),
          `Create ${this.context.objectName}`,
          logger,
          5,
          8000,
        );
        logger?.info(`   ✅ create completed`);
      }

      // Execute update workflow
      {
        logger?.info(`   • update ${this.context.objectName}`);
        const args = this.buildUpdateArgs(this.context);
        await this.retryOnConflict(
          () => update.call(handlerContext, args),
          `Update ${this.context.objectName}`,
          logger,
        );
        logger?.info(`   ✅ update completed`);
      }
    } catch (error) {
      // Check if error is a skip condition
      const words = thrownWords(error);
      if (words.startsWith('SKIP:')) {
        const skipReason = words.replace(/^SKIP:\s*/, '');
        skipRunningTest(`${skipReason}`);
        return;
      }

      // High handlers manage locks internally — if handler crashed mid-operation,
      // force-release DDIC lock so cleanup can delete the object

      this.testFailed = true;
      this.context.logger?.error(`❌ Test failed: ${words}`);
      throw error;
    }
  }

  private async runInHardMode(): Promise<void> {
    if (!this.context) {
      throw new Error('Tester not initialized. Call beforeAll() first.');
    }
    const logger = this.context.logger;
    const entity = resolveEntityFromHandlerName(this.handlerName);
    const mcp = await this.getHardModeClient();

    try {
      if (this.workflowFunctions?.create) {
        logger?.info(`   • create ${this.context.objectName} (hard mode)`);
        const args = this.buildCreateArgs(this.context);
        await this.retryOnConflict(
          () =>
            callTool(
              mcp,
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
              mcp,
              toolCandidates('update', entity, 'high', this.handlerName),
              args,
            ),
          `Update ${this.context.objectName} (hard mode)`,
          logger,
        );
        logger?.info(`   ✅ update completed`);
      }
    } catch (error) {
      const words = thrownWords(error);
      if (words.startsWith('SKIP:')) {
        const skipReason = words.replace(/^SKIP:\s*/, '');
        skipRunningTest(`${skipReason}`);
        return;
      }

      this.testFailed = true;
      this.context.logger?.error(`❌ Test failed: ${words}`);
      throw error;
    }
  }

  /**
   * Retry operation on transient SAP errors after delete+create:
   * - HTTP 409 Conflict (TADIR stale entry) — SAP's recommendation: "Repeat the function."
   * - SWB_TOOL019 "description is missing" — SAP hasn't propagated prior deletion yet
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
      } catch (error) {
        const errorMsg = thrownWords(error);
        const responseData = thrownResponseText(error);
        const isTransientConflict =
          thrownStatus(error) === 409 ||
          errorMsg.includes('object directory entry') ||
          errorMsg.includes('already exists') ||
          responseData.includes('SWB_TOOL') ||
          responseData.includes('description is missing');
        if (isTransientConflict && attempt < maxRetries) {
          logger?.warn?.(
            `⚠️ ${label}: transient SAP error, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`,
          );
          await delay(delayMs);
          continue;
        }
        throw error;
      }
    }
    throw new Error(`${label}: exceeded max retries`);
  }

  private buildCreateArgs(context: LambdaTesterContext): ToolArgs {
    const { objectName, params, packageName, transportRequest } = context;
    const nameField = this.getCreateUpdateNameField();
    return this.declaredBy('create', {
      [nameField]: objectName,
      package_name: packageName,
      description: params.description || objectName,
      ...statedOf(params, CREATE_STATED),
      ...givenOf(params, GIVEN),
      ...(transportRequest && { transport_request: transportRequest }),
    });
  }

  private buildUpdateArgs(context: LambdaTesterContext): ToolArgs {
    const { objectName, params, packageName, transportRequest } = context;
    const nameField = this.getCreateUpdateNameField();
    return this.declaredBy('update', {
      [nameField]: objectName,
      ...(packageName && { package_name: packageName }),
      ...(transportRequest && { transport_request: transportRequest }),
      ...firstStated(params, 'ddl_code', ['update_ddl_code', 'ddl_code']),
      ...firstStated(params, 'source_code', [
        'update_source_code',
        'source_code',
      ]),
      ...firstStated(params, 'description', ['update_description']),
      ...firstStated(params, 'implementation_code', [
        'update_implementation_code',
        'implementation_code',
      ]),
      ...statedOf(params, UPDATE_STATED),
      ...givenOf(params, GIVEN),
      ...firstStated(params, 'ddl_source', ['update_ddl_source', 'ddl_source']),
    });
  }

  /**
   * Of `args`, the ones the `step` tool's schema names: the stated keys are
   * one list for every object type (a class's `source_code`, a table's
   * `ddl_code`), and a model sends a tool only the arguments its schema
   * offers, so a key another type's tool takes is not sent.
   */
  private declaredBy(
    step: 'create' | 'update',
    args: Record<string, unknown>,
  ): ToolArgs {
    const entry = this.workflowFunctions?.[step];
    if (!entry) return args;
    const shape = entry.toolDefinition.inputSchema.shape;
    return Object.fromEntries(
      Object.entries(args).filter(([key]) => Object.hasOwn(shape, key)),
    );
  }

  private buildDeleteArgs(context: LambdaTesterContext): ToolArgs {
    const { objectName, transportRequest } = context;
    const nameField = this.getNameField();
    return {
      [nameField]: objectName,
      ...(transportRequest && { transport_request: transportRequest }),
    };
  }

  /**
   * Returns the name field used for DELETE operations.
   * May differ from the create/update name field for some types.
   */
  private getNameField(): string {
    const handlerName = this.handlerName;
    // behavior_implementation must be checked before behavior_definition (substring)
    if (handlerName.includes('behavior_implementation')) return 'class_name';
    if (handlerName.includes('behavior_definition'))
      return 'behavior_definition_name';
    if (handlerName.includes('data_element')) return 'data_element_name';
    if (handlerName.includes('metadata_extension')) return 'ddlx_name';
    if (handlerName.includes('service_binding')) return 'service_binding_name';
    if (handlerName.includes('service_definition'))
      return 'service_definition_name';
    if (handlerName.includes('class')) return 'class_name';
    if (handlerName.includes('table')) return 'table_name';
    if (handlerName.includes('ddl')) return 'ddl_name';
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
    const handlerName = this.handlerName;
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
    // No delete before a test. The name check before create says whether the
    // name can be used, and why not; deleting first only adds requests that
    // fail on their own (an object gone but still in the object directory of
    // an open request). Cleaning up after itself is the test's job.
  }

  async afterEach(): Promise<void> {
    // HighTester compatibility - cleanup handled by cleanupAfter
    // Use this.cleanupAfter() to ensure YAML parameter checking works correctly
    await this.cleanupAfter();
  }
}
