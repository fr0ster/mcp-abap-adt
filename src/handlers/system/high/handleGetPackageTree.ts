/**
 * GetPackageTree Handler - High-level handler for package tree structure
 *
 * Builds a complete tree of package contents (subpackages + objects)
 * using node structure traversal to preserve hierarchy and ordering.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import { XMLParser } from 'fast-xml-parser';
import convert from 'xml-js';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetPackageTree',
  description:
    '[high-level] Retrieve complete package tree structure including subpackages and objects. Returns hierarchical tree with object names, types, and descriptions.',
  inputSchema: {
    type: 'object',
    properties: {
      package_name: {
        type: 'string',
        description: 'Package name (e.g., "ZMY_PACKAGE")',
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
    required: ['package_name'],
  },
} as const;

interface GetPackageTreeArgs {
  package_name: string;
  include_subpackages?: boolean;
  max_depth?: number;
  include_descriptions?: boolean;
  debug?: boolean;
}

interface PackageTreeNode {
  name: string;
  adtType?: string;
  type?: SupportedType;
  description?: string;
  is_package: boolean;
  codeFormat?: 'source' | 'xml';
  restoreStatus?: 'ok' | 'not-implemented';
  children?: PackageTreeNode[];
  _nodeId?: string; // Temporary: for tree building
  _parentNodeId?: string; // Temporary: for tree building
}

interface VirtualFolderEntry {
  name?: string;
  displayName?: string;
  facet?: string;
  text?: string;
  type?: string;
}

interface VirtualObjectEntry {
  name?: string;
  type?: string;
  text?: string;
}

type SupportedType =
  | 'package'
  | 'domain'
  | 'dataElement'
  | 'structure'
  | 'table'
  | 'tableType'
  | 'view'
  | 'class'
  | 'interface'
  | 'program'
  | 'functionGroup'
  | 'functionModule'
  | 'serviceDefinition'
  | 'metadataExtension'
  | 'behaviorDefinition'
  | 'behaviorImplementation';

interface BuildTreeDiagnostics {
  skipped_missing_name_or_type: number;
  duplicate_keys: number;
  node_id_count: number;
  parent_node_id_count: number;
  has_hierarchy: boolean;
  type_counts: Record<string, number>;
}

interface PackageTreeDiagnostics extends BuildTreeDiagnostics {
  package_name: string;
  depth: number;
  xml_bytes: number;
  node_count: number;
  subpackage_count: number;
  source?: 'virtual_folders' | 'node_structure';
  group_count?: number;
  type_count?: number;
  object_count?: number;
}

type NodeValue = Record<string, unknown> | unknown[] | string | number | null;
type NodeRecord = Record<string, NodeValue>;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

function asArray<T>(value?: T | T[]): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function readAttr(node: NodeRecord, name: string): string | undefined {
  const value = node[`@_${name}`];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

function findVirtualFoldersResult(value: NodeValue): NodeRecord | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findVirtualFoldersResult(item as NodeValue);
      if (found) {
        return found;
      }
    }
    return undefined;
  }
  const record = value as NodeRecord;
  for (const [key, entry] of Object.entries(record)) {
    if (
      key === 'virtualFoldersResult' ||
      key.endsWith(':virtualFoldersResult')
    ) {
      return entry as NodeRecord;
    }
  }
  for (const entry of Object.values(record)) {
    const found = findVirtualFoldersResult(entry);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function parseVirtualFoldersXml(xml: string): {
  folders: VirtualFolderEntry[];
  objects: VirtualObjectEntry[];
} {
  const parsed = xmlParser.parse(xml) as NodeRecord;
  const root = findVirtualFoldersResult(parsed);
  if (!root) {
    throw new Error('Failed to parse virtual folders result');
  }
  const folderNodes = asArray(
    (root['vfs:virtualFolder'] as NodeRecord | NodeRecord[] | undefined) ||
      (root['virtualFolder'] as NodeRecord | NodeRecord[] | undefined),
  );
  const objectNodes = asArray(
    (root['vfs:object'] as NodeRecord | NodeRecord[] | undefined) ||
      (root['object'] as NodeRecord | NodeRecord[] | undefined),
  );

  return {
    folders: folderNodes.map((node) => ({
      name: readAttr(node, 'name'),
      displayName: readAttr(node, 'displayName'),
      facet: readAttr(node, 'facet'),
      text: readAttr(node, 'text'),
      type: readAttr(node, 'type'),
    })),
    objects: objectNodes.map((node) => ({
      name: readAttr(node, 'name'),
      type: readAttr(node, 'type'),
      text: readAttr(node, 'text'),
    })),
  };
}

async function fetchVirtualFolders(
  context: HandlerContext,
  params: {
    objectSearchPattern?: string;
    preselection?: { facet: string; values: string[] }[];
    facetOrder?: string[];
    withVersions?: boolean;
    ignoreShortDescriptions?: boolean;
  },
): Promise<{ folders: VirtualFolderEntry[]; objects: VirtualObjectEntry[] }> {
  const { connection, logger } = context;
  const client = new AdtClient(connection, logger);
  const utils = client.getUtils();
  const response = await utils.getVirtualFoldersContents(params);
  const xml =
    typeof response.data === 'string'
      ? response.data
      : JSON.stringify(response.data);
  return parseVirtualFoldersXml(xml);
}

function normalizeAdtType(value?: string): string | undefined {
  if (!value) return undefined;
  const type = String(value).trim().toUpperCase();
  return type.length > 0 ? type : undefined;
}

function isPackageType(adtType: string): boolean {
  return adtType === 'DEVC' || adtType.startsWith('DEVC/');
}

function mapAdtTypeToCodeFormat(
  adtType?: string,
): PackageTreeNode['codeFormat'] {
  const type = normalizeAdtType(adtType);
  if (!type) return undefined;

  if (type === 'DEVC/K' || type === 'DEVC') return 'xml';
  if (type.startsWith('DEVC/')) return 'xml';
  if (type.startsWith('DOMA/')) return 'xml';
  if (type.startsWith('DTEL/')) return 'xml';
  if (type === 'FUGR/F' || type === 'FUGR') return 'xml';

  if (type.startsWith('CLAS/')) return 'source';
  if (type.startsWith('INTF/')) return 'source';
  if (type.startsWith('PROG/')) return 'source';
  if (type.startsWith('DDLS/')) return 'source';
  if (type.startsWith('DDLX/')) return 'source';
  if (type.startsWith('SRVD/')) return 'source';
  if (type.startsWith('TABL/DT')) return 'source';
  if (type.startsWith('TABL/DS') || type.startsWith('STRU/')) return 'source';
  if (type.startsWith('TTYP/')) return 'source';
  if (type.startsWith('FUGR/FF')) return 'source';
  if (type.startsWith('BDEF/')) return 'source';
  if (type.startsWith('BIMP/') || type.startsWith('BIMPL/')) return 'source';

  return undefined;
}

async function fetchSubpackageNodes(
  context: HandlerContext,
  packageName: string,
  includeDescriptions: boolean,
  diagnostics?: PackageTreeDiagnostics[],
  depth?: number,
): Promise<Array<{ name: string; description?: string }>> {
  const { connection, logger } = context;
  const client = new AdtClient(connection, logger);
  const utils = client.getUtils();
  const response = await utils.fetchNodeStructure(
    'DEVC/K',
    packageName,
    undefined,
    includeDescriptions,
  );
  const nodes = parseNodeStructure(response.data, logger);
  const children = buildTreeFromNodes(nodes, logger);
  const subpackages = children.filter((child) => child.is_package);

  if (diagnostics) {
    const stats = summarizeBuildTreeDiagnostics(nodes, logger);
    diagnostics.push({
      package_name: packageName,
      depth: depth ?? 0,
      xml_bytes: response.data?.length || 0,
      node_count: nodes.length,
      subpackage_count: subpackages.length,
      source: 'node_structure',
      ...stats,
    });
  }

  return subpackages.map((child) => ({
    name: child.name,
    description: child.description,
  }));
}

async function buildVirtualFolderObjects(
  context: HandlerContext,
  packageName: string,
  includeDescriptions: boolean,
): Promise<{
  objects: PackageTreeNode[];
  groupCount: number;
  typeCount: number;
  objectCount: number;
}> {
  const packageNameUpper = packageName.toUpperCase();
  const baseSelection = [{ facet: 'PACKAGE', values: [packageNameUpper] }];
  const groupResult = await fetchVirtualFolders(context, {
    objectSearchPattern: '*',
    preselection: baseSelection,
    facetOrder: ['GROUP'],
  });
  const groups = groupResult.folders.filter(
    (entry) => entry.facet?.toUpperCase() === 'GROUP',
  );

  let typeCount = 0;
  let objectCount = 0;
  const objectNodes: PackageTreeNode[] = [];

  for (const group of groups) {
    const groupSelection = group.name || group.displayName || 'GROUP';

    const typeResult = await fetchVirtualFolders(context, {
      objectSearchPattern: '*',
      preselection: [
        ...baseSelection,
        { facet: 'GROUP', values: [groupSelection] },
      ],
      facetOrder: ['TYPE'],
    });
    const types = typeResult.folders.filter(
      (entry) => entry.facet?.toUpperCase() === 'TYPE',
    );
    typeCount += types.length;

    for (const type of types) {
      const typeSelection = type.name || type.displayName || 'TYPE';

      const objectResult = await fetchVirtualFolders(context, {
        objectSearchPattern: '*',
        preselection: [
          ...baseSelection,
          { facet: 'GROUP', values: [groupSelection] },
          { facet: 'TYPE', values: [typeSelection] },
        ],
        facetOrder: [],
      });

      const typeObjects = objectResult.objects
        .filter((entry) => entry.name)
        .map((entry) => {
          const adtType = normalizeAdtType(entry.type) || '';
          const supportedType = mapAdtTypeToSupported(adtType);
          return {
            name: entry.name || '',
            adtType: adtType || undefined,
            type: supportedType,
            description: includeDescriptions ? entry.text : undefined,
            is_package: adtType ? isPackageType(adtType) : false,
            codeFormat: mapAdtTypeToCodeFormat(adtType),
            restoreStatus: isRestoreImplemented(supportedType)
              ? 'ok'
              : 'not-implemented',
            children: [],
          } as PackageTreeNode;
        });

      objectCount += typeObjects.length;
      objectNodes.push(...typeObjects);
    }
  }

  return {
    objects: objectNodes,
    groupCount: groups.length,
    typeCount,
    objectCount,
  };
}

function mapAdtTypeToSupported(adtType?: string): SupportedType | undefined {
  if (!adtType) {
    return undefined;
  }
  const type = adtType.toUpperCase();
  const map: Record<string, SupportedType> = {
    'DEVC/K': 'package',
    'DOMA/DD': 'domain',
    'DTEL/DE': 'dataElement',
    'TABL/DS': 'structure',
    'STRU/DT': 'structure',
    'TABL/DT': 'table',
    'TTYP/DF': 'tableType',
    'TTYP/TT': 'tableType',
    'DDLS/DF': 'view',
    'DDLX/EX': 'metadataExtension',
    'CLAS/OC': 'class',
    'INTF/IF': 'interface',
    'INTF/OI': 'interface',
    'PROG/P': 'program',
    'FUGR/FF': 'functionModule',
    'FUGR/F': 'functionGroup',
    FUGR: 'functionGroup',
    'SRVD/SRV': 'serviceDefinition',
    'BDEF/BDO': 'behaviorDefinition',
    'BIMP/BIM': 'behaviorImplementation',
    'BIMP/BI': 'behaviorImplementation',
    'BIMP/BO': 'behaviorImplementation',
  };
  if (map[type]) {
    return map[type];
  }
  if (type.startsWith('CLAS/')) return 'class';
  if (type.startsWith('INTF/')) return 'interface';
  if (type.startsWith('PROG/')) return 'program';
  if (type.startsWith('DDLS/')) return 'view';
  if (type.startsWith('DDLX/')) return 'metadataExtension';
  if (type.startsWith('SRVD/')) return 'serviceDefinition';
  if (type.startsWith('DOMA/')) return 'domain';
  if (type.startsWith('DTEL/')) return 'dataElement';
  if (type.startsWith('TABL/DS') || type.startsWith('STRU/'))
    return 'structure';
  if (type.startsWith('TABL/DT')) return 'table';
  if (type.startsWith('TTYP/')) return 'tableType';
  if (type.startsWith('FUGR/FF')) return 'functionModule';
  if (type.startsWith('FUGR/')) return 'functionGroup';
  if (type.startsWith('DEVC/')) return 'package';
  if (type.startsWith('BDEF/')) return 'behaviorDefinition';
  if (type.startsWith('BIMP/')) return 'behaviorImplementation';
  if (type.startsWith('BIMPL/')) return 'behaviorImplementation';
  return undefined;
}

function isRestoreImplemented(type?: SupportedType): boolean {
  if (!type) {
    return false;
  }
  const supported = new Set<SupportedType>([
    'package',
    'domain',
    'dataElement',
    'structure',
    'table',
    'tableType',
    'view',
    'class',
    'interface',
    'program',
    'functionGroup',
    'functionModule',
    'serviceDefinition',
    'metadataExtension',
    'behaviorDefinition',
    'behaviorImplementation',
  ]);
  return supported.has(type);
}

/**
 * Parse node structure XML response
 * Uses xml-js like handleGetPackage.ts for consistency
 */
function parseNodeStructure(xmlData: string, logger?: any): any[] {
  try {
    if (!xmlData || xmlData.length === 0) {
      logger?.warn('parseNodeStructure: Empty XML data');
      return [];
    }

    const result = convert.xml2js(xmlData, { compact: true });

    // Check if TREE_CONTENT exists
    const treeContent = result['asx:abap']?.['asx:values']?.DATA?.TREE_CONTENT;
    if (!treeContent) {
      logger?.warn(
        'parseNodeStructure: TREE_CONTENT not found in XML. Available keys:',
        Object.keys(result['asx:abap']?.['asx:values']?.DATA || {}),
      );
      return [];
    }

    let nodes = treeContent.SEU_ADT_REPOSITORY_OBJ_NODE || [];

    if (!Array.isArray(nodes)) {
      nodes = [nodes];
    }

    logger?.info(
      `parseNodeStructure: Parsed ${nodes.length} nodes from XML (${xmlData.length} bytes)`,
    );

    return nodes;
  } catch (error) {
    logger?.error('parseNodeStructure: Failed to parse XML', error);
    // If parsing fails, return empty array
    return [];
  }
}

/**
 * Build tree structure from flat node list using NODE_ID and PARENT_NODE_ID
 * If XML contains hierarchy information (NODE_ID/PARENT_NODE_ID), builds tree in one pass.
 * Otherwise, returns flat list (all nodes as direct children).
 * Uses xml-js format: node.OBJECT_NAME._text, node.NODE_ID._text, node.PARENT_NODE_ID._text
 */
function buildTreeFromNodes(nodes: any[], logger?: any): PackageTreeNode[] {
  logger?.info(`buildTreeFromNodes: Processing ${nodes.length} nodes`);

  // First pass: create all nodes and check if we have hierarchy info
  const nodeMap = new Map<string, PackageTreeNode>();
  const orderedKeys: string[] = [];
  let hasHierarchy = false;
  const typeCounts: Record<string, number> = {};
  let skippedMissingNameOrType = 0;
  let duplicateKeys = 0;
  let nodeIdCount = 0;
  let parentNodeIdCount = 0;

  const normalizeObjectType = (value: any): string | undefined =>
    normalizeAdtType(value);

  for (const node of nodes) {
    const objectName = node.OBJECT_NAME?._text || node.OBJECT_NAME;
    const objectTypeRaw = node.OBJECT_TYPE?._text || node.OBJECT_TYPE;
    const objectType = normalizeObjectType(objectTypeRaw);
    const nodeId = node.NODE_ID?._text || node.NODE_ID;
    const parentNodeId = node.PARENT_NODE_ID?._text || node.PARENT_NODE_ID;
    const nodeIdKey = nodeId ? String(nodeId) : undefined;
    const parentNodeIdKey = parentNodeId ? String(parentNodeId) : undefined;
    const description = node.DESCRIPTION?._text || node.DESCRIPTION;

    // Skip if no name or type
    if (!objectName || !objectType) {
      skippedMissingNameOrType += 1;
      continue;
    }

    const isPackage = isPackageType(objectType);

    // Use nodeId as key if available, otherwise use objectName
    const key =
      nodeIdKey ||
      `${objectType}:${objectName}:${orderedKeys.length.toString()}`;

    if (nodeMap.has(key)) {
      duplicateKeys += 1;
    }

    const supportedType = mapAdtTypeToSupported(objectType);
    nodeMap.set(key, {
      name: String(objectName).trim(),
      adtType: objectType,
      type: supportedType,
      description: description ? String(description).trim() : undefined,
      is_package: isPackage,
      codeFormat: mapAdtTypeToCodeFormat(objectType),
      restoreStatus: isRestoreImplemented(supportedType)
        ? 'ok'
        : 'not-implemented',
      children: [],
      _nodeId: nodeIdKey,
      _parentNodeId: parentNodeIdKey,
    });
    orderedKeys.push(key);

    if (nodeIdKey && parentNodeIdKey) {
      hasHierarchy = true;
    }

    if (nodeIdKey) nodeIdCount += 1;
    if (parentNodeIdKey) parentNodeIdCount += 1;
    typeCounts[objectType] = (typeCounts[objectType] || 0) + 1;
  }

  if (logger) {
    const types = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([type, count]) => `${type}:${count}`);
    logger.debug(
      `buildTreeFromNodes: skipped_missing=${skippedMissingNameOrType}, duplicates=${duplicateKeys}, node_id=${nodeIdCount}, parent_node_id=${parentNodeIdCount}, top_types=[${types.join(', ')}]`,
    );
  }

  // If we have hierarchy info, build tree structure
  if (hasHierarchy) {
    const roots: PackageTreeNode[] = [];

    for (const key of orderedKeys) {
      const node = nodeMap.get(key);
      if (!node) {
        continue;
      }
      const parentNodeId = node._parentNodeId;

      if (parentNodeId && nodeMap.has(parentNodeId)) {
        // This node has a parent - add it to parent's children
        nodeMap.get(parentNodeId)?.children?.push(node);
      } else {
        // This is a root node
        roots.push(node);
      }
    }

    // Clean up temporary properties
    for (const key of orderedKeys) {
      const node = nodeMap.get(key);
      if (!node) {
        continue;
      }
      delete node._nodeId;
      delete node._parentNodeId;
    }

    if (logger) {
      logger.debug(
        `Built hierarchical tree: ${roots.length} root nodes from ${nodes.length} total nodes`,
      );
    }

    return roots;
  }

  // No hierarchy info - return flat list (all nodes as direct children)
  const result: PackageTreeNode[] = orderedKeys
    .map((key) => {
      const node = nodeMap.get(key);
      if (!node) {
        return null;
      }
      delete node._nodeId;
      delete node._parentNodeId;
      return node;
    })
    .filter((node): node is PackageTreeNode => node !== null);

  if (logger) {
    logger.debug(
      `Built flat list: ${result.length} nodes (packages: ${result.filter((c) => c.is_package).length}, objects: ${result.filter((c) => !c.is_package).length})`,
    );
  }

  return result;
}

function summarizeBuildTreeDiagnostics(
  nodes: any[],
  _logger?: any,
): BuildTreeDiagnostics {
  // Summarize counts to surface diagnostics in response metadata.
  const typeCounts: Record<string, number> = {};
  let skippedMissingNameOrType = 0;
  let duplicateKeys = 0;
  let nodeIdCount = 0;
  let parentNodeIdCount = 0;
  let hasHierarchy = false;
  const seenKeys: Record<string, boolean> = {};

  const normalizeObjectType = (value: any): string | undefined =>
    normalizeAdtType(value);

  for (const node of nodes) {
    const objectName = node.OBJECT_NAME?._text || node.OBJECT_NAME;
    const objectTypeRaw = node.OBJECT_TYPE?._text || node.OBJECT_TYPE;
    const objectType = normalizeObjectType(objectTypeRaw);
    const nodeId = node.NODE_ID?._text || node.NODE_ID;
    const parentNodeId = node.PARENT_NODE_ID?._text || node.PARENT_NODE_ID;

    if (!objectName || !objectType) {
      skippedMissingNameOrType += 1;
      continue;
    }

    const key = nodeId || `${objectType}:${objectName}`;
    if (seenKeys[key]) duplicateKeys += 1;
    seenKeys[key] = true;

    if (nodeId) nodeIdCount += 1;
    if (parentNodeId) parentNodeIdCount += 1;
    if (nodeId && parentNodeId) hasHierarchy = true;
    typeCounts[objectType] = (typeCounts[objectType] || 0) + 1;
  }

  return {
    skipped_missing_name_or_type: skippedMissingNameOrType,
    duplicate_keys: duplicateKeys,
    node_id_count: nodeIdCount,
    parent_node_id_count: parentNodeIdCount,
    has_hierarchy: hasHierarchy,
    type_counts: typeCounts,
  };
}

/**
 * Recursively fetch package tree
 */
async function fetchPackageTreeRecursive(
  context: HandlerContext,
  packageName: string,
  currentDepth: number,
  maxDepth: number,
  includeDescriptions: boolean,
  includeSubpackages: boolean,
  diagnostics?: PackageTreeDiagnostics[],
): Promise<PackageTreeNode | null> {
  const { connection, logger } = context;

  if (currentDepth >= maxDepth) {
    logger?.debug(
      `Max depth reached for package ${packageName} at depth ${currentDepth} (max: ${maxDepth})`,
    );
    // Return package node without children instead of null
    return {
      name: packageName,
      adtType: 'DEVC/K',
      type: 'package',
      is_package: true,
      codeFormat: mapAdtTypeToCodeFormat('DEVC/K'),
      restoreStatus: 'ok',
      children: [],
    };
  }

  try {
    // Create AdtClient and get utilities
    const client = new AdtClient(connection, logger);
    const utils = client.getUtils();

    logger?.info(
      `Fetching node structure for package ${packageName} (depth: ${currentDepth})`,
    );

    // Fetch node structure for the package
    // Don't pass node_id to get root level (defaults to '000000' internally)
    const nodeStructureResponse = await utils.fetchNodeStructure(
      'DEVC/K',
      packageName,
      undefined, // Root node - will use default '000000'
      includeDescriptions,
    );

    logger?.info(
      `Node structure response received for ${packageName}, data length: ${nodeStructureResponse.data?.length || 0}`,
    );

    // Parse node structure
    const nodes = parseNodeStructure(nodeStructureResponse.data, logger);
    logger?.info(
      `Parsed ${nodes.length} nodes from package ${packageName} (depth: ${currentDepth})`,
    );

    if (nodes.length === 0) {
      logger?.warn(
        `No nodes parsed from package ${packageName} - XML may be empty or malformed`,
      );
    }

    // Log first node structure for debugging
    if (nodes.length > 0 && logger) {
      const firstNode = nodes[0];
      const nodeKeys = Object.keys(firstNode);
      logger.debug(
        `First node keys: ${nodeKeys.join(', ')}, OBJECT_NAME: ${JSON.stringify(firstNode.OBJECT_NAME)}, OBJECT_TYPE: ${JSON.stringify(firstNode.OBJECT_TYPE)}, NODE_ID: ${JSON.stringify(firstNode.NODE_ID)}, PARENT_NODE_ID: ${JSON.stringify(firstNode.PARENT_NODE_ID)}`,
      );
    }

    if (nodes.length === 0) {
      logger?.warn(
        `No nodes found for package ${packageName} - package may be empty or inaccessible`,
      );
      return {
        name: packageName,
        adtType: 'DEVC/K',
        type: 'package',
        is_package: true,
        codeFormat: mapAdtTypeToCodeFormat('DEVC/K'),
        restoreStatus: 'ok',
        children: [],
      };
    }

    // Build tree from nodes - if XML contains hierarchy (NODE_ID/PARENT_NODE_ID),
    // it's built in one pass. Otherwise, we get flat list.
    logger?.info(
      `Building tree from ${nodes.length} nodes for package ${packageName}`,
    );
    const children = buildTreeFromNodes(nodes, logger);
    logger?.info(
      `Built ${children.length} children for package ${packageName} (packages: ${children.filter((c) => c.is_package).length}, objects: ${children.filter((c) => !c.is_package).length})`,
    );
    if (logger?.debug) {
      const packageNames = children
        .filter((c) => c.is_package)
        .map((c) => c.name)
        .slice(0, 25);
      logger.debug(
        `Package candidates for ${packageName}: ${packageNames.join(', ') || '[none]'}`,
      );
    }

    if (diagnostics) {
      const stats = summarizeBuildTreeDiagnostics(nodes, logger);
      diagnostics.push({
        package_name: packageName,
        depth: currentDepth,
        xml_bytes: nodeStructureResponse.data?.length || 0,
        node_count: nodes.length,
        subpackage_count: children.filter((c) => c.is_package).length,
        source: 'node_structure',
        ...stats,
      });
    }

    // Create package node with its direct children
    const packageNode: PackageTreeNode = {
      name: packageName,
      adtType: 'DEVC/K',
      type: 'package',
      is_package: true,
      codeFormat: mapAdtTypeToCodeFormat('DEVC/K'),
      restoreStatus: 'ok',
      children: children,
    };

    // For packages, fetchNodeStructure only returns first level (flat list)
    // We need to recursively fetch subpackages to build full tree
    logger?.debug(
      `Checking recursion conditions for ${packageName}: currentDepth=${currentDepth}, maxDepth=${maxDepth}, includeSubpackages=${includeSubpackages}, children.length=${children.length}`,
    );

    // Always fetch subpackage contents if we haven't reached maxDepth
    // If includeSubpackages is false, we only fetch one level (currentDepth + 1)
    // If includeSubpackages is true, we recurse fully up to maxDepth
    if (currentDepth < maxDepth && children.length > 0) {
      const subpackages = children.filter((child) => child.is_package);

      logger?.debug(
        `Found ${subpackages.length} subpackages in ${packageName}: ${subpackages.map((s) => s.name).join(', ')}`,
      );

      if (subpackages.length > 0) {
        logger?.debug(
          `Fetching ${subpackages.length} subpackages recursively for ${packageName} (includeSubpackages=${includeSubpackages})...`,
        );

        // Recursively fetch each subpackage
        // If includeSubpackages is false, only fetch one level (set maxDepth to currentDepth + 1)
        // If includeSubpackages is true, recurse fully up to maxDepth
        const subpackageMaxDepth = includeSubpackages
          ? maxDepth
          : currentDepth + 1;

        logger?.debug(
          `Subpackage maxDepth: ${subpackageMaxDepth} (includeSubpackages=${includeSubpackages}, currentDepth=${currentDepth}, maxDepth=${maxDepth})`,
        );

        const subpackagePromises = subpackages.map((subpackage) => {
          logger?.debug(
            `Fetching subpackage ${subpackage.name} recursively (depth ${currentDepth + 1}/${subpackageMaxDepth})`,
          );
          return fetchPackageTreeRecursive(
            context,
            subpackage.name,
            currentDepth + 1,
            subpackageMaxDepth,
            includeDescriptions,
            includeSubpackages,
            diagnostics,
          );
        });

        const subpackageTrees = await Promise.all(subpackagePromises);

        logger?.debug(
          `Received ${subpackageTrees.length} subpackage trees for ${packageName}, filtering nulls: ${subpackageTrees.filter((t) => t !== null).length}`,
        );

        // Replace subpackage nodes with full trees
        // Match subpackages by name to ensure correct replacement
        if (packageNode.children) {
          logger?.debug(
            `Replacing ${subpackages.length} subpackage nodes in ${packageName} with full trees`,
          );
          packageNode.children = packageNode.children.map((child) => {
            if (child.is_package) {
              // Find matching subpackage tree by name
              const subpackageTree = subpackageTrees.find(
                (tree) => tree && tree.name === child.name,
              );
              if (subpackageTree) {
                const childCount = subpackageTree.children?.length || 0;
                logger?.debug(
                  `Replacing subpackage ${child.name} with full tree (${childCount} children)`,
                );
                // Replace with full tree (includes all children recursively)
                return {
                  ...subpackageTree,
                  children: subpackageTree.children || [],
                };
              } else {
                logger?.warn(
                  `No tree found for subpackage ${child.name} in results. Available trees: ${subpackageTrees
                    .map((t) => t?.name)
                    .filter(Boolean)
                    .join(', ')}`,
                );
                // Keep original node but ensure children is an array
                return {
                  ...child,
                  children: child.children || [],
                };
              }
            }
            return child;
          });
          logger?.debug(
            `After replacement, ${packageName} has ${packageNode.children.length} children (${packageNode.children.filter((c) => c.is_package).length} packages)`,
          );
        }
      }
    }

    return packageNode;
  } catch (error: any) {
    logger?.error(`Failed to fetch package tree for ${packageName}`, error);
    // Return basic package node on error
    return {
      name: packageName,
      adtType: 'DEVC/K',
      type: 'package',
      is_package: true,
      codeFormat: mapAdtTypeToCodeFormat('DEVC/K'),
      restoreStatus: 'ok',
      children: [],
    };
  }
}

async function buildPackageTreeHybrid(
  context: HandlerContext,
  packageName: string,
  currentDepth: number,
  maxDepth: number,
  includeDescriptions: boolean,
  includeSubpackages: boolean,
  diagnostics?: PackageTreeDiagnostics[],
  visited?: Set<string>,
): Promise<PackageTreeNode> {
  const packageNameUpper = packageName.toUpperCase();
  const visitSet = visited ?? new Set<string>();
  if (visitSet.has(packageNameUpper)) {
    return {
      name: packageNameUpper,
      adtType: 'DEVC/K',
      type: 'package',
      is_package: true,
      codeFormat: mapAdtTypeToCodeFormat('DEVC/K'),
      restoreStatus: 'ok',
      children: [],
    };
  }
  visitSet.add(packageNameUpper);

  const { objects, groupCount, typeCount, objectCount } =
    await buildVirtualFolderObjects(
      context,
      packageNameUpper,
      includeDescriptions,
    );

  if (diagnostics) {
    diagnostics.push({
      package_name: packageNameUpper,
      depth: currentDepth,
      xml_bytes: 0,
      node_count: 0,
      subpackage_count: 0,
      source: 'virtual_folders',
      group_count: groupCount,
      type_count: typeCount,
      object_count: objectCount,
      skipped_missing_name_or_type: 0,
      duplicate_keys: 0,
      node_id_count: 0,
      parent_node_id_count: 0,
      has_hierarchy: false,
      type_counts: {},
    });
  }

  let subpackageNodes: PackageTreeNode[] = [];
  try {
    const subpackages = await fetchSubpackageNodes(
      context,
      packageNameUpper,
      includeDescriptions,
      diagnostics,
      currentDepth,
    );
    if (subpackages.length > 0) {
      if (includeSubpackages && currentDepth < maxDepth) {
        subpackageNodes = await Promise.all(
          subpackages.map((subpackage) =>
            buildPackageTreeHybrid(
              context,
              subpackage.name,
              currentDepth + 1,
              maxDepth,
              includeDescriptions,
              includeSubpackages,
              diagnostics,
              visitSet,
            ),
          ),
        );
      } else {
        subpackageNodes = subpackages.map((subpackage) => ({
          name: subpackage.name,
          adtType: 'DEVC/K',
          type: 'package',
          description: includeDescriptions ? subpackage.description : undefined,
          is_package: true,
          codeFormat: mapAdtTypeToCodeFormat('DEVC/K'),
          restoreStatus: 'ok',
          children: [],
        }));
      }
    }
  } catch (_error) {
    // Ignore subpackage issues; return object groups only.
  }

  return {
    name: packageNameUpper,
    adtType: 'DEVC/K',
    type: 'package',
    is_package: true,
    codeFormat: mapAdtTypeToCodeFormat('DEVC/K'),
    restoreStatus: 'ok',
    children: [...subpackageNodes, ...objects],
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
    // Validate required parameters
    if (!args?.package_name) {
      return return_error(new Error('package_name is required'));
    }

    const packageName = args.package_name.toUpperCase();
    const includeSubpackages = args.include_subpackages !== false;
    const maxDepth = args.max_depth || 5;
    const includeDescriptions = args.include_descriptions !== false;
    const debug = args.debug === true;

    logger?.info(
      `Fetching package tree for ${packageName} (include_subpackages: ${includeSubpackages}, max_depth: ${maxDepth})`,
    );

    // Fetch package tree
    const diagnostics: PackageTreeDiagnostics[] | undefined = debug
      ? []
      : undefined;

    const packageTree = await fetchPackageTreeRecursive(
      context,
      packageName,
      0,
      maxDepth,
      includeDescriptions,
      includeSubpackages,
      diagnostics,
    );

    if (!packageTree) {
      return return_error(
        new Error(`Failed to fetch package tree for ${packageName}`),
      );
    }

    packageTree.adtType = 'DEVC/K';
    packageTree.type = 'package';
    packageTree.is_package = true;

    logger?.debug(`Package tree fetched successfully for ${packageName}`);

    // Format response
    const response = {
      package_name: packageName,
      tree: packageTree,
      metadata: {
        include_subpackages: includeSubpackages,
        max_depth: maxDepth,
        include_descriptions: includeDescriptions,
        ...(debug && diagnostics ? { diagnostics } : {}),
      },
    };

    return return_response({
      data: JSON.stringify(response, null, 2),
    } as any);
  } catch (error: any) {
    logger?.error('Failed to fetch package tree', error);
    return return_error(error);
  }
}
