import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';

/**
 * GetTransport Handler - read a transport request or a transport task.
 *
 * The request is adt-clients' `getRequest().readObjects()` (#235). SAP's one
 * handler answers both kinds of number (`CL_CTS_ADT_TM_RES_REQUEST_CONT->
 * fetch_request_data`, the same on premise and on ABAP Cloud), and the two
 * cannot be told apart by their form, so the document says which was read
 * (`kind`):
 *
 * - a request's (`tm:root/@tm:object_type` `R`, or none) carries the request
 *   in `tm:request`, with its tasks and their objects;
 * - a task's (`T`, `prepare_tm_root_for_task`) carries the task and its
 *   `tm:abap_object` entries in `tm:task`, and only the parent request's
 *   header in `tm:request`. Read as a request it answered the parent's type
 *   and target for the task with no objects (measured on premise and on the
 *   cloud, 2026-11-22), so a task is read from `tm:task`, and the parent is
 *   answered apart, as `parent_request`.
 *
 * `detail` shapes the answer as the other transport reads do. Terse is what
 * the model acts on: a request's header and its tasks as rows, without
 * objects (a task is read by its number for them); a task's header, its
 * parent's, and its objects as rows of type, name and position (the position
 * a removal names). Full is the whole parse and raw the document, for
 * debugging. `include_objects` and `include_tasks` stay, for compatibility,
 * as terse's choice to leave a task's object rows or a request's task rows
 * out (their counts stay).
 */

import { transportDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { XMLParser } from 'fast-xml-parser';
import {
  type AnswerContext,
  answerCaught,
  answerFailure,
  return_answer,
} from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AnswerObject,
  type JsonValue,
  jsonOfNode,
} from '../../../lib/json';
import { detailOf } from '../../../lib/strategies/detail';
import { project } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { withStep } from '../../../lib/strategies/step';
import { return_error } from '../../../lib/utils';
import { parseXml } from '../../../lib/xml/node';
import {
  attr,
  child,
  isList,
  type XmlList,
  type XmlNode,
  type XmlRead,
} from '../../../lib/xml/tree';

export const TOOL_DEFINITION = {
  name: 'GetTransport',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "[read-only] Reads the transport request or transport task named by transport_number; kind says which: 'request' or 'task'. A transport request answers its header (number, description, type, status, owner, target system) and its tasks, each with number, owner, status, description and object count. A transport task answers its header (number, parent request, description, type, status, owner), its parent request (number, type, status, target system), and its objects, each with type, name and position, with their count.",
  inputSchema: z.object({
    transport_number: z.string().describe('Transport request or task number'),
    include_objects: z
      .boolean()
      .default(true)
      .optional()
      .describe(
        "With detail terse: list a task's objects (default: true); their count is answered either way.",
      ),
    include_tasks: z
      .boolean()
      .default(true)
      .optional()
      .describe(
        "With detail terse: list a request's tasks (default: true); their count is answered either way.",
      ),
    ...DETAIL_SHAPE,
  }),
} as const;

type GetTransportArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/** The `tm:object_type` of a task's document. */
const TASK_DOCUMENT = 'T';

/** The attribute `name` of `node`, as the reading parser groups them (`@`). */
const attributeOf = (node: XmlRead, name: string): string | undefined =>
  attr(child(node, '@'), name);

/** The members named `name` of `node`, as a list: none, one or several. */
function listed(node: XmlRead, name: string): readonly XmlRead[] {
  const member = child(node, name);
  if (member === undefined) return [];
  return isList(member) ? member : [member];
}

/** What was read, by the document's `tm:root/@tm:object_type`. */
export function transportKind(document: XmlRead): 'request' | 'task' {
  const root = child(document, 'tm:root');
  return attributeOf(root, 'tm:object_type') === TASK_DOCUMENT
    ? 'task'
    : 'request';
}

/** What terse answers of a document, by its kind. */
interface TerseOptions {
  readonly number: string;
  readonly includeObjects: boolean;
  readonly includeTasks: boolean;
}

/**
 * A request's terse answer: its header from `tm:request` and its tasks as
 * rows, each with the count of its objects; no object is listed.
 * `tm:request` and `tm:task` are repeatable to the reading parser.
 */
function terseRequest(document: XmlRead, options: TerseOptions) {
  const [request] = listed(child(document, 'tm:root'), 'tm:request');
  const of = (name: string) => attributeOf(request, name);
  const tasks = listed(request, 'tm:task').map((task) => ({
    number: attributeOf(task, 'tm:number'),
    owner: attributeOf(task, 'tm:owner'),
    status: attributeOf(task, 'tm:status'),
    description: attributeOf(task, 'tm:desc'),
    object_count: listed(task, 'tm:abap_object').length,
  }));
  return {
    success: true,
    transport_number: options.number,
    kind: 'request',
    transport: {
      number: of('tm:number'),
      description: of('tm:desc'),
      type: of('tm:type'),
      status: of('tm:status'),
      owner: of('tm:owner'),
      target_system: of('tm:target'),
    },
    tasks: options.includeTasks ? tasks : undefined,
    task_count: tasks.length,
  };
}

/**
 * A task's terse answer: its header from `tm:task`, never `tm:request`
 * (the parent's), the parent's header apart, and its objects as rows of
 * type, name and position.
 */
function terseTask(document: XmlRead, options: TerseOptions) {
  const root = child(document, 'tm:root');
  const [task] = listed(root, 'tm:task');
  const [parent] = listed(root, 'tm:request');
  const of = (name: string) => attributeOf(task, name);
  const objects = listed(task, 'tm:abap_object').map((entry) => ({
    type: attributeOf(entry, 'tm:type'),
    name: attributeOf(entry, 'tm:name'),
    position: attributeOf(entry, 'tm:position'),
  }));
  return {
    success: true,
    transport_number: options.number,
    kind: 'task',
    task: {
      number: of('tm:number'),
      parent: of('tm:parent'),
      description: of('tm:desc'),
      type: of('tm:type'),
      status: of('tm:status'),
      owner: of('tm:owner'),
    },
    parent_request: {
      number: attributeOf(parent, 'tm:number'),
      type: attributeOf(parent, 'tm:type'),
      status: attributeOf(parent, 'tm:status'),
      target_system: attributeOf(parent, 'tm:target'),
    },
    objects: options.includeObjects ? objects : undefined,
    object_count: objects.length,
  };
}

/** The terse answer of a transport document: a request's or a task's. */
export function terseTransport(document: XmlRead, options: TerseOptions) {
  return transportKind(document) === 'task'
    ? terseTask(document, options)
    : terseRequest(document, options);
}

/** An object or a task of the request: its members as parsed, by name. */
type TransportRow = AnswerObject;

/**
 * Parse transport request XML response
 */
export function parseTransportXml(
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

  const result: XmlRead = parseXml(parser, xmlData);
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
  const repeated = (value: XmlNode): XmlList =>
    isList(value) ? value : [value];

  /** A member of a parsed row, checked once: JSON, or absent. */
  const field = (node: XmlRead, name: string): JsonValue | undefined => {
    const member = child(node, name);
    return member === undefined ? undefined : jsonOfNode(member);
  };

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
  // A blank number is refused before any request.
  if (!args?.transport_number) {
    return return_error('Transport number is required');
  }
  const detail = detailOf(args);
  const options: TerseOptions = {
    number: args.transport_number,
    includeObjects: args.include_objects !== false,
    includeTasks: args.include_tasks !== false,
  };
  logger?.debug(`GetTransport: ${args.transport_number}`);
  const ctx: AnswerContext = { tool: 'GetTransport', detail };
  try {
    const read = await createAdtClient(connection, logger)
      .getRequest(resultsFor(transportDocuments))
      .readObjects(args.transport_number, { analyse: analyseException });
    if (!read.ok) {
      return answerFailure(withStep(read.getError(), 'read transport request'));
    }
    return return_answer(
      read,
      project(detail, (value: XmlRead) => terseTransport(value, options)),
      ctx,
    );
  } catch (error) {
    // Not the request's failure (answered above): a credential refusal as the
    // chain made it, or ours.
    return answerCaught(error, ctx);
  }
}
