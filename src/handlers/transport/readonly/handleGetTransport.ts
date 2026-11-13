import * as z from 'zod';
/**
 * GetTransport Handler - Retrieve ABAP transport request information via ADT API
 *
 * Retrieves transport request details including:
 * - Transport metadata (number, description, type, status)
 * - Owner and target system information
 * - Included objects and tasks
 * - Change history
 *
 * The request is adt-clients' `getRequest().readObjects()` (#235): the
 * request's document with its objects and tasks. `include_objects` and
 * `include_tasks` choose what the answer carries from it.
 */

import { transportDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { XMLParser } from 'fast-xml-parser';
import { answerCaught, answerFailure } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { type AnswerObject, type JsonValue, jsonOf } from '../../../lib/json';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { withStep } from '../../../lib/strategies/step';
import { return_error, return_response } from '../../../lib/utils';
import { child, isList } from '../../../lib/xml/tree';

export const TOOL_DEFINITION = {
  name: 'GetTransport',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Retrieve ABAP transport request information including metadata, included objects, and status from SAP system.',
  inputSchema: z.object({
    transport_number: z
      .string()
      .describe('Transport request number, not a task'),
    include_objects: z
      .boolean()
      .default(true)
      .optional()
      .describe('Include list of objects in transport (default: true)'),
    include_tasks: z
      .boolean()
      .default(true)
      .optional()
      .describe('Include list of tasks in transport (default: true)'),
  }),
} as const;

type GetTransportArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/** An object or a task of the request: its members as parsed, by name. */
type TransportRow = AnswerObject;

/**
 * Parse transport request XML response
 */
function parseTransportXml(
  xmlData: string,
  includeObjects: boolean = true,
  includeTasks: boolean = true,
) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: '_text',
    parseAttributeValue: true,
    isArray: (name, _jpath, _isLeafNode, _isAttribute) => {
      // Arrays for multiple objects/tasks
      return ['tm:object', 'tm:task', 'object', 'task'].includes(name);
    },
  });

  const result: unknown = parser.parse(xmlData);
  const root = child(result, 'tm:root') || child(result, 'root');

  if (!root) {
    // A helper must not return a tool result: its value is spread into a
    // success payload at the call site. Throw, and let the handler's catch
    // route it through return_error.
    throw new Error('Invalid transport XML structure - no tm:root found');
  }

  // Get detailed transport info from tm:request inside tm:root
  const request = child(root, 'tm:request') || {};
  /** The attribute `name` of the request, else of the root, as parsed. */
  const ofRequest = (name: string) => child(request, name);
  const ofRoot = (name: string) => child(root, name);

  // Extract basic transport information from both root attributes and request details
  const transportInfo = {
    number: ofRoot('adtcore:name') || ofRequest('tm:number') || ofRoot('name'),
    description:
      ofRequest('tm:desc') ||
      ofRequest('description') ||
      ofRoot('tm:description'),
    type: ofRequest('tm:type') || ofRoot('tm:object_type') || ofRoot('type'),
    status: ofRequest('tm:status') || ofRoot('tm:status'),
    status_text: ofRequest('tm:status_text'),
    owner: ofRequest('tm:owner') || ofRoot('tm:owner'),
    target_system: ofRequest('tm:target') || ofRoot('tm:target'),
    target_desc: ofRequest('tm:target_desc'),
    created_at:
      ofRoot('adtcore:createdAt') ||
      ofRequest('tm:createdAt') ||
      ofRoot('createdAt'),
    created_by:
      ofRoot('adtcore:createdBy') ||
      ofRequest('tm:createdBy') ||
      ofRoot('createdBy'),
    changed_at:
      ofRoot('adtcore:changedAt') ||
      ofRequest('tm:changedAt') ||
      ofRoot('changedAt'),
    changed_by:
      ofRoot('adtcore:changedBy') ||
      ofRequest('tm:changedBy') ||
      ofRoot('changedBy'),
    release_date: ofRequest('tm:releaseDate') || ofRoot('releaseDate'),
    client: ofRequest('tm:source_client') || ofRoot('tm:client'),
    cts_project: ofRequest('tm:cts_project'),
    cts_project_desc: ofRequest('tm:cts_project_desc'),
  };

  /** A member that may repeat, as a list: a list as it is, one member alone. */
  const repeated = (value: unknown): readonly unknown[] =>
    isList(value) ? value : [value];

  /** A member of a parsed row, checked once: JSON, or absent. */
  const field = (node: unknown, name: string): JsonValue | undefined =>
    jsonOf(child(node, name));

  // Extract objects if requested
  let objects: TransportRow[] = [];
  const allObjects = ofRequest('tm:all_objects');
  if (includeObjects && allObjects) {
    const objectList = child(allObjects, 'tm:abap_object');
    objects = (objectList ? repeated(objectList) : []).map((obj) => ({
      name: field(obj, 'tm:name'),
      type: field(obj, 'tm:type'),
      wbtype: field(obj, 'tm:wbtype'),
      pgmid: field(obj, 'tm:pgmid'),
      description: field(obj, 'tm:obj_desc'),
      position: field(obj, 'tm:position'),
      lock_status: field(obj, 'tm:lock_status'),
      info: field(obj, 'tm:obj_info'),
    }));
  }

  // Extract tasks if requested
  let tasks: TransportRow[] = [];
  const taskMember = ofRequest('tm:task');
  if (includeTasks && taskMember) {
    tasks = repeated(taskMember).map((task) => {
      const taskObjects = child(task, 'tm:abap_object');
      return {
        number: field(task, 'tm:number'),
        parent: field(task, 'tm:parent'),
        description: field(task, 'tm:desc'),
        type: field(task, 'tm:type'),
        status: field(task, 'tm:status'),
        status_text: field(task, 'tm:status_text'),
        owner: field(task, 'tm:owner'),
        target: field(task, 'tm:target'),
        target_desc: field(task, 'tm:target_desc'),
        client: field(task, 'tm:source_client'),
        created_at: field(task, 'tm:lastchanged_timestamp'),
        objects: taskObjects
          ? repeated(taskObjects).map((obj) => ({
              name: field(obj, 'tm:name'),
              type: field(obj, 'tm:type'),
              wbtype: field(obj, 'tm:wbtype'),
              description: field(obj, 'tm:obj_desc'),
              position: field(obj, 'tm:position'),
            }))
          : [],
      };
    });
  }

  return {
    transport: transportInfo,
    objects: includeObjects ? objects : undefined,
    tasks: includeTasks ? tasks : undefined,
    object_count: objects.length,
    task_count: tasks.length,
  };
}

/**
 * Main handler for GetTransport MCP tool
 */
export async function handleGetTransport(
  context: HandlerContext,
  args: GetTransportArgs,
) {
  const { connection, logger } = context;
  try {
    // Validate required parameters
    if (!args?.transport_number) {
      return return_error('Transport number is required');
    }

    const typedArgs = args;
    const includeObjects = typedArgs.include_objects !== false;
    const includeTasks = typedArgs.include_tasks !== false;

    logger?.debug(`GetTransport: ${typedArgs.transport_number}`);
    logger?.debug(
      `Include objects: ${includeObjects}, Include tasks: ${includeTasks}`,
    );

    // The request's document: its objects and its tasks.
    const step = 'read transport request';
    const read = await createAdtClient(connection, logger)
      .getRequest(resultsFor(transportDocuments))
      .readObjects(typedArgs.transport_number, { analyse: analyseException });
    if (!read.ok) return answerFailure(withStep(read.getError(), step));
    const response = read.getResult().value;

    logger?.debug(`GetTransport response status: ${response.status}`);

    // Parse XML response
    const transportData = parseTransportXml(
      response.raw,
      includeObjects,
      includeTasks,
    );

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          transport_number: typedArgs.transport_number,
          ...transportData,
          message: `Transport ${typedArgs.transport_number} retrieved successfully`,
        },
        null,
        2,
      ),
    });
  } catch (error) {
    // Not the request's failure (answered above): a credential refusal as the
    // chain made it, or ours, such as a document we could not read.
    return answerCaught(error, { tool: 'GetTransport', detail: 'terse' });
  }
}
