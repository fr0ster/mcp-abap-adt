import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { AbapConnection } from '@mcp-abap-adt/connection';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import {
  type FailureEntry,
  failureEntry,
  isCredentialFailure,
  isCredentialPayload,
  thrownEntry,
} from '../../../lib/answer';
import { failureOf } from '../../../lib/auth/failures';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
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

export const TOOL_DEFINITION = {
  name: 'GetEnhancements',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Retrieve a list of enhancements for a given ABAP object.',
  inputSchema: {
    type: 'object',
    properties: {
      object_name: {
        type: 'string',
        description: 'Name of the ABAP object',
      },
      object_type: {
        type: 'string',
        description: '[read-only] Type of the ABAP object',
      },
    },
    required: ['object_name', 'object_type'],
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
      client.getClass().readEnhancementElements({ className: name }, analyse),
  };
  const programPath = {
    type: 'program' as const,
    readElements: () =>
      client
        .getProgram()
        .readEnhancementElements({ programName: name }, analyse),
  };
  const groupPath = (group: string) => ({
    type: 'function_group' as const,
    readElements: () =>
      client
        .getFunctionGroup()
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
        .getInclude()
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
          .getInclude()
          .readEnhancementElements(
            { includeName: name },
            { context: program, analyse: analyseException },
          ),
      context,
    };
  };

  // The type the caller named, taken at its word.
  if (kind === 'CLASS' || kind === 'CLAS' || kind === 'CLAS/OC') {
    return withReport(classPath);
  }
  if (
    kind === 'FUNCTION_GROUP' ||
    kind === 'FUNCTIONGROUP' ||
    kind === 'FUGR' ||
    kind === 'FUGR/F'
  ) {
    return groupPath(saplGroup ?? name);
  }
  if (kind === 'PROGRAM' || kind === 'PROG' || kind === 'PROG/P') {
    return withReport(saplGroup ? groupPath(saplGroup) : programPath);
  }
  if (kind === 'INCLUDE' || kind === 'PROG/I') {
    const include = await asInclude();
    if (include) return withReport(include);
    return unresolved(`Include ${objectName} could not be read.`);
  }

  // No usable type: find out, one independent probe at a time.
  if (saplGroup) return withReport(groupPath(saplGroup));
  if (
    (await probe('read class metadata', () =>
      client
        .getClass()
        .readMetadata({ className: name }, { analyse: analyseException }),
    )) !== undefined
  ) {
    return withReport(classPath);
  }
  if (
    (await probe('read program metadata', () =>
      client
        .getProgram()
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
    const parentType = isGroup ? 'FUGR/F' : 'PROG/P';

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
    const rootResponse = await utils.fetchNodeStructure(
      parentType,
      parentName,
      {
        analyse: analyseException,
        nodeId: '000000', // Root node
        withShortDescriptions: true,
      },
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
    const includesResponse = await utils.fetchNodeStructure(
      parentType,
      parentName,
      {
        analyse: analyseException,
        nodeId: includesNode.nodeId,
        withShortDescriptions: true,
      },
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
export async function handleGetEnhancements(
  context: HandlerContext,
  args: any,
) {
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
