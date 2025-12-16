/**
 * ReadOnlyTester - Test class for read-only handler operations
 *
 * Executes read-only operations: Get object info
 * Validates MCP response format
 * No cleanup needed (read-only)
 */

import { BaseTester } from './BaseTester';
import { extractErrorMessage } from '../testHelpers';

export type ReadOnlyHandlerFunction = (connection: any, args: any) => Promise<any>;

export class ReadOnlyTester extends BaseTester {
  // Handler function (must be provided by constructor)
  protected handler: ReadOnlyHandlerFunction;

  // Object name (resolved from test params)
  protected objectName: string | null = null;

  /**
   * Constructor
   * @param handlerName - Name of the handler (e.g., 'get_class')
   * @param testCaseName - Name of the test case (e.g., 'get_existing')
   * @param logPrefix - Prefix for log messages (e.g., 'class-readonly')
   * @param handler - Handler function for get operation
   * @param paramsGroupName - Optional: Name of parameter group in YAML
   */
  constructor(
    handlerName: string,
    testCaseName: string,
    logPrefix: string,
    handler: ReadOnlyHandlerFunction,
    paramsGroupName?: string
  ) {
    super(handlerName, testCaseName, logPrefix, paramsGroupName);
    this.handler = handler;
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
   * Main run method - executes read-only operation
   */
  async run(): Promise<void> {
    if (this.shouldSkipTest()) {
      this.logger?.testSkip(`Skipping test: ${this.getSkipReason()}`);
      return;
    }

    if (!this.connection || !this.session) {
      await this.createConnection();
    }

    if (!this.connection || !this.session) {
      throw new Error('Failed to create connection and session');
    }

    const params = this.getTestParams();

    // Log test start
    this.logger?.info(`🚀 Starting read-only test for ${this.objectName || 'object'}`);
    this.logger?.info(`   Workflow steps: get`);

    try {
      // Execute read-only get operation
      await this.runGet(params);

      // Log test completion
      this.logger?.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      this.logger?.success(`✨ Read-only operation completed successfully for ${this.objectName}`);
    } catch (error: any) {
      this.logger?.error(`❌ Test failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute read-only get operation
   */
  protected async runGet(params: any): Promise<void> {
    if (!this.handler || !this.connection) {
      throw new Error('Handler or connection not available');
    }

    this.logger?.info(`   • get: ${this.objectName}`);

    const getArgs = this.buildGetArgs(params);
    const getResponse = await this.handler(this.connection, getArgs);

    // Validate response format
    this.validateResponse(getResponse);

    this.logger?.success(`✅ Retrieved ${this.objectName} successfully`);
  }

  /**
   * Validate MCP response format
   */
  protected validateResponse(response: any): void {
    if (!response) {
      throw new Error('Response is null or undefined');
    }

    // Check for error response
    if (response.isError) {
      const errorMsg = extractErrorMessage(response);
      throw new Error(`Get operation failed: ${errorMsg}`);
    }

    // Check for content array
    if (!response.content || !Array.isArray(response.content) || response.content.length === 0) {
      throw new Error('Response does not contain content array');
    }

    // Check content format (should be JSON for read-only handlers)
    const contentItem = response.content[0];
    if (!contentItem) {
      throw new Error('Response content array is empty');
    }

    if (contentItem.type !== 'json') {
      throw new Error(`Expected content type 'json', got '${contentItem.type}'`);
    }

    if (!contentItem.json) {
      throw new Error('Response content item does not contain json property');
    }

    // Response is valid
    this.logger?.debug('Response format validated successfully');
  }

  // Helper methods to build handler arguments (can be overridden in subclasses)

  protected buildGetArgs(params: any): any {
    return {
      [this.getObjectNameKey()]: this.objectName
    };
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
}
