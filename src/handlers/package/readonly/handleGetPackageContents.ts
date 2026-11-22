import * as z from 'zod';
import {
  answerCaught,
  type FailureEntry,
  thrownEntry,
} from '../../../lib/answer';
import {
  type PhaseResult,
  withSequentialFallback,
} from '../../../lib/batch/phases';
import { createAdtClient } from '../../../lib/clients';
import { type AnswerTable, answerAt, groupedTsv } from '../../../lib/detail';
import { stated, withInCallSchema } from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  LONG_BACKGROUND_FIELD,
  withLongToolAdvice,
} from '../../../lib/longTools';
import {
  DETAIL_SHAPE,
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
  ...DETAIL_SHAPE,
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

export const TOOL_DEFINITION = {
  name: 'GetPackageContents',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    '[read-only] Retrieve objects inside an ABAP package as a flat list. Supports recursive traversal of subpackages. Takes package_name (one package: its list) or package_names (several packages: one entry per package, in the order given, each { package_name, objects } or { package_name, error }). Each level of the walk is read in one ADT batch envelope: the root node structures of its packages, then their type nodes; with include_descriptions, as single requests, several at a time.',
  ),
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

/** Each asked package's answer as `listOf` makes it, or the failure of its walk. */
function perPackage<T>(
  read: ContentsRead,
  listOf: (packageName: string, items: WalkedItem[]) => T,
):
  | T
  | Array<
      | { package_name: string; objects: T }
      | { package_name: string; error: FailureEntry }
    > {
  if (read.single) {
    const only = read.walked[0];
    if (only === undefined || !only.ok) throw only?.error;
    return listOf(read.packageNames[0] ?? '', only.value);
  }
  return read.walked.map((result, i) => {
    const package_name = read.packageNames[i] ?? '';
    return result.ok
      ? { package_name, objects: listOf(package_name, result.value) }
      : {
          package_name,
          error: thrownEntry(result.error, 'read package node structure'),
        };
  });
}

/** One package's objects as TSV: `# package P` group lines, `type\tname` rows. */
function contentsRows(
  packageName: string,
  items: readonly WalkedItem[],
  descriptions: boolean,
): string {
  const groups = new Map<string, string[][]>();
  for (const item of items) {
    const owner = (item.packageName ?? packageName).toUpperCase();
    const rows = groups.get(owner) ?? [];
    // The technical name where it is not the name (a function group's is
    // its main program, SAPL…): what the object's own tools may need.
    // An object SAP listed without a name and technical name: its URI, what
    // tells it apart.
    const techName =
      item.techName !== undefined && item.techName !== item.name
        ? item.techName
        : item.name === ''
          ? (item.uri ?? '')
          : '';
    rows.push(
      descriptions
        ? [item.type, item.name, techName, item.description ?? '']
        : [item.type, item.name, techName],
    );
    groups.set(owner, rows);
  }
  return groupedTsv(
    descriptions
      ? ['type', 'name', 'tech_name', 'description']
      : ['type', 'name', 'tech_name'],
    [...groups].map(([value, rows]) => ({ field: 'package', value, rows })),
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
    // An object SAP listed without a name: its URI is what tells it apart.
    ...(item.name === '' && item.uri !== undefined ? { uri: item.uri } : {}),
    ...(item.notLoaded === true ? { not_loaded: true } : {}),
  };
}

/**
 * What GetPackageContents answers at each `detail`, selected before the
 * walk (`src/lib/detail`): terse the objects as TSV under `# package` group
 * lines (`# asked P` before each package of several, a failed walk as
 * `# error`); medium every field the walk read, no uri; full the list before
 * `detail`. A walk reads many documents and answers none whole, so raw is
 * the full list.
 */
const CONTENTS_ANSWERS: AnswerTable<ContentsRead, string> = {
  terse: (read) => {
    if (read.single) {
      const only = read.walked[0];
      if (only === undefined || !only.ok) throw only?.error;
      return contentsRows(
        read.packageNames[0] ?? '',
        only.value,
        read.descriptions,
      );
    }
    return read.walked
      .map((result, i) => {
        const name = read.packageNames[i] ?? '';
        return result.ok
          ? `# asked ${name}\n${contentsRows(name, result.value, read.descriptions)}`
          : `# asked ${name}\n# error ${JSON.stringify(thrownEntry(result.error, 'read package node structure'))}`;
      })
      .join('\n');
  },
  medium: (read) =>
    JSON.stringify(
      perPackage(read, (name, items) =>
        items.map((item) => mediumItem(name, item)),
      ),
    ),
  full: (read) => JSON.stringify(perPackage(read, assembleList)),
  raw: (read) => JSON.stringify(perPackage(read, assembleList)),
};

export async function handleGetPackageContents(
  context: HandlerContext,
  args: GetPackageContentsArgs,
) {
  const { connection, logger } = context;
  const shown = answerAt(CONTENTS_ANSWERS, levelOf(args));
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
