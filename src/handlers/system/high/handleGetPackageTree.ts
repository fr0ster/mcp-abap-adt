import * as z from 'zod';
import {
  longRunning,
  purpose,
  toolDescription,
} from '../../../lib/description';
import { stated, withInCallSchema } from '../../../lib/handlers/argumentRules';
import { LONG_BACKGROUND_FIELD } from '../../../lib/longTools';
/**
 * GetPackageTree Handler - High-level handler for package tree structure
 *
 * Builds a complete tree of package contents (subpackages + objects)
 * walking the repository one node level at a time. See lib/strategies/packageWalk.
 */

import {
  answerFailure,
  type FailureEntry,
  failureEntry,
  isCredentialPayload,
  thrownEntry,
} from '../../../lib/answer';
import {
  type PhaseResult,
  withSequentialFallback,
} from '../../../lib/batch/phases';
import { createAdtClient } from '../../../lib/clients';
import {
  about,
  type Column,
  entries,
  type Head,
  type JsonSchemas,
  jsonText,
  type ListAnswerTable,
  type Listing,
  listAnswerAt,
  listWrittenAt,
  partsOf,
  type RowSchemas,
  rows,
  type Written,
  wireAnswer,
  writeJsonList,
  writeJsonRoot,
  writeListing,
  writeWhole,
  writtenValues,
} from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  ASSEMBLED_DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import { readPackageMetadata } from '../../../lib/strategies/metadataReads';
import {
  assembleTree,
  batchReader,
  concurrentReader,
  endsTheCall,
  type NodeAnswer,
  type NodeRequest,
  nodeStructureOn,
  type PackageNode,
  readNode,
  type WalkedItem,
  walkPackage,
  walkPackages,
} from '../../../lib/strategies/packageWalk';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { withStep } from '../../../lib/strategies/step';
import { return_error, return_response } from '../../../lib/utils';

/** GetPackageTree's arguments but `background`. */
const FIELDS = {
  package_name: z
    .string()
    .optional()
    .describe('Package name (give this or package_names)'),
  package_names: z
    .array(z.string())
    .optional()
    .describe(
      'Several package names, read together (give this or package_name)',
    ),
  include_subpackages: z
    .boolean()
    .default(true)
    .optional()
    .describe(
      'Include subpackages recursively in the tree. If false, subpackages are shown as first-level objects but not recursively expanded. Default: true',
    ),
  max_depth: z
    .number()
    .int()
    .default(5)
    .optional()
    .describe('Maximum depth for recursive package traversal. Default: 5'),
  include_descriptions: z
    .boolean()
    .default(false)
    .optional()
    .describe(
      "Include each object's description in the response. The package metadata and the walk's levels are then read as single requests, several at a time, rather than in ADT batch envelopes. Default: false",
    ),
  debug: z
    .boolean()
    .default(false)
    .optional()
    .describe(
      'Include diagnostic metadata in response (counts, types, hierarchy info). Default: false',
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
      message: 'package_name is required',
      path: ['package_name'],
    });
  }
}

/**
 * The lists below a package's own row: `described` with each object's
 * description (`include_descriptions`), `bare` without.
 */
export const PACKAGE_TREE_LISTS = {
  described: treeSchemas(true),
  bare: treeSchemas(false),
} as const;

export const TOOL_DEFINITION = {
  name: 'GetPackageTree',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Reads the whole hierarchy of one or more ABAP packages: each package with its subpackages and their objects, down to the last level.',
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

type GetPackageTreeArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/** A package's metadata read, as `readPackageMetadata` answers it. */
type Metadata = Awaited<ReturnType<typeof readPackageMetadata>>;

/** One package's metadata read and its walk. */
interface TreeRead {
  metadata: PhaseResult<Metadata>;
  walked?: PhaseResult<WalkedItem[]>;
}

/**
 * A package's walk: every package whose metadata was read is walked, so a
 * walk is there for each one the answer reads; none, in words, otherwise.
 */
function walkOf(
  read: TreeRead,
  packageName: string,
): PhaseResult<WalkedItem[]> {
  return (
    read.walked ?? {
      ok: false,
      error: new Error(`the package ${packageName} was not walked`),
    }
  );
}

interface TreeOptions {
  includeSubpackages: boolean;
  maxDepth: number;
  includeDescriptions: boolean;
}

/** An item of the first phase: a package's metadata, or a root node structure. */
type FirstItem = { metadata: string } | { node: NodeRequest };

/** The answer of a first-phase item, by what the item read. */
type FirstAnswer =
  | { of: 'metadata'; response: Metadata }
  | { of: 'node'; response: NodeAnswer };

/** A first-phase metadata item's answer. */
function metadataOf(result: PhaseResult<FirstAnswer>): PhaseResult<Metadata> {
  if (!result.ok) return result;
  const answer = result.value;
  if (answer.of !== 'metadata') {
    throw new Error('a metadata item of the first phase answered a node');
  }
  return { ok: true, value: answer.response };
}

/** A first-phase root node structure item's answer. */
function rootOf(result: PhaseResult<FirstAnswer>): PhaseResult<NodeAnswer> {
  if (!result.ok) return result;
  const answer = result.value;
  if (answer.of !== 'node') {
    throw new Error('a node item of the first phase answered metadata');
  }
  return { ok: true, value: answer.response };
}

// Verify package exists before building tree (fixes #38).
// `IPackageContract` has no `.read()` — a package is a container with no
// source of its own, so `readMetadata` is the one call (see
// `handleGetPackage.ts`, migrated the same way). Without an `analyse`
// strategy the default error contract still answers `ok: false` for a
// refusal, which is all a plain existence check needs.
function readMetadata(
  context: HandlerContext,
  connection: HandlerContext['connection'],
  packageName: string,
): Promise<Metadata> {
  return readPackageMetadata(
    createAdtClient(connection, context.logger),
    { packageName },
    'active',
  );
}

/** A metadata read SAP refused with a credential failure (a `401`). */
function credentialRefused(metadata: PhaseResult<Metadata>): boolean {
  return (
    metadata.ok &&
    !metadata.value.ok &&
    isCredentialPayload(
      failureEntry(metadata.value.getError(), 'read package metadata'),
    )
  );
}

/** Whether a metadata read answered the document. */
const metadataRead = (metadata: PhaseResult<Metadata>) =>
  metadata.ok && metadata.value.ok;

/**
 * Every package's metadata and walk in ADT batch envelopes (spec §11): (1)
 * the metadata GET and the root node structure of every package, in one
 * phase; then the walk's levels for the packages whose metadata was read.
 * No description: an envelope part's can be another part's
 * (`readTreesConcurrent` answers them). A metadata read refused with a
 * credential failure ends the reads.
 */
async function readTreesBatched(
  context: HandlerContext,
  packageNames: readonly string[],
  options: TreeOptions,
): Promise<TreeRead[]> {
  const readLevel = (request: NodeRequest, c: HandlerContext['connection']) =>
    readNode(
      nodeStructureOn(
        context,
        createAdtClient(c, context.logger).getUtils(ourUtils),
      ),
      request,
    );
  const read = batchReader<FirstItem, FirstAnswer>(context, async (item, c) =>
    'metadata' in item
      ? {
          of: 'metadata',
          response: await readMetadata(context, c, item.metadata),
        }
      : { of: 'node', response: await readLevel(item.node, c) },
  );
  const first = await read([
    ...packageNames.map((metadata) => ({ metadata })),
    ...packageNames.map(
      (name): FirstItem => ({
        node: {
          parentType: 'DEVC/K',
          parentName: name,
          withShortDescriptions: false,
        },
      }),
    ),
  ]);
  const reads: TreeRead[] = packageNames.map((_, i) => ({
    metadata: metadataOf(first[i]),
  }));
  if (reads.some((r) => credentialRefused(r.metadata))) return reads;
  // Walked further: the packages whose metadata was read.
  const kept = reads.flatMap((r, i) => (metadataRead(r.metadata) ? [i] : []));
  const walked = await walkPackages(
    batchReader<NodeRequest, NodeAnswer>(context, readLevel),
    kept.map((i) => packageNames[i]),
    options,
    kept.map((i) => rootOf(first[packageNames.length + i])),
  );
  kept.forEach((i, k) => {
    reads[i].walked = walked[k];
  });
  return reads;
}

/**
 * Every package's metadata and walk with descriptions, as requests sent
 * alone, several at a time (`concurrentReader`), on any system: (1) every
 * package's metadata; then the walk's levels for the packages whose metadata
 * was read, each node structure with its own descriptions. A metadata read
 * refused with a credential failure ends the reads: no metadata read not yet
 * started is sent, as on the sequential path.
 */
async function readTreesConcurrent(
  context: HandlerContext,
  packageNames: readonly string[],
  options: TreeOptions,
): Promise<TreeRead[]> {
  const metadata = await concurrentReader<string, Metadata>(
    context,
    (name, c) => readMetadata(context, c, name),
    (answer) => credentialRefused({ ok: true, value: answer }),
  )(packageNames);
  const reads: TreeRead[] = metadata.map((m) => ({ metadata: m }));
  if (reads.some((r) => credentialRefused(r.metadata))) return reads;
  const kept = reads.flatMap((r, i) => (metadataRead(r.metadata) ? [i] : []));
  const walked = await walkPackages(
    concurrentReader<NodeRequest, NodeAnswer>(context, (request, c) =>
      readNode(
        nodeStructureOn(
          context,
          createAdtClient(c, context.logger).getUtils(ourUtils),
        ),
        request,
      ),
    ),
    kept.map((i) => packageNames[i]),
    options,
  );
  kept.forEach((i, k) => {
    reads[i].walked = walked[k];
  });
  return reads;
}

/**
 * The sequential version — the code path this handler has always had — one
 * package after another: its metadata, then, when read, its walk
 * (`walkPackage`). A failure that ends the call is thrown as it came, and a
 * metadata read refused with a credential failure ends the reads.
 */
async function readTreesSequential(
  context: HandlerContext,
  packageNames: readonly string[],
  options: TreeOptions,
): Promise<TreeRead[]> {
  const utils = createAdtClient(context.connection, context.logger).getUtils(
    ourUtils,
  );
  const reads: TreeRead[] = [];
  for (const name of packageNames) {
    let metadata: PhaseResult<Metadata>;
    try {
      metadata = {
        ok: true,
        value: await readMetadata(context, context.connection, name),
      };
    } catch (error) {
      if (endsTheCall(error)) throw error;
      metadata = { ok: false, error };
    }
    const tree: TreeRead = { metadata };
    reads.push(tree);
    if (credentialRefused(metadata)) break;
    if (!metadataRead(metadata)) continue;
    try {
      tree.walked = {
        ok: true,
        value: await walkPackage(
          nodeStructureOn(context, utils),
          name,
          options,
        ),
      };
    } catch (error) {
      if (endsTheCall(error)) throw error;
      tree.walked = { ok: false, error };
    }
  }
  return reads;
}

/** A package's tree, as the single answer carries it. */
function treeOf(
  packageName: string,
  walked: WalkedItem[],
  options: TreeOptions,
) {
  return {
    package_name: packageName,
    tree: assembleTree(packageName, walked),
    metadata: {
      include_subpackages: options.includeSubpackages,
      max_depth: options.maxDepth,
      include_descriptions: options.includeDescriptions,
    },
  };
}

/**
 * A tree row's columns: the type and the name; for an object SAP listed
 * without a name its technical name and URI, what tells it apart; the
 * description where asked.
 */
function treeColumns(descriptions: boolean): Column<PackageNode>[] {
  const nameless = (node: PackageNode) => node.name === '';
  const columns: Column<PackageNode>[] = [
    { name: 'type', means: 'its type', cell: (node) => node.type },
    { name: 'name', means: 'its name', cell: (node) => node.name },
    {
      name: 'tech_name',
      means: 'its technical name when SAP lists it nameless',
      cell: (node) => node.techName ?? '',
      when: nameless,
    },
    {
      name: 'uri',
      means: 'its URI when SAP lists it nameless',
      cell: (node) => node.uri ?? '',
      when: nameless,
    },
  ];
  return descriptions
    ? [
        ...columns,
        {
          name: 'description',
          means: 'its description, with descriptions asked',
          cell: (node) => node.description ?? '',
        },
      ]
    : columns;
}

/** The tree's rows below its root, every node at its depth (terse). */
function treeSchemas(descriptions: boolean): RowSchemas<PackageNode> {
  const schemas: RowSchemas<PackageNode> = {
    children: about(
      'for each subpackage and object below it, at its depth',
      rows('children', {
        columns: treeColumns(descriptions),
        header: 'none',
        get lists() {
          return schemas;
        },
      }),
    ),
  };
  return schemas;
}

/** A tree node with every field the walk read, no derived or backup field (medium). */
const mediumEntry = (node: PackageNode) => ({
  name: node.name,
  type: node.type,
  ...(node.techName !== undefined ? { tech_name: node.techName } : {}),
  ...(node.uri !== undefined ? { uri: node.uri } : {}),
  ...(node.description !== undefined ? { description: node.description } : {}),
  ...(node.notLoaded === true ? { not_loaded: true as const } : {}),
});

/** The tree's nodes below a node, medium: a leaf without its empty `children`. */
const mediumSchemas: JsonSchemas<PackageNode> = {
  children: entries('children', mediumEntry, {
    omitEmpty: true,
    get lists() {
      return mediumSchemas;
    },
  }),
};

/** A package's tree as one level answers it: the arguments of {@link treeOf}. */
interface TreeAnswerRead {
  packageName: string;
  walked: WalkedItem[];
  options: TreeOptions;
}

/**
 * What GetPackageTree answers of one package at each `detail`, selected
 * before the reads (`src/lib/detail`): terse the tree as indented
 * `type\tname` lines; medium the tree with every field the walk read, no
 * kind, isPackage, codeFormat, restoreStatus or empty children; full the
 * answer before `detail`. A walk reads many documents, so
 * raw never reaches this table: the handler answers it as the wire documents (`wireAnswer`).
 */
type TreeAnswer = string | object;

/** The terse tree: the package's own row, then every node at its depth. */
const treeListing = ({
  packageName,
  walked,
  options,
}: TreeAnswerRead): Listing<PackageNode> =>
  treeListingOf(assembleTree(packageName, walked), options.includeDescriptions);

/** An assembled tree's terse listing: its root a row, every node below it. */
const treeListingOf = (
  tree: PackageNode,
  includeDescriptions: boolean,
): Listing<PackageNode> => ({
  heads: [],
  reading: tree,
  root: { columns: treeColumns(includeDescriptions) },
  lists: PACKAGE_TREE_LISTS[includeDescriptions ? 'described' : 'bare'],
});

// Every level written from the assembled tree, every node of the walk in
// it (`assembleTree`): the writers write one row or entry per node.
const TREE_ANSWERS: ListAnswerTable<TreeAnswerRead, TreeAnswer> = {
  // With include_descriptions, each row's description beside its type and
  // name; the package's own row is the root, the rows below it its nodes.
  terse: (read) => writeListing(treeListing(read)),
  medium: ({ packageName, walked }) =>
    writeJsonRoot(
      assembleTree(packageName, walked),
      mediumEntry,
      mediumSchemas,
    ),
  // The whole parse, as it is.
  full: ({ packageName, walked, options }) => ({
    package_name: packageName,
    tree: assembleTree(packageName, walked),
    metadata: {
      include_subpackages: options.includeSubpackages,
      max_depth: options.maxDepth,
      include_descriptions: options.includeDescriptions,
    },
  }),
  raw: ({ packageName, walked, options }) =>
    treeOf(packageName, walked, options),
};

/** One package's read, or its failure entry. */
type TreeOutcome =
  | { readonly read: TreeAnswerRead }
  | {
      readonly package_name: string;
      readonly error: FailureEntry;
      readonly read?: undefined;
    };

/**
 * One package asked by a list call, as its terse part reads it: its name,
 * its failure, or its assembled tree and whether rows carry descriptions.
 */
interface AskedTree {
  readonly name: string;
  readonly failed:
    | { readonly package_name: string; readonly error: FailureEntry }
    | undefined;
  readonly tree: PackageNode | undefined;
  readonly includeDescriptions: boolean;
}

/** What a list call answers from: the packages asked, each one's outcome. */
interface TreeList {
  readonly packageNames: readonly string[];
  readonly outcomes: readonly TreeOutcome[];
  readonly shown: (read: TreeAnswerRead) => Written<TreeAnswer>;
}

/** A list call's entries as a JSON array. */
const jsonTrees = ({ outcomes, shown }: TreeList) =>
  jsonText(
    writeJsonList(
      { outcomes },
      writtenValues('outcomes', (outcome: TreeOutcome) =>
        outcome.read === undefined ? writeWhole(outcome) : shown(outcome.read),
      ),
    ),
  );

/**
 * A list call's answer at each `detail`, selected through the table like
 * every other answer: terse one text written by the listing writer, each tree
 * under its escaped `# asked` line; the other levels a JSON array.
 */
const TREE_LISTS: ListAnswerTable<TreeList, string> = {
  terse: ({ packageNames, outcomes }) =>
    writeListing({
      heads: [],
      reading: {
        asked: outcomes.map(
          (outcome, i): AskedTree => ({
            name: packageNames[i] ?? '',
            failed: outcome.read === undefined ? outcome : undefined,
            tree:
              outcome.read === undefined
                ? undefined
                : assembleTree(outcome.read.packageName, outcome.read.walked),
            includeDescriptions:
              outcome.read?.options.includeDescriptions === true,
          }),
        ),
      },
      lists: {
        asked: partsOf(
          'asked',
          ({ name, failed }: AskedTree): Head[] => [
            { head: 'asked', value: name },
            ...(failed === undefined
              ? []
              : [{ head: 'error', value: JSON.stringify(failed) }]),
          ],
          'tree',
          {
            // Each package's tree, its descriptions where the call asked.
            variants: {
              plain: {
                lists: PACKAGE_TREE_LISTS.bare,
                root: { columns: treeColumns(false) },
              },
              described: {
                lists: PACKAGE_TREE_LISTS.described,
                root: { columns: treeColumns(true) },
              },
            },
            frame: (_tree, { includeDescriptions }) => ({
              variant: includeDescriptions ? 'described' : 'plain',
            }),
          },
        ),
      },
    }),
  medium: jsonTrees,
  full: (list) => jsonTrees(list).answer,
  raw: (list) => jsonTrees(list).answer,
};

/**
 * Main handler for GetPackageTree MCP tool
 *
 * At `raw` what ADT sent: the documents the call's reads answered, read
 * with the tool at full (`wireAnswer`, `src/lib/detail/wire.ts`).
 */
export async function handleGetPackageTree(
  context: HandlerContext,
  args: GetPackageTreeArgs,
) {
  if (levelOf(args) === 'raw') {
    return wireAnswer(
      {
        connection: context.connection,
        tool: 'GetPackageTree',
        shape: 'assembled',
      },
      () => answeredGetPackageTree(context, { ...args, detail: 'full' }),
    );
  }
  return answeredGetPackageTree(context, args);
}

async function answeredGetPackageTree(
  context: HandlerContext,
  args: GetPackageTreeArgs,
) {
  const { logger } = context;
  const shown = listAnswerAt(TREE_ANSWERS, levelOf(args));
  try {
    // The schema holds the rule: exactly one of the two forms.
    const single = stated(args.package_name) ? args.package_name : undefined;
    const list = args.package_names ?? [];
    const packageNames = (single ? [single] : list).map((name) =>
      name.toUpperCase(),
    );
    const options: TreeOptions = {
      includeSubpackages: args.include_subpackages !== false,
      maxDepth: args.max_depth || 5,
      includeDescriptions: args.include_descriptions === true,
    };

    logger?.info(
      `Fetching package tree for ${packageNames.join(', ')} (include_subpackages: ${options.includeSubpackages}, max_depth: ${options.maxDepth}) using adt-clients`,
    );

    // Walked here, not in the client. `getPackageHierarchy` makes one request
    // per object type plus a walk into subpackages, so `IResultStrategy`, which
    // reads ONE answer, cannot be given to it — and between it and
    // `getPackageContentsList` the library had already chosen the shape for us.
    // `fetchNodeStructure` is one request and takes our reading, so the walk is
    // composed of steps we can read and the assembly is ours.
    // See mcp-abap-adt-clients#141.
    // Descriptions asked for, on any system: requests sent alone — inside an
    // envelope a node structure part can carry another part's DESCRIPTION.
    const reads = options.includeDescriptions
      ? await readTreesConcurrent(context, packageNames, options)
      : await withSequentialFallback(
          context,
          () => readTreesBatched(context, packageNames, options),
          () => readTreesSequential(context, packageNames, options),
        );

    // A metadata read refused with a credential failure ends the call as it
    // came; so does one package's own refusal when it was the only one asked.
    const ended = reads.find((r) => credentialRefused(r.metadata));
    const failedMetadata = (single ? reads[0] : ended)?.metadata;
    if (failedMetadata !== undefined) {
      if (!failedMetadata.ok) throw failedMetadata.error;
      if (!failedMetadata.value.ok) {
        // The method's error as it is, with the step it arose at.
        return answerFailure(
          withStep(failedMetadata.value.getError(), 'read package metadata'),
          { tool: 'GetPackageTree', detail: detailOf(args) },
        );
      }
    }

    if (single) {
      const walked = walkOf(reads[0], packageNames[0]);
      if (!walked.ok) throw walked.error;
      logger?.debug(`Package tree fetched successfully for ${single}`);
      const answer = shown({
        packageName: packageNames[0],
        walked: walked.value,
        options,
      });
      return return_response({
        data: typeof answer === 'string' ? answer : JSON.stringify(answer),
      });
    }

    // Each package's read, or its failure entry.
    const outcomes = reads.map((read, i) => {
      const package_name = packageNames[i];
      const metadata = read.metadata;
      if (!metadata.ok) {
        return {
          package_name,
          error: thrownEntry(metadata.error, 'read package metadata'),
        };
      }
      if (!metadata.value.ok) {
        return {
          package_name,
          error: failureEntry(
            metadata.value.getError(),
            'read package metadata',
          ),
        };
      }
      const walked = walkOf(read, package_name);
      return walked.ok
        ? {
            read: {
              packageName: package_name,
              walked: walked.value,
              options,
            },
          }
        : {
            package_name,
            error: thrownEntry(walked.error, 'read package node structure'),
          };
    });
    // Through the list table, like every other answer.
    return return_response({
      data: listAnswerAt(
        TREE_LISTS,
        levelOf(args),
      )({
        packageNames,
        outcomes,
        shown: listWrittenAt(TREE_ANSWERS, levelOf(args)),
      }),
    });
  } catch (error) {
    logger?.error('Failed to fetch package tree', error);
    return return_error(error);
  }
}
