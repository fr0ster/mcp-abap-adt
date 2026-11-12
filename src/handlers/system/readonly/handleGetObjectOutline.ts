/**
 * `GetObjectOutline`: an object's components as SAP's object structure
 * states them — `GET <object uri>/objectstructure` (adt-clients'
 * `getObjectOutline`), read by adt-strategies' `readObjectOutline`. SAP
 * parses the ABAP; nothing here does.
 *
 * Measured on premise and on ABAP cloud (2026-11-04): SAP serves the outline
 * for a class, an interface, a program and a function group — the program on
 * premise only, the cloud has none. A class's and an interface's links each
 * name a source position, `#start=l,c;end=l,c` (lines from 1, columns from
 * 0, `end` exclusive) in the include they point into; a program's name
 * their target (`#type=…;name=…`), a function group's only a source. No
 * element carries a signature: a method's is the source its definition
 * block spans.
 */

import {
  analyseException,
  type IObjectOutline,
  type IOutlineElement,
  type IOutlineLink,
  type IOutlinePoint,
  readObjectOutline,
} from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import type { ServerOutlineCode } from '../../../lib/adtClientContract';
import type { ProjectionVariant } from '../../../lib/adtProjections';
import { answer } from '../../../lib/answer';
import { createAdtClient, variantOf } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  READ_VERSION_FIELD,
  type ReadVersion,
} from '../../../lib/handlers/readVersion';
import { DETAIL_SHAPE, detailOf } from '../../../lib/strategies/detail';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import { byVariant } from '../../../lib/variantDefinition';

/** The kinds SAP serves an outline for, per variant (measured). */
export const OUTLINE_TYPES = {
  onprem: ['CLAS/OC', 'INTF/OI', 'PROG/P', 'FUGR/F'],
  cloud: ['CLAS/OC', 'INTF/OI', 'FUGR/F'],
} as const satisfies Record<ProjectionVariant, readonly ServerOutlineCode[]>;

/** A kind the tool takes on some variant. */
export type OutlineType = (typeof OUTLINE_TYPES)['onprem'][number];

const DESCRIPTION =
  "[read-only] Lists the components of the ABAP object named by object_type and object_name — types, attributes, methods, events, local classes, forms, includes or modules — with their kind, visibility and level, and the source positions SAP's object structure states for each: the include each link points into and, for a class or an interface, its start and end line and column (lines from 1, columns from 0, the end exclusive), the lines a ranged source read (start_line, end_line) answers. Returns the components as a tree.";

/** GetObjectOutline's input on `variant`. */
function outlineSchema(variant: ProjectionVariant) {
  return z.object({
    object_type: z
      .enum(OUTLINE_TYPES[variant])
      .describe(
        `ADT type of the object: ${OUTLINE_TYPES[variant].join(', ')} (class, interface${variant === 'onprem' ? ', program' : ''}, function group).`,
      ),
    object_name: z.string().describe('Object name.'),
    version: READ_VERSION_FIELD,
    ...DETAIL_SHAPE,
  });
}

export const TOOL_DEFINITION = {
  name: 'GetObjectOutline',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: DESCRIPTION,
    inputSchema: outlineSchema(variant),
  })),
} as const;

interface GetObjectOutlineArgs {
  object_type: OutlineType;
  object_name: string;
  version?: ReadVersion;
  detail?: 'terse' | 'full' | 'raw';
}

/** A link as answered: where it points and, where SAP states one, the position. */
interface AnsweredLink {
  rel: string;
  source: string;
  start?: IOutlinePoint;
  end?: IOutlinePoint;
  fragment?: string;
  type?: string;
}

/** A component as answered, its children in document order. */
interface AnsweredComponent {
  name: string;
  type: string;
  visibility?: string;
  level?: string;
  clif_name?: string;
  include?: string;
  description?: string;
  constant?: true;
  read_only?: true;
  final?: true;
  links: AnsweredLink[];
  children: AnsweredComponent[];
}

/**
 * `source` resolved against the answer's `xml:base` — a class's links are
 * relative (`./source/main`) — by the platform's URL resolution; the path
 * and the query as resolved.
 */
function resolvedSource(base: string | undefined, source: string): string {
  if (base === undefined) return source;
  const resolved = new URL(source, new URL(base, 'http://adt.invalid'));
  return `${resolved.pathname}${resolved.search}`;
}

function linkOf(base: string | undefined, link: IOutlineLink): AnsweredLink {
  const position =
    link.start !== undefined && link.end !== undefined
      ? { start: link.start, end: link.end }
      : link.fragment === undefined
        ? {}
        : { fragment: link.fragment };
  return {
    rel: link.rel,
    source: resolvedSource(base, link.source),
    ...position,
    ...(link.type === undefined ? {} : { type: link.type }),
  };
}

function componentOf(
  base: string | undefined,
  element: IOutlineElement,
): AnsweredComponent {
  const optional = {
    visibility: element.visibility,
    level: element.level,
    clif_name: element.clifName,
    include: element.include,
    description: element.description,
  };
  const stated = Object.fromEntries(
    Object.entries(optional).filter(([, value]) => value !== undefined),
  );
  return {
    name: element.name,
    type: element.type ?? element.unknownType,
    ...stated,
    ...(element.constant ? { constant: true } : {}),
    ...(element.readOnly ? { read_only: true } : {}),
    ...(element.final ? { final: true } : {}),
    links: element.links.map((link) => linkOf(base, link)),
    children: element.children.map((child) => componentOf(base, child)),
  };
}

/** The outline of a document, or the refusal when the document is none. */
function outlineOf(document: string): IObjectOutline {
  const outline = readObjectOutline(document);
  if (outline.root === undefined) {
    throw new Error(
      'SAP answered no outline document for this object: the answer carries neither an outline nor an exception to read.',
    );
  }
  return outline;
}

export async function handleGetObjectOutline(
  context: HandlerContext,
  args: GetObjectOutlineArgs,
) {
  const { connection, logger } = context;
  const { object_type, object_name, version = 'active' } = args;
  if (!object_name) return return_error(new Error('object_name is required'));
  const variant = variantOf(connection);
  const served: readonly string[] = OUTLINE_TYPES[variant];
  if (!served.includes(object_type)) {
    return return_error(
      new Error(
        `object_type must be one of ${served.join(', ')} on this system`,
      ),
    );
  }
  const objectName = object_name.toUpperCase();
  const detail = detailOf(args);
  /** The outline the call read, for the projection: parsed once. */
  const read: { outline?: IObjectOutline } = {};

  return answer(
    { tool: 'GetObjectOutline', detail },
    async () => {
      const response = await createAdtClient(connection, logger)
        .getUtils(ourUtils)
        .getObjectOutline(object_type, objectName, {
          version,
          analyse: analyseException,
        });
      // The document is read once, inside the call, as GetObjectStructure
      // checks its own: an answer that is no outline is the call's failure.
      if (detail !== 'raw' && response.ok) {
        read.outline = outlineOf(response.getResult().value);
      }
      return response;
    },
    (document) => {
      const outline = read.outline;
      if (detail === 'raw' || outline === undefined) return document;
      if (detail === 'full') return outline;
      const root = outline.root;
      return {
        success: true,
        object_type,
        object_name: objectName,
        version,
        outline:
          root === undefined ? undefined : componentOf(outline.base, root),
      };
    },
  );
}
