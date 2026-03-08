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
import type { LoggerWithExtras } from '../loggerHelpers';
import {
  createHandlerContext,
  delay,
  extractLockHandle,
  parseHandlerResponse,
} from '../testHelpers';
import {
  callTool,
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
          // Step 1: Check if object is locked, force-release if so
          // Uses deletion/check to detect locks, then ddlock/locks to release
          try {
            const objectUri = this.resolveObjectUri(objectName);
            if (objectUri) {
              const checkResponse = await connection.makeAdtRequest({
                url: '/sap/bc/adt/deletion/check',
                method: 'POST',
                timeout: 30000,
                data: `<?xml version="1.0" encoding="UTF-8"?><del:checkRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core"><del:object adtcore:uri="${objectUri}"/></del:checkRequest>`,
                headers: {
                  Accept:
                    'application/vnd.sap.adt.deletion.check.response.v1+xml',
                  'Content-Type':
                    'application/vnd.sap.adt.deletion.check.request.v1+xml',
                },
              });
              const responseText =
                typeof checkResponse.data === 'string'
                  ? checkResponse.data
                  : '';
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
                logger?.debug?.(
                  `🔓 Released DDIC lock for ${objectName} (pre-cleanup)`,
                );
              }
            }
          } catch {
            // Ignore — object may not exist or check not applicable
          }

          // Step 2: Delete the object
          if (isHardModeEnabled()) {
            const entity = resolveEntityFromHandlerName(
              (this as any).handlerName || '',
            );
            const mcp = await this.getHardModeClient();
            await this.ensureHardModeSession(mcp, context);
            const deleteArgs = this.buildDeleteArgs(context);
            await callTool(
              mcp.client,
              mcp.toolNames,
              toolCandidates('delete', entity, 'low', this.handlerName),
              deleteArgs,
            );
            logger?.info?.(`🗑️ Deleted ${objectName}`);
            return;
          }

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

        // Guarantee unlock even if update fails
        try {
          if (this.workflowFunctions.update) {
            const updateArgs = this.buildUpdateArgs(this.context);
            await this.retryOnConflict(
              () => this.workflowFunctions!.update(handlerContext, updateArgs),
              `Update ${this.context.objectName}`,
              logger,
            );
            logger?.info(`📝 Updated ${this.context.objectName}`);
          }
        } finally {
          if (this.workflowFunctions.unlock) {
            const unlockArgs = this.buildUnlockArgs(this.context);
            await this.workflowFunctions.unlock(handlerContext, unlockArgs);
            logger?.info(`🔓 Unlocked ${this.context.objectName}`);
          }
        }
      } else {
        // No lock — run update and unlock independently (shouldn't normally happen)
        if (this.workflowFunctions.update) {
          const updateArgs = this.buildUpdateArgs(this.context);
          await this.workflowFunctions.update(handlerContext, updateArgs);
          logger?.info(`📝 Updated ${this.context.objectName}`);
        }

        if (this.workflowFunctions.unlock) {
          const unlockArgs = this.buildUnlockArgs(this.context);
          await this.workflowFunctions.unlock(handlerContext, unlockArgs);
          logger?.info(`🔓 Unlocked ${this.context.objectName}`);
        }
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
    const mcp = await this.getHardModeClient();

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

        // Guarantee unlock even if update fails
        try {
          const updateArgs = this.buildUpdateArgs(this.context);
          await this.retryOnConflict(
            () =>
              callTool(
                mcp.client,
                mcp.toolNames,
                toolCandidates('update', entity, 'low', this.handlerName),
                updateArgs,
              ),
            `Update ${this.context.objectName} (hard mode)`,
            logger,
          );
          logger?.info(`📝 Updated ${this.context.objectName}`);
        } finally {
          const unlockArgs = this.buildUnlockArgs(this.context);
          await callTool(
            mcp.client,
            mcp.toolNames,
            toolCandidates('unlock', entity, 'low', this.handlerName),
            unlockArgs,
          );
          logger?.info(`🔓 Unlocked ${this.context.objectName}`);
        }
      } else {
        if (this.workflowFunctions?.update) {
          const updateArgs = this.buildUpdateArgs(this.context);
          await callTool(
            mcp.client,
            mcp.toolNames,
            toolCandidates('update', entity, 'low', this.handlerName),
            updateArgs,
          );
          logger?.info(`📝 Updated ${this.context.objectName}`);
        }

        if (this.workflowFunctions?.unlock) {
          const unlockArgs = this.buildUnlockArgs(this.context);
          await callTool(
            mcp.client,
            mcp.toolNames,
            toolCandidates('unlock', entity, 'low', this.handlerName),
            unlockArgs,
          );
          logger?.info(`🔓 Unlocked ${this.context.objectName}`);
        }
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

  private static readonly META_PARAMS = new Set([
    'skip_cleanup',
    'cleanup_after',
    'delete_after_test',
    'delete_object_type',
  ]);

  /**
   * Returns params suitable for create/validate steps:
   * - excludes test-infrastructure keys
   * - excludes update-specific keys (update_*, updated_*)
   */
  private filterCreateParams(params: any): any {
    const result: any = {};
    for (const [key, value] of Object.entries(params)) {
      if (
        !LowTester.META_PARAMS.has(key) &&
        !key.startsWith('update_') &&
        !key.startsWith('updated_')
      ) {
        result[key] = value;
      }
    }
    return result;
  }

  private buildValidateArgs(context: LambdaTesterContext): any {
    const { objectName, params, packageName, transportRequest, session } =
      context;
    const nameField = this.getNameField();
    return {
      ...this.filterCreateParams(params),
      [nameField]: objectName,
      package_name: packageName,
      description: params.description || objectName,
      ...(transportRequest && { transport_request: transportRequest }),
      ...(session?.session_id && { session_id: session.session_id }),
      ...(session?.session_state && { session_state: session.session_state }),
    };
  }

  private buildCreateArgs(context: LambdaTesterContext): any {
    return this.buildValidateArgs(context);
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
    const { objectName, params, lockHandle, packageName, session } = context;
    const nameField = this.getNameField();
    const handlerName = (this as any).handlerName || '';

    const args: any = {
      [nameField]: objectName,
      lock_handle: lockHandle || context.lockHandle,
    };

    // Domain and DataElement handlers require a 'properties' object
    if (
      handlerName.includes('domain') ||
      handlerName.includes('data_element')
    ) {
      args.properties = this.buildUpdateProperties(params, packageName);
    }

    // Content fields: prefer "update" variants over originals
    const sourceCode = params.update_source_code ?? params.source_code;
    if (sourceCode !== undefined) args.source_code = sourceCode;

    const ddlCode = params.updated_ddl_code ?? params.ddl_code;
    if (ddlCode !== undefined) args.ddl_code = ddlCode;

    const ddlSource = params.update_ddl_source ?? params.ddl_source;
    if (ddlSource !== undefined) args.ddl_source = ddlSource;

    if (params.implementation_code !== undefined) {
      args.implementation_code = params.implementation_code;
    }

    if (session?.session_id) args.session_id = session.session_id;
    if (session?.session_state) args.session_state = session.session_state;

    return args;
  }

  /**
   * Builds the `properties` object required by UpdateDomainLow and UpdateDataElementLow.
   * Merges YAML params.properties (if present) with top-level update fields.
   */
  private buildUpdateProperties(
    params: any,
    packageName: string,
  ): Record<string, any> {
    const base: Record<string, any> = params.properties ?? {};
    const props: Record<string, any> = {
      package_name: base.package_name || packageName,
      description:
        params.update_description ?? base.description ?? params.description,
    };

    const lengthVal = params.update_length ?? base.length ?? params.length;
    if (lengthVal !== undefined) props.length = lengthVal;

    if (base.datatype || params.datatype) {
      props.datatype = base.datatype || params.datatype;
    }
    if (params.decimals !== undefined) props.decimals = params.decimals;
    if (params.lowercase !== undefined) props.lowercase = params.lowercase;
    if (params.sign_exists !== undefined)
      props.sign_exists = params.sign_exists;

    // DataElement-specific fields
    if (params.type_kind) props.type_kind = params.type_kind;
    if (params.type_name) {
      props.type_name = params.type_name;
    } else if (params.domain_name) {
      props.type_name = params.domain_name;
    }
    if (params.data_type) props.data_type = params.data_type;
    if (params.short_label) props.short_label = params.short_label;
    if (params.medium_label) props.medium_label = params.medium_label;
    if (params.field_label_long)
      props.field_label_long = params.field_label_long;
    if (params.field_label_heading)
      props.field_label_heading = params.field_label_heading;

    return props;
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

  /**
   * Resolve ADT object URI for deletion/check API
   * Returns null for object types where deletion/check is not applicable
   */
  private resolveObjectUri(objectName: string): string | null {
    const name = encodeURIComponent(objectName.toLowerCase());
    const handlerName = (this as any).handlerName || '';
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
   * Retry operation on HTTP 409 Conflict (TADIR stale entry).
   * SAP BTP Cloud trial can return 409/TK754 after delete+create due to stale TADIR entries.
   * SAP's own recommendation: "Repeat the function."
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
      } catch (error: any) {
        const isTadirConflict =
          error.response?.status === 409 ||
          (typeof error.message === 'string' &&
            error.message.includes('object directory entry'));
        if (isTadirConflict && attempt < maxRetries) {
          logger?.warn?.(
            `⚠️ ${label}: HTTP 409 Conflict (TADIR stale entry), retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`,
          );
          await delay(delayMs);
          continue;
        }
        throw error;
      }
    }
    // unreachable, but TS needs it
    throw new Error(`${label}: exceeded max retries`);
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
  }

  async afterEach(): Promise<void> {
    // LowTester compatibility - cleanup handled by cleanupAfter
    // Use this.cleanupAfter() to ensure YAML parameter checking works correctly
    await this.cleanupAfter();
  }
}
