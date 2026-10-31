import {
  classDocuments,
  functionGroupDocuments,
  includeDocuments,
  programDocuments,
} from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { AbapConnection } from '@mcp-abap-adt/connection';
import type {
  AdtTypeCode,
  IAdtError,
  IAdtResponse,
} from '@mcp-abap-adt/interfaces-adt';
import {
  type AdtHeadersContext,
  withAdtHeaders,
} from '../../../lib/adtHeaders/withAdtHeaders';
import type { AdtCodes, TableMainOf } from '../../../lib/adtProjections';
import {
  type FailureEntry,
  failedPayloadOf,
  failureEntry,
  isCredentialFailure,
  isCredentialPayload,
  type McpResult,
  thrownEntry,
} from '../../../lib/answer';
import { failureOf } from '../../../lib/auth/failures';
import {
  type PhaseResult,
  runPhase,
  withSequentialFallback,
} from '../../../lib/batch/phases';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { endsTheCall } from '../../../lib/strategies/packageWalk';
import { ourUtils } from '../../../lib/strategies/resultSets';
import {
  carryingFailure,
  carryingPayload,
  methodFailureOf,
  payloadCarriedBy,
} from '../../../lib/strategies/step';
import { logger, return_error } from '../../../lib/utils';

/**
 * Raised deliberately by the enhancement helpers. Distinguishes "I decided this
 * input is unusable" from "something unexpected failed", which the helpers'
 * catch blocks need in order to avoid double-wrapping a message.
 */
class EnhancementInputError extends Error {}

/**
 * How a caller may name a host GetEnhancements reads by its type: the code,
 * its main type — the one its entry in the tables states (`main`) — and the
 * tool's own names, each upper-cased.
 */
type HostSpelling = {
  [C in AdtTypeCode]: {
    readonly code: C;
    readonly main?: TableMainOf<C>;
    readonly names: readonly string[];
  };
}[AdtTypeCode];

/** The hosts GetEnhancements takes a type for, as a caller may name each. */
const HOST_SPELLINGS = {
  class: { code: 'CLAS/OC', main: 'CLAS', names: ['CLASS'] },
  group: {
    code: 'FUGR/F',
    main: 'FUGR',
    names: ['FUNCTION_GROUP', 'FUNCTIONGROUP'],
  },
  program: { code: 'PROG/P', main: 'PROG', names: ['PROGRAM'] },
  include: { code: 'PROG/I', names: ['INCLUDE'] },
} as const satisfies Readonly<Record<string, HostSpelling>>;

/** Whether `kind`, upper-cased, names `host`. */
function spelledAs(kind: string, host: HostSpelling): boolean {
  return kind === host.code || kind === host.main || host.names.includes(kind);
}

export const TOOL_DEFINITION = {
  name: 'GetEnhancements',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Lists the enhancements (enhancement implementations) of the program, include, function group or class named by object_name and object_type. Takes object_name and object_type (one object: its enhancements) or objects (several objects: one entry per object, in the order given, each its enhancements answer or { object_name, object_type, error }).',
  inputSchema: {
    type: 'object',
    properties: {
      object_name: {
        type: 'string',
        description:
          'Name of the ABAP object (with object_type; or give objects)',
      },
      object_type: {
        type: 'string',
        description: '[read-only] Type of the ABAP object',
      },
      objects: {
        type: 'array',
        description:
          '[read-only] Several objects, read together (give this or object_name and object_type)',
        items: {
          type: 'object',
          properties: {
            object_name: {
              type: 'string',
              description: 'Name of the ABAP object',
            },
            object_type: {
              type: 'string',
              description: 'Type of the ABAP object',
            },
          },
          required: ['object_name', 'object_type'],
        },
      },
    },
    required: [],
  },
} as const;

/**
 * Interface for enhancement implementation data
 */
export interface EnhancementImplementation {
  name: string;
  type: string;
  sourceCode?: string;
  description?: string;
}

/**
 * Interface for parsed enhancement response
 */
export interface EnhancementResponse {
  object_name: string;
  object_type: 'program' | 'include' | 'class' | 'function_group';
  context?: string;
  enhancements: EnhancementImplementation[];
  detailed?: boolean;
  total_enhancements?: number;
  /**
   * Probes that were refused rather than answering "not this kind of object".
   * Present only when there is something to say: an empty enhancement list and
   * a list nobody was allowed to read are different answers, and they used to
   * look the same.
   */
  unreadable?: FailureEntry[];
}

/**
 * Parses enhancement XML to extract enhancement implementations with their source code
 * @param xmlData - Raw XML response from ADT
 * @returns Array of enhancement implementations
 */
export function parseEnhancementsFromXml(
  xmlData: string,
): EnhancementImplementation[] {
  const enhancements: EnhancementImplementation[] = [];

  try {
    // Extract <enh:source> elements which contain the base64 encoded enhancement source code
    const sourceRegex = /<enh:source[^>]*>([^<]*)<\/enh:source>/g;
    let match: RegExpExecArray | null = sourceRegex.exec(xmlData);
    let index = 0;

    while (match !== null) {
      const enhancement: EnhancementImplementation = {
        name: `enhancement_${index + 1}`, // Default name if not found in attributes
        type: 'enhancement',
      };

      // Try to find enhancement name and type from parent elements or attributes
      const sourceStart = match.index;

      // Look backwards for parent enhancement element with name/type attributes
      const beforeSource = xmlData.substring(0, sourceStart);

      // Try multiple patterns to find enhancement name
      // Pattern 1: adtcore:name attribute
      let enhNameMatch = beforeSource.match(/adtcore:name="([^"]*)"[^>]*$/);
      // Pattern 2: enh:name attribute
      if (!enhNameMatch) {
        enhNameMatch = beforeSource.match(/enh:name="([^"]*)"[^>]*$/);
      }
      // Pattern 3: name attribute
      if (!enhNameMatch) {
        enhNameMatch = beforeSource.match(/name="([^"]*)"[^>]*$/);
      }
      // Pattern 4: Look for enhancement implementation name in nearby elements
      if (!enhNameMatch) {
        // Look for enhancement implementation tag with name
        const enhImplMatch = beforeSource.match(
          /<[^>]*enhancement[^>]*name="([^"]*)"[^>]*>/i,
        );
        if (enhImplMatch?.[1]) {
          enhNameMatch = [enhImplMatch[0], enhImplMatch[1]];
        }
      }

      // Try multiple patterns to find enhancement type
      let enhTypeMatch = beforeSource.match(/adtcore:type="([^"]*)"[^>]*$/);
      if (!enhTypeMatch) {
        enhTypeMatch = beforeSource.match(/enh:type="([^"]*)"[^>]*$/);
      }
      if (!enhTypeMatch) {
        enhTypeMatch = beforeSource.match(/type="([^"]*)"[^>]*$/);
      }

      if (enhNameMatch?.[1]) {
        enhancement.name = enhNameMatch[1];
      }
      if (enhTypeMatch?.[1]) {
        enhancement.type = enhTypeMatch[1];
      }

      // The implementation a source sits in names it. Every source nests in
      // `enh:enhancementImplementations adtcore:name="…"`, so the nearest one
      // opened before this source is its own — the patterns above searched
      // the whole preceding document and took its FIRST name, which named
      // all five of SAPMV45A's implementations after the first (on premise,
      // 2026-09-25). They stay as the fallback for a document without it.
      const owners = beforeSource.match(
        /<enh:enhancementImplementations\b[^>]*>/g,
      );
      const owner = owners?.[owners.length - 1];
      if (owner) {
        const ownerName = owner.match(/adtcore:name="([^"]*)"/)?.[1];
        const ownerType = owner.match(/adtcore:type="([^"]*)"/)?.[1];
        if (ownerName) enhancement.name = ownerName;
        if (ownerType) enhancement.type = ownerType;
      }

      // Extract and decode the base64 source code
      const base64Source = match[1];
      if (base64Source) {
        try {
          // Decode base64 source code
          const decodedSource = Buffer.from(base64Source, 'base64').toString(
            'utf-8',
          );
          enhancement.sourceCode = decodedSource;
        } catch (decodeError) {
          logger?.warn(
            `Failed to decode source code for enhancement ${enhancement.name}:`,
            decodeError,
          );
          enhancement.sourceCode = base64Source; // Keep original if decode fails
        }
      }

      enhancements.push(enhancement);
      index++;
      match = sourceRegex.exec(xmlData);
    }

    logger?.info(`Parsed ${enhancements.length} enhancement implementations`);
    return enhancements;
  } catch (parseError) {
    logger?.error('Failed to parse enhancement XML:', parseError);
    return [];
  }
}

/**
 * Whose enhancements to read, and what kind of object it is.
 *
 * **The caller's `object_type` decides; guessing is the fallback.** This
 * used to ignore it and probe class → program → include. A function group's
 * main program `SAPL<fg>` is none of those addressable things — on premise
 * (2026-09-25) all three URIs answered 404 — so the tool failed outright.
 * Its enhancements are the group's, which answer 200. Each probe that remains
 * is its own metadata read through adt-clients (`getClass()`, `getProgram()`,
 * `getInclude()`) with `analyseException`, so a refusal arrives in the shape
 * every other failure has.
 *
 * The elements themselves are read by the host's own adt-clients member,
 * `readEnhancementElements` (`IAdtEnhancementHost`, and
 * `IAdtIncludeEnhancementHost` for an include, whose read names its main
 * program).
 */
async function determineObjectTypeAndPath(
  connection: AbapConnection,
  objectName: string,
  manualProgramContext?: string,
  requestedType?: string,
): Promise<{
  type: 'program' | 'include' | 'class' | 'function_group';
  /** The host's enhancement elements, read with `analyseException`. */
  readElements: () => Promise<IAdtResponse<unknown, IAdtError>>;
  context?: string;
  /** Probes that were refused rather than answering "not this kind". */
  unreadable?: FailureEntry[];
}> {
  const name = objectName.toUpperCase();
  const kind = (requestedType ?? '').trim().toUpperCase();

  const client = createAdtClient(connection, logger);
  const analyse = { analyse: analyseException };
  const classPath = {
    type: 'class' as const,
    readElements: () =>
      client
        .getClass(classDocuments)
        .readEnhancementElements({ className: name }, analyse),
  };
  const programPath = {
    type: 'program' as const,
    readElements: () =>
      client
        .getProgram(programDocuments)
        .readEnhancementElements({ programName: name }, analyse),
  };
  const groupPath = (group: string) => ({
    type: 'function_group' as const,
    readElements: () =>
      client
        .getFunctionGroup(functionGroupDocuments)
        .readEnhancementElements({ functionGroupName: group }, analyse),
  });
  // `SAPL<fg>` is the group's main program: address the group.
  const saplGroup =
    name.startsWith('SAPL') && name.length > 4 ? name.slice(4) : undefined;

  /**
   * What could not be read, and why. A probe that finds nothing is how this
   * handler learns which kind of object it was given; a probe that is REFUSED is
   * something else entirely, and both used to come back as `undefined`.
   *
   * So a `404` — the object is not of that kind, or not there — keeps the probe
   * going and says nothing, and anything else is collected and travels in the
   * answer beside the enhancements that were found: the method's error as it
   * is, with the probe's step. `ExceptionResourceNoAccess` is the case that
   * mattered: an object this user may not read answered "no enhancements",
   * which is a different statement from "could not look".
   */
  const unreadable: FailureEntry[] = [];
  /** Carry the refusals out with whichever path was resolved. */
  const withReport = <T extends { type: string }>(path: T) =>
    unreadable.length > 0 ? { ...path, unreadable } : path;
  /** A metadata read: its document when found, `undefined` otherwise. */
  const probe = async (
    step: string,
    read: () => Promise<IAdtResponse<unknown, IAdtError>>,
  ): Promise<string | undefined> => {
    try {
      const answer = await read();
      if (answer.ok) return String(answer.getResult().value ?? '');
      const error = answer.getError();
      // The credentials are the same for every probe: the call ends, as it came.
      if (isCredentialPayload(failureEntry(error, step)))
        throw carryingFailure(new Error(error.message), error, step);
      if (error?.response?.status !== 404)
        unreadable.push(failureEntry(error, step));
      return undefined;
    } catch (error) {
      if (isCredentialPayload(thrownEntry(error, step))) throw error;
      unreadable.push(thrownEntry(error, step));
      return undefined;
    }
  };

  /**
   * The object's kind could not be resolved. When probes were refused, the
   * answer is those refusals as they are, each with its step — not words that
   * replace them; when every probe found nothing (404), the words.
   */
  const unresolved = (message: string): never => {
    const words = new EnhancementInputError(message);
    throw unreadable.length > 0
      ? carryingPayload(words, { failures: unreadable })
      : words;
  };

  const asInclude = async () => {
    const metadata = await probe('read include metadata', () =>
      client
        .getInclude(includeDocuments)
        .readMetadata({ includeName: name }, { analyse: analyseException }),
    );
    if (metadata === undefined) return undefined;
    let context: string | undefined;
    let mainProgram: string | undefined;
    if (manualProgramContext) {
      context = `/sap/bc/adt/programs/programs/${manualProgramContext}`;
      mainProgram = manualProgramContext;
    } else {
      context = metadata.match(
        /include:contextRef[^>]+adtcore:uri="([^"]+)"/,
      )?.[1];
      mainProgram = context ? mainProgramOf(context) : undefined;
    }
    if (!context || !mainProgram) {
      throw new EnhancementInputError(
        `Could not determine parent program context for include: ${objectName}. No contextRef found in metadata. Consider providing the 'program' parameter manually.`,
      );
    }
    // adt-clients takes the main program's name and builds its URI.
    const program = mainProgram;
    return {
      type: 'include' as const,
      readElements: () =>
        client
          .getInclude(includeDocuments)
          .readEnhancementElements(
            { includeName: name },
            { context: program, analyse: analyseException },
          ),
      context,
    };
  };

  // The type the caller named, taken at its word.
  if (spelledAs(kind, HOST_SPELLINGS.class)) {
    return withReport(classPath);
  }
  if (spelledAs(kind, HOST_SPELLINGS.group)) {
    return groupPath(saplGroup ?? name);
  }
  if (spelledAs(kind, HOST_SPELLINGS.program)) {
    return withReport(saplGroup ? groupPath(saplGroup) : programPath);
  }
  if (spelledAs(kind, HOST_SPELLINGS.include)) {
    const include = await asInclude();
    if (include) return withReport(include);
    return unresolved(`Include ${objectName} could not be read.`);
  }

  // No usable type: find out, one independent probe at a time.
  if (saplGroup) return withReport(groupPath(saplGroup));
  if (
    (await probe('read class metadata', () =>
      client
        .getClass(classDocuments)
        .readMetadata({ className: name }, { analyse: analyseException }),
    )) !== undefined
  ) {
    return withReport(classPath);
  }
  if (
    (await probe('read program metadata', () =>
      client
        .getProgram(programDocuments)
        .readMetadata({ programName: name }, { analyse: analyseException }),
    )) !== undefined
  ) {
    return withReport(programPath);
  }
  const include = await asInclude();
  if (include) return withReport(include);
  return unresolved(
    `Could not determine object type for: ${objectName}. Object is neither a valid class, program, include, nor a function group's main program.`,
  );
}

/**
 * The main program an include's `contextRef` URI names: a program's own name,
 * or `SAPL<group>` for a function group. `undefined` for any other URI.
 */
function mainProgramOf(uri: string): string | undefined {
  const last = (prefix: string) => {
    if (!uri.toLowerCase().startsWith(prefix)) return undefined;
    const segment = uri.slice(prefix.length).split(/[/?#]/)[0];
    return segment ? decodeURIComponent(segment).toUpperCase() : undefined;
  };
  const program = last('/sap/bc/adt/programs/programs/');
  if (program) return program;
  const group = last('/sap/bc/adt/functions/groups/');
  return group ? `SAPL${group}` : undefined;
}

/**
 * Internal function to get includes list using SAP ADT API
 * @param objectName - Name of the object
 * @param objectType - Type of the object ('program' | 'include' | 'class')
 * @returns Array of include names
 */
async function getIncludesListInternal(
  context: HandlerContext,
  objectName: string,
  objectType: 'program' | 'include' | 'class' | 'function_group',
): Promise<string[]> {
  const { connection, logger } = context;
  try {
    // Classes don't have includes in the traditional sense
    if (objectType === 'class') {
      logger?.info(
        `Classes don't have includes. Returning empty list for class '${objectName}'`,
      );
      return [];
    }

    // A function group's main program is walked as the group.
    const upper = objectName.toUpperCase();
    const isGroup =
      objectType === 'function_group' ||
      (upper.startsWith('SAPL') && upper.length > 4);
    const parentName =
      isGroup && upper.startsWith('SAPL') ? upper.slice(4) : upper;
    const parentType: AdtCodes<'FUGR/F' | 'PROG/P'> = isGroup
      ? 'FUGR/F'
      : 'PROG/P';

    if (objectType === 'include') {
      logger?.warn(
        `Include processing: assuming parent program for include ${objectName}`,
      );
    }

    // Create AdtClient and get utilities. `ourUtils` — not `resultsFor`'s
    // generic `structured` reading — because the shape this function needs
    // (objects at a level, and the type→nodeId pairs to descend into) is
    // exactly `nodeLevel`'s `NodeLevel`, the one reading every node-structure
    // caller in this migration reuses rather than re-derives.
    const client = createAdtClient(connection, logger);
    const utils = client.getUtils(ourUtils);

    // Step 1: Get root node structure to find the includes node
    const rootResponse = await withAdtHeaders(
      context,
      'utils.fetchNodeStructure',
      (headers) =>
        utils.fetchNodeStructure(parentType, parentName, {
          headers,
          analyse: analyseException,
          nodeId: '000000', // Root node
          withShortDescriptions: true,
        }),
    );

    if (!rootResponse.ok) {
      // SAP's refusal is the method's error as it is, with the step — not an
      // empty list of includes.
      throw carryingFailure(
        new Error(rootResponse.getError().message),
        rootResponse.getError(),
        'read node structure',
      );
    }

    // Step 2: Find the includes (PROG/I) node id among the type folders.
    const includesNode = rootResponse
      .getResult()
      // The includes node is `PROG/I` or `FUGR/I` (SAPMV45A's is FUGR/I,
      // with PROG/I objects under it — on premise, 2026-09-25).
      .value.childNodes.find((info) => /\/I$/.test(info.type));

    if (!includesNode) {
      logger?.info(`No includes node found for ${objectType} '${objectName}'`);
      return [];
    }

    // Step 3: Get includes list using the found node ID
    const includesResponse = await withAdtHeaders(
      context,
      'utils.fetchNodeStructure',
      (headers) =>
        utils.fetchNodeStructure(parentType, parentName, {
          headers,
          analyse: analyseException,
          nodeId: includesNode.nodeId,
          withShortDescriptions: true,
        }),
    );

    if (!includesResponse.ok) {
      throw carryingFailure(
        new Error(includesResponse.getError().message),
        includesResponse.getError(),
        'read includes node',
      );
    }

    // Step 4: Names of the objects under that node — de-duplicated, matching
    // the pre-migration parser's `[...new Set(...)]`.
    const includeNames = [
      ...new Set(includesResponse.getResult().value.objects.map((o) => o.name)),
    ];

    logger?.info(
      `Found ${includeNames.length} includes for ${objectType} '${objectName}' using SAP ADT API`,
    );
    return includeNames;
  } catch (error) {
    // SAP's refusal carried with its step, or a credential failure as it
    // came (adt-clients rejects with it): never an empty list of includes.
    if (methodFailureOf(error) !== undefined || failureOf(error) !== undefined)
      throw error;
    logger?.error(
      `Failed to get includes list for ${objectType} '${objectName}':`,
      error,
    );
    return [];
  }
}

/**
 * Gets enhancements for a single object (program or include)
 * @param objectName - Name of the object
 * @param manualProgramContext - Optional manual program context for includes
 * @returns Enhancement response for the single object
 */
async function getEnhancementsForSingleObject(
  connection: AbapConnection,
  objectName: string,
  manualProgramContext?: string,
  requestedType?: string,
): Promise<EnhancementResponse> {
  logger?.info(
    `Getting enhancements for single object: ${objectName}`,
    manualProgramContext
      ? `with manual program context: ${manualProgramContext}`
      : '',
  );

  // Determine object type and get appropriate path and context
  const objectInfo = await determineObjectTypeAndPath(
    connection,
    objectName,
    manualProgramContext,
    requestedType,
  );

  if (objectInfo.type === 'include' && objectInfo.context) {
    logger?.info(`Using context for include: ${objectInfo.context}`);
  }

  // The host's own adt-clients member, read with the strategy every other
  // read uses: SAP's refusal is the method's error as it is, with the step.
  const step = 'read enhancements';
  let answer: IAdtResponse<unknown, IAdtError>;
  try {
    answer = await objectInfo.readElements();
  } catch (thrown) {
    // A credential failure or an error already carrying its answer: as it is.
    if (
      failureOf(thrown) !== undefined ||
      methodFailureOf(thrown) !== undefined
    )
      throw thrown;
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    throw new EnhancementInputError(
      `Failed to retrieve enhancements for ${objectName}: ${message}`,
    );
  }
  if (!answer.ok) {
    const error = answer.getError();
    throw carryingFailure(
      new EnhancementInputError(error.message),
      error,
      step,
    );
  }

  // Parse the XML to extract enhancement implementations
  const enhancements = parseEnhancementsFromXml(
    String(answer.getResult().value ?? ''),
  );

  return {
    object_name: objectName,
    object_type: objectInfo.type,
    context: objectInfo.context,
    enhancements: enhancements,
    ...(objectInfo.unreadable ? { unreadable: objectInfo.unreadable } : {}),
  };
}

/**
 * A credential failure, however it travels: a chain failure or a `401` on the
 * throw itself, or carried as the method's error of a read.
 */
function credentialFailure(thrown: unknown): boolean {
  return (
    isCredentialFailure(thrown) ||
    isCredentialPayload(thrownEntry(thrown, 'read enhancements'))
  );
}

/**
 * Filters enhancement response to show minimal information
 */
function filterMinimalEnhancements(response: any): any {
  if (response.objects) {
    // For nested results, filter each object
    const filteredObjects = response.objects
      .filter((obj: any) => obj.enhancements && obj.enhancements.length > 0) // Only objects with enhancements
      .map((obj: any) => ({
        object_name: obj.object_name,
        object_type: obj.object_type,
        enhancements: obj.enhancements.map((enh: any) => ({
          name: enh.name,
          type: enh.type,
          // Include source code only if it's short (< 500 chars) or first 200 chars
          sourceCode: enh.sourceCode
            ? enh.sourceCode.length <= 500
              ? enh.sourceCode
              : `${enh.sourceCode.substring(0, 200)}...[truncated]`
            : undefined,
        })),
      }));

    return {
      ...response,
      detailed: false,
      total_objects_with_enhancements: filteredObjects.length,
      total_objects_analyzed: response.total_objects_analyzed,
      filtered_out: response.total_objects_analyzed - filteredObjects.length,
      objects: filteredObjects,
    };
  } else {
    // For single object results
    const filteredEnhancements = response.enhancements
      ? response.enhancements.map((enh: any) => ({
          name: enh.name,
          type: enh.type,
          sourceCode: enh.sourceCode
            ? enh.sourceCode.length <= 500
              ? enh.sourceCode
              : `${enh.sourceCode.substring(0, 200)}...[truncated]`
            : undefined,
        }))
      : [];

    return {
      object_name: response.object_name,
      object_type: response.object_type,
      context: response.context,
      detailed: false,
      total_enhancements: filteredEnhancements.length,
      enhancements: filteredEnhancements,
      ...(response.unreadable ? { unreadable: response.unreadable } : {}),
    };
  }
}

/**
 * Handler to retrieve enhancement implementations for ABAP programs/includes
 * Automatically determines if object is a program or include and handles accordingly
 *
 * @param args - Tool arguments containing:
 *   - object_name: Name of the ABAP object
 *   - program: Optional manual program context for includes
 *   - include_nested: Optional boolean - if true, also searches enhancements in all nested includes
 *   - detailed: Optional boolean - if false (default), returns minimal info; if true, returns full details including raw XML
 *   - max_includes: Optional maximum number of includes to process (default: 50)
 * @returns Response with parsed enhancement data or error
 */
async function enhancementsOf(context: HandlerContext, args: any) {
  const { connection, logger } = context;
  try {
    logger?.info('handleGetEnhancements called with args:', args);

    if (!args?.object_name) {
      return return_error('Object name is required');
    }

    const objectName = args.object_name;
    const manualProgram = args.program; // Optional manual program context for includes
    const includeNested = args.include_nested === true; // Optional boolean for recursive include search
    const isDetailed = args.detailed === true; // Optional boolean for detailed output

    const maxIncludes = args.max_includes
      ? parseInt(args.max_includes, 10)
      : 50; // Maximum number of includes to process

    logger?.info(`Getting enhancements for object: ${objectName}`, {
      manualProgram: manualProgram || '(not provided)',
      includeNested: includeNested,
      maxIncludes: maxIncludes,
    });

    // Get enhancements for the main object
    const mainEnhancementResponse = await getEnhancementsForSingleObject(
      connection,
      objectName,
      manualProgram,
      args.object_type,
    );

    if (!includeNested) {
      // Return only main object enhancements
      let response = mainEnhancementResponse;

      // Apply filtering if not detailed
      if (!isDetailed) {
        response = filterMinimalEnhancements(response);
      } else {
        // Add detailed flag for consistency
        response = { ...response, detailed: true };
      }

      const result = {
        isError: false,
        content: [
          {
            type: 'text',
            text: JSON.stringify(response),
          },
        ],
      };
      return result;
    }

    // If include_nested is true, also get enhancements from all nested includes
    logger?.info('Searching for nested includes and their enhancements...');

    // Simplified nested processing - no recursion, just flat list
    const processNestedIncludes = async () => {
      // Get flat list of all includes using the optimized GetIncludesList logic
      let includesList = await getIncludesListInternal(
        context,
        objectName,
        mainEnhancementResponse.object_type,
      );

      logger?.info(
        `Found ${includesList.length} includes (flat list, no recursion):`,
        includesList,
      );

      // Limit the number of includes to process
      if (includesList.length > maxIncludes) {
        logger?.warn(
          `Too many includes found (${includesList.length}). Limiting to first ${maxIncludes} includes.`,
        );
        includesList = includesList.slice(0, maxIncludes);
      }

      // An include whose request SAP refused is listed, the method's error as
      // it is with the step and the include's name, beside the others' results.
      const includesUnread: Array<{
        include: string;
        step: 'read enhancements';
        failures: FailureEntry[];
      }> = [];

      // Collect all enhancement responses
      const allEnhancementResponses: EnhancementResponse[] = [
        mainEnhancementResponse,
      ];

      // Sequential processing. No deadline of the server's: each read waits
      // for SAP's answer.
      for (const includeName of includesList) {
        try {
          logger?.info(`Getting enhancements for include: ${includeName}`);

          const includeEnhancements = await getEnhancementsForSingleObject(
            connection,
            includeName,
            manualProgram,
            'include',
          );

          allEnhancementResponses.push(includeEnhancements);
        } catch (error) {
          // The credentials are the same for every include: the call ends.
          if (credentialFailure(error)) throw error;
          includesUnread.push({
            include: includeName,
            step: 'read enhancements',
            failures: (payloadCarriedBy(error)?.failures as
              | FailureEntry[]
              | undefined) ?? [thrownEntry(error, 'read enhancements')],
          });
          // Continue with the other includes
        }
      }

      return { allEnhancementResponses, includesUnread };
    };

    let allEnhancementResponses: EnhancementResponse[];
    let includesUnread: Awaited<
      ReturnType<typeof processNestedIncludes>
    >['includesUnread'];
    try {
      ({ allEnhancementResponses, includesUnread } =
        await processNestedIncludes());
    } catch (error) {
      if (credentialFailure(error)) throw error; // as it came
      logger?.error('Nested enhancement processing failed:', error);
      // Return partial results with just the main object
      const fallbackResult = {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                main_object: {
                  name: objectName,
                  type: mainEnhancementResponse.object_type,
                },
                include_nested: true,
                // A refusal: the method's error as it is, with its step; a
                // throw of our own `client_threw` with the step.
                error: thrownEntry(error, 'list includes'),
                partial_result: true,
                total_objects_analyzed: 1,
                total_enhancements_found:
                  mainEnhancementResponse.enhancements.length,
                objects: [mainEnhancementResponse],
              },
              null,
              2,
            ),
          },
        ],
      };
      return fallbackResult;
    }

    // Create combined response
    let combinedResponse: any = {
      main_object: {
        name: objectName,
        type: mainEnhancementResponse.object_type,
      },
      include_nested: true,
      total_objects_analyzed: allEnhancementResponses.length,
      total_enhancements_found: allEnhancementResponses.reduce(
        (sum, resp) => sum + resp.enhancements.length,
        0,
      ),
      objects: allEnhancementResponses,
      ...(includesUnread.length > 0 ? { includes_unread: includesUnread } : {}),
    };

    // Apply filtering if not detailed
    if (!isDetailed) {
      combinedResponse = filterMinimalEnhancements(combinedResponse);
    } else {
      // Add detailed flag for consistency
      combinedResponse = { ...combinedResponse, detailed: true };
    }

    const result = {
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify(combinedResponse),
        },
      ],
    };
    return result;
  } catch (error) {
    return return_error(error);
  }
}

/** One read of the batched version: a probe, a host's elements, a node structure. */
type EnhancementRead =
  | { kind: 'metadata'; host: 'class' | 'program' | 'include'; name: string }
  | {
      kind: 'elements';
      host: 'class' | 'program' | 'function_group' | 'include';
      name: string;
      program?: string;
    }
  | {
      kind: 'node';
      parentType: AdtTypeCode;
      parentName: string;
      nodeId: string;
    };

const enhancementKey = (read: EnhancementRead): string =>
  read.kind === 'node'
    ? `node:${read.parentType}:${read.parentName}:${read.nodeId}`
    : read.kind === 'elements'
      ? `elements:${read.host}:${read.name}:${read.program ?? ''}`
      : `metadata:${read.host}:${read.name}`;

/** The step a read's failure carries, as the sequential version names it. */
function enhancementStep(read: EnhancementRead): string {
  if (read.kind === 'elements') return 'read enhancements';
  if (read.kind === 'metadata') return `read ${read.host} metadata`;
  return read.nodeId === '000000'
    ? 'read node structure'
    : 'read includes node';
}

/** `read` sent on `connection`, as the sequential version sends it. */
function sendEnhancementRead(
  context: AdtHeadersContext,
  connection: AbapConnection,
  read: EnhancementRead,
): Promise<unknown> {
  const client = createAdtClient(connection, logger);
  const analyse = { analyse: analyseException };
  if (read.kind === 'metadata') {
    if (read.host === 'class')
      return client
        .getClass(classDocuments)
        .readMetadata({ className: read.name }, analyse);
    if (read.host === 'program')
      return client
        .getProgram(programDocuments)
        .readMetadata({ programName: read.name }, analyse);
    return client
      .getInclude(includeDocuments)
      .readMetadata({ includeName: read.name }, analyse);
  }
  if (read.kind === 'elements') {
    switch (read.host) {
      case 'class':
        return client
          .getClass(classDocuments)
          .readEnhancementElements({ className: read.name }, analyse);
      case 'program':
        return client
          .getProgram(programDocuments)
          .readEnhancementElements({ programName: read.name }, analyse);
      case 'function_group':
        return client
          .getFunctionGroup(functionGroupDocuments)
          .readEnhancementElements({ functionGroupName: read.name }, analyse);
      case 'include':
        return client
          .getInclude(includeDocuments)
          .readEnhancementElements(
            { includeName: read.name },
            { context: read.program as string, analyse: analyseException },
          );
    }
  }
  return withAdtHeaders(context, 'utils.fetchNodeStructure', (headers) =>
    client
      .getUtils(ourUtils)
      .fetchNodeStructure(read.parentType, read.parentName, {
        headers,
        analyse: analyseException,
        nodeId: read.nodeId,
        withShortDescriptions: true,
      }),
  );
}

/** A read the walk needs before it can go on: the next phase sends it. */
class Unanswered {
  constructor(readonly read: EnhancementRead) {}
}

/**
 * The answers of the batched version's phases, by read. Each phase sends the
 * reads not answered yet in one envelope (`runPhase`); a credential failure
 * any of them answers — thrown, or SAP's `401` — ends the call: thrown, as
 * the sequential version throws it at that read.
 */
function enhancementAnswers(context: HandlerContext) {
  const answers = new Map<string, PhaseResult<unknown>>();
  return {
    /** The answer to `read`; `Unanswered` thrown when no phase sent it yet. */
    answered(read: EnhancementRead): PhaseResult<unknown> {
      const result = answers.get(enhancementKey(read));
      if (result === undefined) throw new Unanswered(read);
      return result;
    },
    async phase(reads: readonly EnhancementRead[]): Promise<void> {
      const asked = new Map<string, EnhancementRead>();
      for (const read of reads) {
        const key = enhancementKey(read);
        if (!answers.has(key)) asked.set(key, read);
      }
      if (asked.size === 0) return;
      const pending = [...asked.values()];
      const results = await runPhase(context, pending, (read, connection) =>
        sendEnhancementRead(context, connection as AbapConnection, read),
      );
      results.forEach((result, i) => {
        const read = pending[i] as EnhancementRead;
        if (!result.ok) {
          if (endsTheCall(result.error)) throw result.error;
        } else {
          const response = result.value as IAdtResponse<unknown, IAdtError>;
          const step = enhancementStep(read);
          if (
            response?.ok === false &&
            isCredentialPayload(failureEntry(response.getError(), step))
          ) {
            const error = response.getError();
            throw carryingFailure(
              read.kind === 'elements'
                ? new EnhancementInputError(error.message)
                : new Error(error.message),
              error,
              step,
            );
          }
        }
        answers.set(enhancementKey(read), result);
      });
    },
  };
}

type EnhancementAnswers = ReturnType<typeof enhancementAnswers>;

/** A resolved object: what kind it is, and the read of its elements. */
interface EnhancementPath {
  type: 'program' | 'include' | 'class' | 'function_group';
  elements: EnhancementRead;
  context?: string;
  unreadable?: FailureEntry[];
}

/**
 * `determineObjectTypeAndPath` over the phases' answers: the same decision,
 * the same refusals collected, the same throws. A probe no phase sent yet
 * is thrown as `Unanswered`: the next phase sends it, one probe per object.
 */
function pathFromAnswers(
  answers: EnhancementAnswers,
  objectName: string,
  manualProgramContext?: string,
  requestedType?: string,
): EnhancementPath {
  const name = objectName.toUpperCase();
  const kind = (requestedType ?? '').trim().toUpperCase();
  const classPath = {
    type: 'class' as const,
    elements: { kind: 'elements', host: 'class', name } as EnhancementRead,
  };
  const programPath = {
    type: 'program' as const,
    elements: { kind: 'elements', host: 'program', name } as EnhancementRead,
  };
  const groupPath = (group: string) => ({
    type: 'function_group' as const,
    elements: {
      kind: 'elements',
      host: 'function_group',
      name: group,
    } as EnhancementRead,
  });
  const saplGroup =
    name.startsWith('SAPL') && name.length > 4 ? name.slice(4) : undefined;

  const unreadable: FailureEntry[] = [];
  const withReport = <T extends { type: string }>(path: T) =>
    unreadable.length > 0 ? { ...path, unreadable } : path;
  const probe = (step: string, read: EnhancementRead): string | undefined => {
    const result = answers.answered(read);
    try {
      if (!result.ok) throw result.error;
      const answer = result.value as IAdtResponse<unknown, IAdtError>;
      if (answer.ok) return String(answer.getResult().value ?? '');
      const error = answer.getError();
      if (isCredentialPayload(failureEntry(error, step)))
        throw carryingFailure(new Error(error.message), error, step);
      if (error?.response?.status !== 404)
        unreadable.push(failureEntry(error, step));
      return undefined;
    } catch (error) {
      if (isCredentialPayload(thrownEntry(error, step))) throw error;
      unreadable.push(thrownEntry(error, step));
      return undefined;
    }
  };
  const unresolved = (message: string): never => {
    const words = new EnhancementInputError(message);
    throw unreadable.length > 0
      ? carryingPayload(words, { failures: unreadable })
      : words;
  };
  const asInclude = () => {
    const metadata = probe('read include metadata', {
      kind: 'metadata',
      host: 'include',
      name,
    });
    if (metadata === undefined) return undefined;
    let context: string | undefined;
    let mainProgram: string | undefined;
    if (manualProgramContext) {
      context = `/sap/bc/adt/programs/programs/${manualProgramContext}`;
      mainProgram = manualProgramContext;
    } else {
      context = metadata.match(
        /include:contextRef[^>]+adtcore:uri="([^"]+)"/,
      )?.[1];
      mainProgram = context ? mainProgramOf(context) : undefined;
    }
    if (!context || !mainProgram) {
      throw new EnhancementInputError(
        `Could not determine parent program context for include: ${objectName}. No contextRef found in metadata. Consider providing the 'program' parameter manually.`,
      );
    }
    return {
      type: 'include' as const,
      elements: {
        kind: 'elements',
        host: 'include',
        name,
        program: mainProgram,
      } as EnhancementRead,
      context,
    };
  };

  if (spelledAs(kind, HOST_SPELLINGS.class)) {
    return withReport(classPath);
  }
  if (spelledAs(kind, HOST_SPELLINGS.group)) {
    return groupPath(saplGroup ?? name);
  }
  if (spelledAs(kind, HOST_SPELLINGS.program)) {
    return withReport(saplGroup ? groupPath(saplGroup) : programPath);
  }
  if (spelledAs(kind, HOST_SPELLINGS.include)) {
    const include = asInclude();
    if (include) return withReport(include);
    return unresolved(`Include ${objectName} could not be read.`);
  }
  if (saplGroup) return withReport(groupPath(saplGroup));
  if (
    probe('read class metadata', { kind: 'metadata', host: 'class', name }) !==
    undefined
  ) {
    return withReport(classPath);
  }
  if (
    probe('read program metadata', {
      kind: 'metadata',
      host: 'program',
      name,
    }) !== undefined
  ) {
    return withReport(programPath);
  }
  const include = asInclude();
  if (include) return withReport(include);
  return unresolved(
    `Could not determine object type for: ${objectName}. Object is neither a valid class, program, include, nor a function group's main program.`,
  );
}

/** A path resolved, or the throw resolving it came to. */
type Resolved =
  | { ok: true; path: EnhancementPath }
  | { ok: false; error: unknown };

/**
 * Every object's path, probe by probe: each phase sends the next probe of
 * every object still unresolved (class, then program, then include — each
 * only when the earlier answered none), one per object.
 */
async function resolvePaths(
  answers: EnhancementAnswers,
  objects: ReadonlyArray<{ name: string; type?: string }>,
  manualProgramContext?: string,
): Promise<Resolved[]> {
  const resolved: Array<Resolved | undefined> = objects.map(() => undefined);
  for (;;) {
    const next: EnhancementRead[] = [];
    objects.forEach((o, i) => {
      if (resolved[i] !== undefined) return;
      try {
        resolved[i] = {
          ok: true,
          path: pathFromAnswers(answers, o.name, manualProgramContext, o.type),
        };
      } catch (error) {
        if (error instanceof Unanswered) next.push(error.read);
        else resolved[i] = { ok: false, error };
      }
    });
    if (next.length === 0) return resolved as Resolved[];
    await answers.phase(next);
  }
}

/** The node structure an object's includes are listed under: parent type and name. */
function includesParentOf(
  objectName: string,
  objectType: EnhancementPath['type'],
): { parentType: AdtTypeCode; parentName: string } {
  const upper = objectName.toUpperCase();
  const isGroup =
    objectType === 'function_group' ||
    (upper.startsWith('SAPL') && upper.length > 4);
  return {
    parentName: isGroup && upper.startsWith('SAPL') ? upper.slice(4) : upper,
    parentType: isGroup ? 'FUGR/F' : 'PROG/P',
  };
}

/** The includes node's read, once the root node structure answered one. */
function includesNodeRead(
  answers: EnhancementAnswers,
  objectName: string,
  objectType: EnhancementPath['type'],
): EnhancementRead | undefined {
  if (objectType === 'class') return undefined;
  const parent = includesParentOf(objectName, objectType);
  let root: PhaseResult<unknown>;
  try {
    root = answers.answered({ kind: 'node', ...parent, nodeId: '000000' });
  } catch {
    return undefined;
  }
  if (!root.ok) return undefined;
  const response = root.value as IAdtResponse<NodeLevelLike, IAdtError>;
  if (!response.ok) return undefined;
  const node = response
    .getResult()
    .value.childNodes.find((info) => /\/I$/.test(info.type));
  return node === undefined
    ? undefined
    : { kind: 'node', ...parent, nodeId: node.nodeId };
}

/** The part of a node structure level the includes walk reads. */
interface NodeLevelLike {
  objects: Array<{ name: string }>;
  childNodes: Array<{ type: string; nodeId: string }>;
}

/** `getIncludesListInternal` over the phases' answers: the same names, the same throws. */
function includesFromAnswers(
  context: HandlerContext,
  answers: EnhancementAnswers,
  objectName: string,
  objectType: EnhancementPath['type'],
): string[] {
  const { logger } = context;
  try {
    if (objectType === 'class') {
      logger?.info(
        `Classes don't have includes. Returning empty list for class '${objectName}'`,
      );
      return [];
    }
    const parent = includesParentOf(objectName, objectType);
    if (objectType === 'include') {
      logger?.warn(
        `Include processing: assuming parent program for include ${objectName}`,
      );
    }
    const settled = (read: EnhancementRead) => {
      const result = answers.answered(read);
      if (!result.ok) throw result.error;
      return result.value as IAdtResponse<NodeLevelLike, IAdtError>;
    };
    const rootResponse = settled({ kind: 'node', ...parent, nodeId: '000000' });
    if (!rootResponse.ok) {
      throw carryingFailure(
        new Error(rootResponse.getError().message),
        rootResponse.getError(),
        'read node structure',
      );
    }
    const includesNode = includesNodeRead(answers, objectName, objectType);
    if (includesNode === undefined) {
      logger?.info(`No includes node found for ${objectType} '${objectName}'`);
      return [];
    }
    const includesResponse = settled(includesNode);
    if (!includesResponse.ok) {
      throw carryingFailure(
        new Error(includesResponse.getError().message),
        includesResponse.getError(),
        'read includes node',
      );
    }
    const includeNames = [
      ...new Set(includesResponse.getResult().value.objects.map((o) => o.name)),
    ];
    logger?.info(
      `Found ${includeNames.length} includes for ${objectType} '${objectName}' using SAP ADT API`,
    );
    return includeNames;
  } catch (error) {
    if (methodFailureOf(error) !== undefined || failureOf(error) !== undefined)
      throw error;
    logger?.error(
      `Failed to get includes list for ${objectType} '${objectName}':`,
      error,
    );
    return [];
  }
}

/** `getEnhancementsForSingleObject` over a resolved path and the phases' answers. */
function responseFromAnswers(
  answers: EnhancementAnswers,
  objectName: string,
  resolved: Resolved,
): EnhancementResponse {
  if (!resolved.ok) throw resolved.error;
  const objectInfo = resolved.path;
  const step = 'read enhancements';
  const result = answers.answered(objectInfo.elements);
  if (!result.ok) {
    const thrown = result.error;
    if (
      failureOf(thrown) !== undefined ||
      methodFailureOf(thrown) !== undefined
    )
      throw thrown;
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    throw new EnhancementInputError(
      `Failed to retrieve enhancements for ${objectName}: ${message}`,
    );
  }
  const answer = result.value as IAdtResponse<unknown, IAdtError>;
  if (!answer.ok) {
    const error = answer.getError();
    throw carryingFailure(
      new EnhancementInputError(error.message),
      error,
      step,
    );
  }
  const enhancements = parseEnhancementsFromXml(
    String(answer.getResult().value ?? ''),
  );
  return {
    object_name: objectName,
    object_type: objectInfo.type,
    context: objectInfo.context,
    enhancements: enhancements,
    ...(objectInfo.unreadable ? { unreadable: objectInfo.unreadable } : {}),
  };
}

/** The call's options every object is read with. */
interface EnhancementOptions {
  manualProgram?: string;
  includeNested: boolean;
  isDetailed: boolean;
  maxIncludes: number;
}

function enhancementOptionsOf(args: any): EnhancementOptions {
  return {
    manualProgram: args.program,
    includeNested: args.include_nested === true,
    isDetailed: args.detailed === true,
    maxIncludes: args.max_includes ? parseInt(args.max_includes, 10) : 50,
  };
}

const answerText = (payload: unknown) => ({
  isError: false,
  content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
});

/**
 * One object's answer from the phases' answers — the sequential version's
 * assembly: the same response, the same nested objects and `includes_unread`,
 * the same partial result, the same failure answer.
 */
function enhancementsAnswerFrom(
  context: HandlerContext,
  answers: EnhancementAnswers,
  objectName: string,
  resolved: Resolved,
  includes: string[] | { thrown: unknown } | undefined,
  includePaths: Map<string, Resolved>,
  options: EnhancementOptions,
): McpResult {
  const { logger } = context;
  try {
    const mainEnhancementResponse = responseFromAnswers(
      answers,
      objectName,
      resolved,
    );
    if (!options.includeNested) {
      let response: any = mainEnhancementResponse;
      if (!options.isDetailed) {
        response = filterMinimalEnhancements(response);
      } else {
        response = { ...response, detailed: true };
      }
      return answerText(response);
    }
    let allEnhancementResponses: EnhancementResponse[];
    const includesUnread: Array<{
      include: string;
      step: 'read enhancements';
      failures: FailureEntry[];
    }> = [];
    try {
      if (includes === undefined || !Array.isArray(includes)) {
        throw (includes as { thrown: unknown } | undefined)?.thrown;
      }
      allEnhancementResponses = [mainEnhancementResponse];
      for (const includeName of includes) {
        try {
          allEnhancementResponses.push(
            responseFromAnswers(
              answers,
              includeName,
              includePaths.get(includeName) as Resolved,
            ),
          );
        } catch (error) {
          if (credentialFailure(error)) throw error;
          includesUnread.push({
            include: includeName,
            step: 'read enhancements',
            failures: (payloadCarriedBy(error)?.failures as
              | FailureEntry[]
              | undefined) ?? [thrownEntry(error, 'read enhancements')],
          });
        }
      }
    } catch (error) {
      if (credentialFailure(error)) throw error;
      logger?.error('Nested enhancement processing failed:', error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                main_object: {
                  name: objectName,
                  type: mainEnhancementResponse.object_type,
                },
                include_nested: true,
                error: thrownEntry(error, 'list includes'),
                partial_result: true,
                total_objects_analyzed: 1,
                total_enhancements_found:
                  mainEnhancementResponse.enhancements.length,
                objects: [mainEnhancementResponse],
              },
              null,
              2,
            ),
          },
        ],
      } as McpResult;
    }
    let combinedResponse: any = {
      main_object: {
        name: objectName,
        type: mainEnhancementResponse.object_type,
      },
      include_nested: true,
      total_objects_analyzed: allEnhancementResponses.length,
      total_enhancements_found: allEnhancementResponses.reduce(
        (sum, resp) => sum + resp.enhancements.length,
        0,
      ),
      objects: allEnhancementResponses,
      ...(includesUnread.length > 0 ? { includes_unread: includesUnread } : {}),
    };
    if (!options.isDetailed) {
      combinedResponse = filterMinimalEnhancements(combinedResponse);
    } else {
      combinedResponse = { ...combinedResponse, detailed: true };
    }
    return answerText(combinedResponse);
  } catch (error) {
    return return_error(error) as McpResult;
  }
}

/**
 * Every object's enhancements in ADT batch envelopes (spec §11): (1) the
 * type probes, one per phase for every object still unresolved; (2) every
 * object's enhancements, with `include_nested` beside its root node
 * structure; (3) the includes node of every object that lists one; (4) the
 * metadata of every include, up to `max_includes` per object; (5) the
 * enhancements of every include resolved. Each answer is then the
 * sequential version's assembly over these answers. A credential failure
 * ends the call: thrown.
 */
async function enhancementsInPhases(
  context: HandlerContext,
  objects: ReadonlyArray<{ name: string; type?: string }>,
  options: EnhancementOptions,
): Promise<McpResult[]> {
  const answers = enhancementAnswers(context);
  const paths = await resolvePaths(answers, objects, options.manualProgram);
  const second: EnhancementRead[] = [];
  objects.forEach((o, i) => {
    const resolved = paths[i] as Resolved;
    if (!resolved.ok) return;
    second.push(resolved.path.elements);
    if (options.includeNested && resolved.path.type !== 'class') {
      second.push({
        kind: 'node',
        ...includesParentOf(o.name, resolved.path.type),
        nodeId: '000000',
      });
    }
  });
  await answers.phase(second);

  const includes: Array<string[] | { thrown: unknown } | undefined> =
    objects.map(() => undefined);
  const includePaths = new Map<string, Resolved>();
  if (options.includeNested) {
    // Only an object whose enhancements answered goes on to its includes,
    // as in the sequential version.
    const answeredMain = objects.map((o, i) => {
      try {
        responseFromAnswers(answers, o.name, paths[i] as Resolved);
        return true;
      } catch {
        return false;
      }
    });
    const third: EnhancementRead[] = [];
    objects.forEach((o, i) => {
      const resolved = paths[i] as Resolved;
      if (!resolved.ok || !answeredMain[i]) return;
      const node = includesNodeRead(answers, o.name, resolved.path.type);
      if (node !== undefined) third.push(node);
    });
    await answers.phase(third);
    const names = new Set<string>();
    objects.forEach((o, i) => {
      const resolved = paths[i] as Resolved;
      if (!resolved.ok || !answeredMain[i]) return;
      try {
        let list = includesFromAnswers(
          context,
          answers,
          o.name,
          resolved.path.type,
        );
        if (list.length > options.maxIncludes) {
          list = list.slice(0, options.maxIncludes);
        }
        includes[i] = list;
        for (const name of list) names.add(name);
      } catch (thrown) {
        includes[i] = { thrown };
      }
    });
    const asked = [...names];
    const resolvedIncludes = await resolvePaths(
      answers,
      asked.map((name) => ({ name, type: 'include' })),
      options.manualProgram,
    );
    asked.forEach((name, i) => {
      includePaths.set(name, resolvedIncludes[i] as Resolved);
    });
    await answers.phase(
      resolvedIncludes.flatMap((r) => (r.ok ? [r.path.elements] : [])),
    );
  }
  return objects.map((o, i) =>
    enhancementsAnswerFrom(
      context,
      answers,
      o.name,
      paths[i] as Resolved,
      includes[i],
      includePaths,
      options,
    ),
  );
}

/** The hosts whose call is one request: the elements, read directly. */
const ONE_REQUEST_HOSTS: readonly HostSpelling[] = [
  HOST_SPELLINGS.class,
  HOST_SPELLINGS.group,
  HOST_SPELLINGS.program,
];

/** An answer's payload: its JSON, else its text. */
function payloadOfAnswer(result: McpResult): unknown {
  const text = result.content[0]?.text ?? '';
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Whether an answer is a credential failure: it ends a call for several objects. */
function endsList(result: McpResult): boolean {
  const failed = failedPayloadOf(result, 'read enhancements');
  return failed !== undefined && isCredentialPayload(failed);
}

/** A list call's answer: one entry per object, in the order asked. */
function listAnswer(
  objects: ReadonlyArray<{ object_name: unknown; object_type: unknown }>,
  results: readonly McpResult[],
): McpResult {
  const entries = results.map((result, i) => {
    const asked = objects[i] as (typeof objects)[number];
    return result.isError
      ? {
          object_name: asked.object_name,
          object_type: asked.object_type,
          error: payloadOfAnswer(result),
        }
      : payloadOfAnswer(result);
  });
  return {
    isError: false,
    content: [{ type: 'text', text: JSON.stringify(entries) }],
  };
}

export async function handleGetEnhancements(
  context: HandlerContext,
  args: any,
) {
  const listed = args?.objects;
  try {
    if (listed === undefined) {
      if (!args?.object_name) return await enhancementsOf(context, args);
      const options = enhancementOptionsOf(args);
      const kind = String(args.object_type ?? '')
        .trim()
        .toUpperCase();
      // The elements of an object named by its type: one request.
      if (
        !options.includeNested &&
        ONE_REQUEST_HOSTS.some((host) => spelledAs(kind, host))
      ) {
        return await enhancementsOf(context, args);
      }
      return await withSequentialFallback<McpResult>(
        context,
        async () =>
          (
            await enhancementsInPhases(
              context,
              [{ name: args.object_name, type: args.object_type }],
              options,
            )
          )[0] as McpResult,
        () => enhancementsOf(context, args) as Promise<McpResult>,
      );
    }
    if (
      args.object_name !== undefined ||
      args.object_type !== undefined ||
      !Array.isArray(listed) ||
      listed.length === 0
    ) {
      return return_error(
        'Give exactly one of object_name and object_type, or objects (a non-empty list of { object_name, object_type })',
      );
    }
    const objects = listed.map((o: any) => ({
      object_name: o?.object_name,
      object_type: o?.object_type,
    }));
    const single = (o: (typeof objects)[number]) => {
      const { objects: _list, ...rest } = args;
      return { ...rest, ...o };
    };
    const options = enhancementOptionsOf(args);
    return await withSequentialFallback<McpResult>(
      context,
      async () => {
        const read = objects.filter((o) => Boolean(o.object_name));
        const answered = await enhancementsInPhases(
          context,
          read.map((o) => ({ name: o.object_name, type: o.object_type })),
          options,
        );
        const results: McpResult[] = [];
        let at = 0;
        for (const o of objects) {
          results.push(
            o.object_name
              ? (answered[at++] as McpResult)
              : ((await enhancementsOf(context, single(o))) as McpResult),
          );
        }
        return listAnswer(objects, results);
      },
      async () => {
        // One object after another, each as the single call reads it; a
        // credential failure ends the call, and nothing after it is read.
        const results: McpResult[] = [];
        for (const o of objects) {
          const result = (await enhancementsOf(
            context,
            single(o),
          )) as McpResult;
          if (endsList(result)) return result;
          results.push(result);
        }
        return listAnswer(objects, results);
      },
    );
  } catch (error) {
    return return_error(error);
  }
}
