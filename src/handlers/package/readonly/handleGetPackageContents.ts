import * as z from 'zod';
import {
  answerCaught,
  type FailureEntry,
  type McpResult,
  thrownEntry,
} from '../../../lib/answer';
import {
  type PhaseResult,
  withSequentialFallback,
} from '../../../lib/batch/phases';
import { createAdtClient } from '../../../lib/clients';
import {
  longRunning,
  purpose,
  toolDescription,
} from '../../../lib/description';
import {
  about,
  type Column,
  entries,
  type Head,
  jsonText,
  type ListAnswerTable,
  listAnswerAt,
  rows,
  sections,
  type Written,
  wireAnswer,
  writeJsonList,
  writeListing,
} from '../../../lib/detail';
import { stated, withInCallSchema } from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { LONG_BACKGROUND_FIELD } from '../../../lib/longTools';
import {
  ASSEMBLED_DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import {
  assembleList,
  batchReader,
  concurrentReader,
  type NodeAnswer,
  type NodeRequest,
  nodeStructureOn,
  readNode,
  rootByRoot,
  type WalkedItem,
  walkPackage,
  walkPackages,
} from '../../../lib/strategies/packageWalk';
import { ourUtils } from '../../../lib/strategies/resultSets';

/** GetPackageContents' arguments but `background`. */
const FIELDS = {
  package_name: z
    .string()
    .optional()
    .describe('Name of the ABAP package (give this or package_names)'),
  package_names: z
    .array(z.string())
    .optional()
    .describe(
      'Names of several ABAP packages, read together (give this or package_name)',
    ),
  include_subpackages: z
    .boolean()
    .optional()
    .describe('Include contents of subpackages recursively (default: false)'),
  max_depth: z
    .number()
    .optional()
    .describe('Maximum depth for recursive package traversal (default: 5)'),
  include_descriptions: z
    .boolean()
    .optional()
    .describe(
      "Include each object's description in the response. The walk's levels are then read as single requests, several at a time, rather than in ADT batch envelopes (default: false)",
    ),
  ...ASSEMBLED_DETAIL_SHAPE,
};

/** Exactly one of `package_name` and a non-empty `package_names`. */
function onePackageForm(
  args: {
    package_name?: string | undefined;
    package_names?: string[] | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  const single = stated(args.package_name);
  const listed = (args.package_names ?? []).length > 0;
  if (single && listed) {
    ctx.addIssue({
      code: 'custom',
      message: 'Give exactly one of package_name or package_names',
      path: ['package_names'],
    });
  } else if (!single && !listed) {
    ctx.addIssue({
      code: 'custom',
      message: 'Package name is required',
      path: ['package_name'],
    });
  }
}

/**
 * The lists of one package's listing: `described` with its objects'
 * descriptions (`include_descriptions`), `bare` without.
 */
export const CONTENTS_LISTS = {
  described: { items: contentsRows(true) },
  bare: { items: contentsRows(false) },
} as const;

export const TOOL_DEFINITION = {
  name: 'GetPackageContents',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Reads the objects of one or more ABAP packages, with the objects of their subpackages when asked.',
    ),
    notes: [longRunning],
  }),
  inputSchema: withInCallSchema(
    z
      .object({ background: LONG_BACKGROUND_FIELD, ...FIELDS })
      .superRefine(onePackageForm),
    z.object(FIELDS).superRefine(onePackageForm),
  ),
} as const;

type GetPackageContentsArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/** What a level formats: the packages asked, and each one's walk. */
interface ContentsRead {
  packageNames: readonly string[];
  /** One package asked by `package_name`: its list alone, not a list of entries. */
  single: boolean;
  descriptions: boolean;
  walked: readonly PhaseResult<WalkedItem[]>[];
}

/** One package asked: its name, and its walk's objects or the walk's failure. */
interface ContentsPart {
  readonly name: string;
  readonly items?: readonly WalkedItem[] | undefined;
  readonly error?: FailureEntry | undefined;
}

/** What a list call writes: each package asked, in the order asked. */
interface ContentsParts {
  readonly parts: readonly ContentsPart[];
}

/**
 * Each package asked, its objects' own package filled in (the package
 * asked, where the walk left it to the root's) — every walked object kept.
 */
function partsOf(read: ContentsRead): ContentsPart[] {
  return read.walked.map((result, i): ContentsPart => {
    const name = read.packageNames[i] ?? '';
    return result.ok
      ? {
          name,
          items: result.value.map((item) => ({
            ...item,
            packageName: (item.packageName ?? name).toUpperCase(),
          })),
        }
      : {
          name,
          error: thrownEntry(result.error, 'read package node structure'),
        };
  });
}

/** The one package of a call by `package_name`: its walk, or the walk's failure thrown. */
function onlyPart(read: ContentsRead): ContentsPart {
  const only = read.walked[0];
  if (only === undefined || !only.ok) throw only?.error;
  const [part] = partsOf(read);
  return part ?? { name: read.packageNames[0] ?? '' };
}

/**
 * One package's objects as TSV: the type, the name, the technical name
 * where it differs, the URI of an object SAP listed without a name, the
 * description where asked — each under its own package's group line.
 */
function contentsRows(descriptions: boolean) {
  const columns: Column<WalkedItem>[] = [
    { name: 'type', means: 'its type', cell: (item) => item.type },
    { name: 'name', means: 'its name', cell: (item) => item.name },
    {
      name: 'tech_name',
      means: 'its technical name where it differs',
      cell: (item) =>
        item.techName !== undefined && item.techName !== item.name
          ? item.techName
          : '',
    },
    {
      name: 'uri',
      means: 'its URI when SAP lists it nameless',
      cell: (item) => (item.name === '' ? (item.uri ?? '') : ''),
    },
  ];
  return about(
    'for each object of the package or a subpackage, under its own package',
    rows('items', {
      columns: descriptions
        ? [
            ...columns,
            {
              name: 'description',
              means: 'its description, with descriptions asked',
              cell: (item) => item.description ?? '',
            },
          ]
        : columns,
      header: 'always',
      groups: [
        {
          label: 'package',
          of: (item: WalkedItem) => item.packageName ?? '',
          mode: 'gathered',
        },
      ],
    }),
  );
}

/** Every field the walk read of an object, without its uri. */
function mediumItem(packageName: string, item: WalkedItem) {
  return {
    name: item.name,
    type: item.type,
    package_name: (item.packageName ?? packageName).toUpperCase(),
    ...(item.description !== undefined
      ? { description: item.description }
      : {}),
    ...(item.techName !== undefined ? { tech_name: item.techName } : {}),
    // An object SAP listed without a name: its URI, too, tells it apart.
    ...(item.name === '' && item.uri !== undefined ? { uri: item.uri } : {}),
    ...(item.notLoaded === true ? { not_loaded: true } : {}),
  };
}

/** A level's JSON entry of one object, from the object alone. */
type EntryOf = (item: WalkedItem) => object;

/**
 * A level's JSON answer of the walks, written from the walks' own lists:
 * one package's entries, or each package's under its name (a refused walk
 * its error).
 */
function contentsJson(read: ContentsRead, entry: EntryOf): Written<string> {
  if (read.single) {
    return jsonText(writeJsonList(onlyPart(read), entries('items', entry)));
  }
  return jsonText(
    writeJsonList(
      { parts: partsOf(read) },
      entries(
        'parts',
        (part: ContentsPart) =>
          part.error === undefined
            ? { package_name: part.name }
            : { package_name: part.name, error: part.error },
        { lists: { items: entries('items', entry, { as: 'objects' }) } },
      ),
    ),
  );
}

/**
 * What GetPackageContents answers at each `detail`, selected before the
 * walk (`src/lib/detail`): terse the objects as TSV under `# package` group
 * lines (`# asked P` before each package of several, a failed walk as
 * `# error`); medium every field the walk read, no uri; full the list before
 * `detail`. Every level is written by the listing writers from the walks'
 * own lists (`writeListing`, `writeJsonList`): one row or entry per object.
 * Raw never reaches this table: the handler answers it as the responses
 * (`wireAnswer`).
 */
const CONTENTS_ANSWERS: ListAnswerTable<ContentsRead, string> = {
  terse: (read) => {
    if (read.single) {
      return writeListing({
        heads: [],
        reading: onlyPart(read),
        lists: CONTENTS_LISTS[read.descriptions ? 'described' : 'bare'],
      });
    }
    return writeListing({
      heads: [],
      reading: { parts: partsOf(read) } satisfies ContentsParts,
      lists: {
        parts: sections(
          'parts',
          (part: ContentsPart): Head[] => [
            { head: 'asked', value: part.name },
            ...(part.error === undefined
              ? []
              : [{ head: 'error', value: JSON.stringify(part.error) }]),
          ],
          CONTENTS_LISTS[read.descriptions ? 'described' : 'bare'],
        ),
      },
    });
  },
  medium: (read) =>
    contentsJson(read, (item) => mediumItem(item.packageName ?? '', item)),
  full: (read) =>
    contentsJson(
      read,
      (item) => assembleList(item.packageName ?? '', [item])[0] ?? {},
    ).answer,
  raw: (read) =>
    JSON.stringify(
      read.single
        ? assembleList(onlyPart(read).name, [...(onlyPart(read).items ?? [])])
        : partsOf(read).map((part) =>
            part.error === undefined
              ? {
                  package_name: part.name,
                  objects: assembleList(part.name, [...(part.items ?? [])]),
                }
              : { package_name: part.name, error: part.error },
          ),
    ),
};

/**
 * The tool's answer; at `raw` what ADT sent — the documents the call's
 * reads answered, read with the tool at full (`wireAnswer`).
 */
export async function handleGetPackageContents(
  context: HandlerContext,
  args: GetPackageContentsArgs,
) {
  if (levelOf(args) === 'raw') {
    return wireAnswer(
      {
        connection: context.connection,
        tool: 'GetPackageContents',
        shape: 'assembled',
      },
      () => answeredGetPackageContents(context, { ...args, detail: 'full' }),
    );
  }
  return answeredGetPackageContents(context, args);
}

async function answeredGetPackageContents(
  context: HandlerContext,
  args: GetPackageContentsArgs,
): Promise<McpResult> {
  const { connection, logger } = context;
  const shown = listAnswerAt(CONTENTS_ANSWERS, levelOf(args));
  try {
    // The schema holds the rule: exactly one of the two forms.
    const single = stated(args.package_name) ? args.package_name : undefined;
    const list = args.package_names ?? [];
    const packageNames = (single ? [single] : list).map((name) =>
      name.toUpperCase(),
    );
    const options = {
      includeSubpackages: args.include_subpackages,
      maxDepth: args.max_depth,
      includeDescriptions: args.include_descriptions,
    };

    // Walked here rather than in the client, for the reason given in
    // handleGetPackageTree and in mcp-abap-adt-clients#141: a member that makes
    // many requests cannot take an IResultStrategy, and a flat list and a tree
    // are two conveniences over one walk. This is the same walk that handler
    // uses, assembled the other way — level by level, each level's requests in
    // one envelope (spec §11); one package after another where the system has
    // no communication batch. Descriptions asked for, on any system: each
    // level's requests sent alone, several at a time — inside an envelope a
    // node structure part can carry another part's DESCRIPTION, sent alone it
    // carries its own.
    const readLevel = (request: NodeRequest, c: typeof connection) =>
      readNode(
        nodeStructureOn(context, createAdtClient(c, logger).getUtils(ourUtils)),
        request,
      );
    const walked =
      options.includeDescriptions === true
        ? await walkPackages(
            concurrentReader<NodeRequest, NodeAnswer>(context, readLevel),
            packageNames,
            options,
          )
        : await withSequentialFallback(
            context,
            () =>
              walkPackages(
                batchReader<NodeRequest, NodeAnswer>(context, readLevel),
                packageNames,
                options,
              ),
            () => {
              const utils = createAdtClient(connection, logger).getUtils(
                ourUtils,
              );
              return rootByRoot(packageNames, (name) =>
                walkPackage(nodeStructureOn(context, utils), name, options),
              );
            },
          );

    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: shown({
            packageNames,
            single: single !== undefined,
            descriptions: options.includeDescriptions === true,
            walked,
          }),
        },
      ],
    };
  } catch (error) {
    // A refused level of the walk: the method's error as it is, with its
    // step; a thrown chain failure as the chain made it; a throw of our own
    // `client_threw` — never the throw's message as bare text.
    return answerCaught(error, {
      tool: 'GetPackageContents',
      detail: detailOf(args),
    });
  }
}
