import * as z from 'zod';
import { answerCaught, thrownEntry } from '../../../lib/answer';
import { withSequentialFallback } from '../../../lib/batch/phases';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { timeoutField, withLongToolAdvice } from '../../../lib/longTools';
import {
  assembleList,
  batchReader,
  describeFromMetadata,
  type NodeRequest,
  nodeStructureOn,
  readNode,
  rootByRoot,
  walkPackage,
  walkPackages,
} from '../../../lib/strategies/packageWalk';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetPackageContents',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    '[read-only] Retrieve objects inside an ABAP package as a flat list. Supports recursive traversal of subpackages. Takes package_name (one package: its list) or package_names (several packages: one entry per package, in the order given, each { package_name, objects } or { package_name, error }). Each level of the walk is read in one ADT batch envelope: the root node structures of its packages, then their type nodes.',
  ),
  inputSchema: {
    timeout: timeoutField(),
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
        "Include each object's description in the response. Where the system serves ADT batch, each description is read from the object's metadata: one more read per object, which on a large package takes most of the call (default: false)",
      ),
  },
} as const;

interface GetPackageContentsArgs {
  package_name?: string;
  package_names?: string[];
  include_subpackages?: boolean;
  max_depth?: number;
  include_descriptions?: boolean;
}

export async function handleGetPackageContents(
  context: HandlerContext,
  args: GetPackageContentsArgs,
) {
  const { connection, logger } = context;
  try {
    const single = typeof args?.package_name === 'string' && args.package_name;
    const list = Array.isArray(args?.package_names) ? args.package_names : [];
    if (single && list.length > 0) {
      return return_error('Give exactly one of package_name or package_names');
    }
    if (!single && list.length === 0) {
      return return_error('Package name is required');
    }
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
    // one envelope (spec §11), then, when descriptions are asked for, every
    // object's description from its metadata in one more; one package after
    // another where the system has no communication batch.
    const walked = await withSequentialFallback(
      context,
      async () => {
        const levels = await walkPackages(
          batchReader<NodeRequest, unknown>(context, (request, c) =>
            readNode(
              nodeStructureOn(
                context,
                createAdtClient(c, logger).getUtils(ourUtils),
              ),
              request,
            ),
          ),
          packageNames,
          options,
        );
        // Descriptions only when asked for: each is its object's metadata.
        return options.includeDescriptions === true
          ? describeFromMetadata(context, levels)
          : levels;
      },
      () => {
        const utils = createAdtClient(connection, logger).getUtils(ourUtils);
        return rootByRoot(packageNames, (name) =>
          walkPackage(nodeStructureOn(context, utils), name, options),
        );
      },
    );

    let answered: unknown;
    if (single) {
      const only = walked[0] as (typeof walked)[number];
      if (!only.ok) throw only.error;
      answered = assembleList(single.toUpperCase(), only.value);
    } else {
      answered = walked.map((result, i) => {
        const package_name = packageNames[i] as string;
        return result.ok
          ? { package_name, objects: assembleList(package_name, result.value) }
          : {
              package_name,
              error: thrownEntry(result.error, 'read package node structure'),
            };
      });
    }

    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify(answered, null, 2),
        },
      ],
    };
  } catch (error) {
    // A refused level of the walk: the method's error as it is, with its
    // step; a thrown chain failure as the chain made it; a throw of our own
    // `client_threw` — never the throw's message as bare text.
    return answerCaught(error, { tool: 'GetPackageContents', detail: 'terse' });
  }
}
