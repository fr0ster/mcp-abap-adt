/**
 * GetPackageTree Handler - High-level handler for package tree structure
 *
 * Builds a complete tree of package contents (subpackages + objects)
 * walking the repository one node level at a time. See lib/strategies/packageWalk.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { answerFailure, failureEntry, thrownEntry } from '../../../lib/answer';
import type { PhaseResult } from '../../../lib/batch/phases';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { TIMEOUT_PROPERTY, withLongToolAdvice } from '../../../lib/longTools';
import {
  assembleTree,
  byLevels,
  levelReader,
  type NodeRequest,
  type ReadMode,
  readNode,
  type WalkedItem,
  walkPackages,
} from '../../../lib/strategies/packageWalk';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { withStep } from '../../../lib/strategies/step';
import { return_error, return_response } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetPackageTree',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    '[high-level] Retrieve complete package tree structure including subpackages and objects. Returns hierarchical tree with object names, types, and descriptions. Takes package_name (one package: its tree) or package_names (several packages: one entry per package, in the order given, each { package_name, tree, metadata } or { package_name, error }). Read in ADT batch envelopes: the package metadata with the root node structure, then each level of the walk.',
  ),
  inputSchema: {
    type: 'object',
    properties: {
      timeout: TIMEOUT_PROPERTY,
      package_name: {
        type: 'string',
        description: 'Package name (give this or package_names)',
      },
      package_names: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Several package names, read together (give this or package_name)',
      },
      include_subpackages: {
        type: 'boolean',
        description:
          'Include subpackages recursively in the tree. If false, subpackages are shown as first-level objects but not recursively expanded. Default: true',
        default: true,
      },
      max_depth: {
        type: 'integer',
        description:
          'Maximum depth for recursive package traversal. Default: 5',
        default: 5,
      },
      include_descriptions: {
        type: 'boolean',
        description: 'Include object descriptions in response. Default: true',
        default: true,
      },
      debug: {
        type: 'boolean',
        description:
          'Include diagnostic metadata in response (counts, types, hierarchy info). Default: false',
        default: false,
      },
    },
    required: [],
  },
} as const;

interface GetPackageTreeArgs {
  package_name?: string;
  package_names?: string[];
  include_subpackages?: boolean;
  max_depth?: number;
  include_descriptions?: boolean;
  debug?: boolean;
}

/** One package's metadata read and its walk. */
interface TreeRead {
  metadata: PhaseResult<unknown>;
  walked?: PhaseResult<WalkedItem[]>;
}

/** An item of the first phase: a package's metadata, or a root node structure. */
type FirstItem = { metadata: string } | { node: NodeRequest };

/**
 * Every package's metadata and walk, in `mode` (spec §11): (1) the metadata
 * GET and the root node structure of every package, in one phase; then the
 * walk's levels for the packages whose metadata was read.
 */
async function readTrees(
  context: HandlerContext,
  mode: ReadMode,
  packageNames: readonly string[],
  options: {
    includeSubpackages: boolean;
    maxDepth: number;
    includeDescriptions: boolean;
  },
): Promise<TreeRead[]> {
  const { logger } = context;
  const read = levelReader<FirstItem, unknown>(context, mode, (item, c) => {
    const client = createAdtClient(c, logger);
    // Verify package exists before building tree (fixes #38).
    // `IPackageContract` has no `.read()` — a package is a container with no
    // source of its own, so `readMetadata` is the one call (see
    // `handleGetPackage.ts`, migrated the same way).
    return 'metadata' in item
      ? client
          .getPackage()
          .readMetadata(
            { packageName: item.metadata },
            { analyse: analyseException },
          )
      : readNode(client.getUtils(ourUtils), item.node);
  });
  const first = await read([
    ...packageNames.map((metadata) => ({ metadata })),
    ...packageNames.map((name) => ({
      node: {
        parentType: 'DEVC/K',
        parentName: name,
        withShortDescriptions: options.includeDescriptions,
      },
    })),
  ]);
  const reads: TreeRead[] = packageNames.map((_, i) => ({
    metadata: first[i] ?? { ok: false, error: undefined },
  }));
  // Walked further: the packages whose metadata was read.
  const kept = packageNames
    .map((name, i) => ({ name, i }))
    .filter(({ i }) => {
      const metadata = reads[i]?.metadata;
      return (
        metadata?.ok === true &&
        (metadata.value as { ok?: boolean } | undefined)?.ok !== false
      );
    });
  const walked = await walkPackages(
    (requests) => read(requests.map((node) => ({ node }))),
    kept.map(({ name }) => name),
    options,
    kept.map(
      ({ i }) => first[packageNames.length + i] ?? { ok: false, error: i },
    ),
  );
  kept.forEach(({ i }, k) => {
    const tree = reads[i];
    if (tree !== undefined) tree.walked = walked[k];
  });
  return reads;
}

/** A package's tree, as the single answer carries it. */
function treeOf(
  packageName: string,
  walked: WalkedItem[],
  options: {
    includeSubpackages: boolean;
    maxDepth: number;
    includeDescriptions: boolean;
  },
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
 * Main handler for GetPackageTree MCP tool
 */
export async function handleGetPackageTree(
  context: HandlerContext,
  args: GetPackageTreeArgs,
) {
  const { logger } = context;
  try {
    const single = typeof args?.package_name === 'string' && args.package_name;
    const list = Array.isArray(args?.package_names) ? args.package_names : [];
    if ((single ? 1 : 0) + (list.length > 0 ? 1 : 0) !== 1) {
      return return_error(
        new Error(
          'Give exactly one of package_name or package_names (a non-empty list)',
        ),
      );
    }
    const packageNames = (single ? [single] : list).map((name) =>
      name.toUpperCase(),
    );
    const options = {
      includeSubpackages: args.include_subpackages !== false,
      maxDepth: args.max_depth || 5,
      includeDescriptions: args.include_descriptions !== false,
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
    const reads = await byLevels(context, (mode) =>
      readTrees(context, mode, packageNames, options),
    );

    if (single) {
      const [only] = reads;
      const metadata = only?.metadata;
      if (metadata === undefined || !metadata.ok) throw metadata?.error;
      const readResult = metadata.value as IAdtResponse<unknown, IAdtError>;
      if (!readResult.ok) {
        // The method's error as it is, with the step it arose at.
        return answerFailure(
          withStep(readResult.getError(), 'read package metadata'),
          { tool: 'GetPackageTree', detail: 'terse' },
        );
      }
      const walked = only?.walked;
      if (walked === undefined || !walked.ok) throw walked?.error;
      logger?.debug(`Package tree fetched successfully for ${single}`);
      return return_response({
        data: JSON.stringify(
          treeOf(packageNames[0] ?? '', walked.value, options),
          null,
          2,
        ),
      } as any);
    }

    const entries = reads.map((read, i) => {
      const package_name = packageNames[i] ?? '';
      const metadata = read.metadata;
      if (!metadata.ok) {
        return {
          package_name,
          error: thrownEntry(metadata.error, 'read package metadata'),
        };
      }
      const readResult = metadata.value as IAdtResponse<unknown, IAdtError>;
      if (!readResult.ok) {
        return {
          package_name,
          error: failureEntry(readResult.getError(), 'read package metadata'),
        };
      }
      const walked = read.walked;
      if (walked === undefined || !walked.ok) {
        return {
          package_name,
          error: thrownEntry(walked?.error, 'read package node structure'),
        };
      }
      return treeOf(package_name, walked.value, options);
    });
    return return_response({
      data: JSON.stringify(entries, null, 2),
    } as any);
  } catch (error: any) {
    logger?.error('Failed to fetch package tree', error);
    return return_error(error);
  }
}
