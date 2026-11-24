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
import { purpose, toolDescription } from '../../../lib/description';
import {
  type AnswerTable,
  about,
  answerAt,
  type Column,
  entries,
  headShape,
  type JsonSchemas,
  type ListAnswerTable,
  listAnswerAt,
  member,
  omitted,
  type RowSchemas,
  rows,
  values,
  writeJson,
  writeListing,
  writeWhole,
} from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { READ_VERSION_FIELD } from '../../../lib/handlers/readVersion';
import {
  DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
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

/** The heads an outline's listing opens with. */
export const OUTLINE_HEADS = [
  headShape('object', "the object's type and name"),
  headShape('source', 'the include its components are defined in'),
];

export const TOOL_DEFINITION = {
  name: 'GetObjectOutline',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: toolDescription({
      tag: 'read-only',
      purpose: purpose(
        'Lists the components of an ABAP class, interface, program or function group, with where each one is defined in its source.',
      ),
    }),
    inputSchema: outlineSchema(variant),
  })),
} as const;

type GetObjectOutlineArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

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

/** A component's own members as answered, its lists left to the caller. */
function componentEntry(
  element: IOutlineElement,
): Omit<AnsweredComponent, 'links' | 'children'> {
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
  };
}

function componentOf(
  base: string | undefined,
  element: IOutlineElement,
): AnsweredComponent {
  return {
    ...componentEntry(element),
    links: element.links.map((link) => linkOf(base, link)),
    children: element.children.map((child) => componentOf(base, child)),
  };
}

/** A component's own members as answered, its lists left to its schemas. */

/**
 * A component's lists as the JSON writer writes them: every link, every
 * child — each child with its own lists again.
 */
function componentSchemas(
  base: string | undefined,
): JsonSchemas<IOutlineElement> {
  const schemas: JsonSchemas<IOutlineElement> = {
    links: values('links', (link: IOutlineLink) => linkOf(base, link)),
    children: entries('children', componentEntry, {
      get lists() {
        return schemas;
      },
    }),
  };
  return schemas;
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

/** The outline a call read: SAP's document, and its parse (none at raw). */
interface OutlineRead {
  document: string;
  outline: IObjectOutline | undefined;
}

/** A document read with its parse: a document that is no outline throws. */
const parsedRead = (document: string): OutlineRead => ({
  document,
  outline: outlineOf(document),
});

/**
 * How the call reads SAP's document at each `detail`: parsed at terse,
 * medium and full — inside the call, so a document that is no outline is
 * the call's failure — and as it came at raw.
 */
const OUTLINE_READS: AnswerTable<string, OutlineRead> = {
  terse: parsedRead,
  medium: parsedRead,
  full: parsedRead,
  raw: (document) => ({ document, outline: undefined }),
};

/** A component's definition: its first link with a position, else its first. */
function definitionOf(component: AnsweredComponent): AnsweredLink | undefined {
  return (
    component.links.find((link) => link.start !== undefined) ??
    component.links[0]
  );
}

/**
 * The outline as indented rows: name, type, visibility, the definition's
 * line, and its source where it is not the one the `# source` line names (a
 * local include, a module's include) — every component, from the root.
 */
function outlineSchemas(source: string | undefined): {
  readonly columns: Column<AnsweredComponent>[];
  readonly below: RowSchemas<AnsweredComponent>;
} {
  const columns: Column<AnsweredComponent>[] = [
    { name: 'name', means: 'its name', cell: (component) => component.name },
    { name: 'type', means: 'its kind', cell: (component) => component.type },
    {
      name: 'visibility',
      means: 'its visibility',
      cell: (component) => component.visibility ?? '',
    },
    {
      name: 'line',
      means: 'where its definition starts',
      cell: (component) => {
        const start = definitionOf(component)?.start;
        return start === undefined ? '' : String(start.line);
      },
    },
    {
      name: 'source',
      means: 'the include it is defined in, where that differs',
      cell: (component) => {
        const definition = definitionOf(component);
        return definition === undefined || definition.source === source
          ? ''
          : definition.source;
      },
    },
  ];
  const below: RowSchemas<AnsweredComponent> = {
    // The approved terse shape: a component's links repeat the source the
    // `# source` line names, and leave.
    links: omitted<AnsweredLink, 'links'>(
      'links',
      'a link repeats the source the `# source` line names',
    ),
    children: rows('children', {
      columns,
      header: 'none',
      get lists() {
        return below;
      },
    }),
  };
  return { columns, below };
}

/** The lists an outline's listing writes: what its description states. */
export function outlineLists(
  source: string | undefined,
): RowSchemas<{ tree: AnsweredComponent[] }> {
  const { columns, below } = outlineSchemas(source);
  return {
    tree: about(
      'for each component, such as a type, attribute, method, event, local class, form or module, at its depth',
      rows('tree', { columns, header: 'always', tree: true, lists: below }),
    ),
  };
}

/**
 * What GetObjectOutline answers at each `detail`, selected before the call
 * (`src/lib/detail`): terse the components as indented
 * `name\ttype\tvisibility\tline` rows under `# object` and `# source`
 * (the source the lines are in, named once: the links each component
 * carries repeat it); medium every component with its links (the former
 * terse); full the parse; raw the document.
 */
function outlineAnswers(
  objectType: string,
  objectName: string,
  version: string,
): ListAnswerTable<OutlineRead, string | object> {
  const components = (outline: IObjectOutline) =>
    outline.root === undefined
      ? undefined
      : componentOf(outline.base, outline.root);
  return {
    // Every component of the outline, written by the listing writer. At
    // terse and medium the document is always parsed (`OUTLINE_READS`), an
    // outline without a root refused there; the reading without one is
    // raw's alone, answered here as the document it holds.
    terse: ({ document, outline }: OutlineRead) => {
      const root = outline === undefined ? undefined : components(outline);
      if (root === undefined) return writeWhole({ document });
      const source = definitionOf(root)?.source;
      return writeListing({
        heads: [
          { head: 'object', value: `${objectType} ${objectName}` },
          ...(source === undefined ? [] : [{ head: 'source', value: source }]),
        ],
        reading: { tree: [root] },
        lists: outlineLists(source),
      });
    },
    // Every component with its links (the reading's own tree, every
    // component in it); no outline read: the document as it came.
    medium: ({ document, outline }: OutlineRead) => {
      // No outline read (raw's reading alone): the document it holds.
      if (outline === undefined) return writeWhole({ document });
      // The reading's tree from its root, every link and child by the JSON
      // writer.
      return writeJson(
        {
          success: true,
          object_type: objectType,
          object_name: objectName,
          version,
        },
        outline,
        {
          root: member('root', componentEntry, {
            as: 'outline',
            lists: componentSchemas(outline.base),
          }),
        },
      );
    },
    full: ({ document, outline }) => outline ?? document,
    raw: ({ document }) => document,
  };
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
  const shown = listAnswerAt(
    outlineAnswers(object_type, objectName, version),
    levelOf(args),
  );
  const readAt = answerAt(OUTLINE_READS, levelOf(args));
  /** The outline the call read, for the projection: parsed once. */
  const read: { outline?: IObjectOutline | undefined } = {};

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
      if (response.ok) {
        read.outline = readAt(response.getResult().value).outline;
      }
      return response;
    },
    (document) => shown({ document, outline: read.outline }),
  );
}
