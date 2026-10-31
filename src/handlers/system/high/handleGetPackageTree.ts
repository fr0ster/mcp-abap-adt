/**
 * GetPackageTree Handler - High-level handler for package tree structure
 *
 * Builds a complete tree of package contents (subpackages + objects)
 * walking the repository one node level at a time. See lib/strategies/packageWalk.
 */

import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import {
  answerFailure,
  failureEntry,
  isCredentialPayload,
  thrownEntry,
} from '../../../lib/answer';
import {
  type PhaseResult,
  withSequentialFallback,
} from '../../../lib/batch/phases';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { TIMEOUT_PROPERTY, withLongToolAdvice } from '../../../lib/longTools';
import { readPackageMetadata } from '../../../lib/strategies/metadataReads';
import {
  assembleTree,
  batchReader,
  concurrentReader,
  endsTheCall,
  type NodeRequest,
  nodeStructureOn,
  readNode,
  type WalkedItem,
  walkPackage,
  walkPackages,
} from '../../../lib/strategies/packageWalk';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { withStep } from '../../../lib/strategies/step';
import { return_error, return_response } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetPackageTree',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    '[read-only] Returns the complete tree of the ABAP package named by package_name: its subpackages and objects. Returns hierarchical tree with object names, types, and descriptions. Takes package_name (one package: its tree) or package_names (several packages: one entry per package, in the order given, each { package_name, tree, metadata } or { package_name, error }). Read in ADT batch envelopes: the package metadata with the root node structure, then each level of the walk; with include_descriptions, as single requests, several at a time.',
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
        description:
          "Include each object's description in the response. The package metadata and the walk's levels are then read as single requests, several at a time, rather than in ADT batch envelopes. Default: false",
        default: false,
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

type Metadata = IAdtResponse<unknown, IAdtError>;

/** One package's metadata read and its walk. */
interface TreeRead {
  metadata: PhaseResult<Metadata>;
  walked?: PhaseResult<WalkedItem[]>;
}

interface TreeOptions {
  includeSubpackages: boolean;
  maxDepth: number;
  includeDescriptions: boolean;
}

/** An item of the first phase: a package's metadata, or a root node structure. */
type FirstItem = { metadata: string } | { node: NodeRequest };

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
  const read = batchReader<FirstItem, unknown>(context, (item, c) =>
    'metadata' in item
      ? readMetadata(context, c, item.metadata)
      : readNode(
          nodeStructureOn(
            context,
            createAdtClient(c, context.logger).getUtils(ourUtils),
          ),
          item.node,
        ),
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
    metadata: first[i] as PhaseResult<Metadata>,
  }));
  if (reads.some((r) => credentialRefused(r.metadata))) return reads;
  // Walked further: the packages whose metadata was read.
  const kept = reads.flatMap((r, i) => (metadataRead(r.metadata) ? [i] : []));
  const walked = await walkPackages(
    (requests) => read(requests.map((node) => ({ node }))),
    kept.map((i) => packageNames[i] as string),
    options,
    kept.map((i) => first[packageNames.length + i] as PhaseResult<unknown>),
  );
  kept.forEach((i, k) => {
    (reads[i] as TreeRead).walked = walked[k];
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
    concurrentReader<NodeRequest, unknown>(context, (request, c) =>
      readNode(
        nodeStructureOn(
          context,
          createAdtClient(c, context.logger).getUtils(ourUtils),
        ),
        request,
      ),
    ),
    kept.map((i) => packageNames[i] as string),
    options,
  );
  kept.forEach((i, k) => {
    (reads[i] as TreeRead).walked = walked[k];
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
    if (single && list.length > 0) {
      return return_error(
        new Error('Give exactly one of package_name or package_names'),
      );
    }
    // Validate required parameters
    if (!single && list.length === 0) {
      return return_error(new Error('package_name is required'));
    }
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
          { tool: 'GetPackageTree', detail: 'terse' },
        );
      }
    }

    if (single) {
      const walked = reads[0]?.walked as PhaseResult<WalkedItem[]>;
      if (!walked.ok) throw walked.error;
      logger?.debug(`Package tree fetched successfully for ${single}`);
      return return_response({
        data: JSON.stringify(
          treeOf(packageNames[0] as string, walked.value, options),
          null,
          2,
        ),
      } as any);
    }

    const entries = reads.map((read, i) => {
      const package_name = packageNames[i] as string;
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
      const walked = read.walked as PhaseResult<WalkedItem[]>;
      return walked.ok
        ? treeOf(package_name, walked.value, options)
        : {
            package_name,
            error: thrownEntry(walked.error, 'read package node structure'),
          };
    });
    return return_response({
      data: JSON.stringify(entries, null, 2),
    } as any);
  } catch (error: any) {
    logger?.error('Failed to fetch package tree', error);
    return return_error(error);
  }
}
