import type { AbapConnection } from '@mcp-abap-adt/connection';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { ourUtils } from '../../../lib/strategies/resultSets';
import {
  encodeSapObjectName,
  logger,
  makeAdtRequestWithTimeout,
  return_error,
} from '../../../lib/utils';

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
  object_type: 'program' | 'include' | 'class';
  context?: string;
  enhancements: EnhancementImplementation[];
  detailed?: boolean;
  total_enhancements?: number;
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
 * Determines if an object is a program, include, or class and returns appropriate URL path
 * @param objectName - Name of the object
 * @param manualProgramContext - Optional manual program context for includes
 * @returns Object with type, basePath, and context (if needed)
 */
async function determineObjectTypeAndPath(
  connection: AbapConnection,
  objectName: string,
  manualProgramContext?: string,
): Promise<{
  type: 'program' | 'include' | 'class';
  basePath: string;
  context?: string;
}> {
  try {
    // First try as a class
    const classUrl = `/sap/bc/adt/oo/classes/${encodeSapObjectName(objectName)}`;
    try {
      const response = await makeAdtRequestWithTimeout(
        connection,
        classUrl,
        'GET',
        'csrf',
        {
          Accept: 'application/vnd.sap.adt.oo.classes.v4+xml',
        },
      );

      if (response.status === 200) {
        logger?.info(`${objectName} is a class`);
        return {
          type: 'class',
          basePath: `/sap/bc/adt/oo/classes/${encodeSapObjectName(objectName)}/source/main/enhancements/elements`,
        };
      }
    } catch (_classError) {
      // If class request fails, try as program
      logger?.info(`${objectName} is not a class, trying as program...`);
    }

    // Try as a program
    const programUrl = `/sap/bc/adt/programs/programs/${encodeSapObjectName(objectName)}`;
    try {
      const response = await makeAdtRequestWithTimeout(
        connection,
        programUrl,
        'GET',
        'csrf',
        {
          Accept: 'application/vnd.sap.adt.programs.v3+xml',
        },
      );

      if (response.status === 200) {
        logger?.info(`${objectName} is a program`);
        return {
          type: 'program',
          basePath: `/sap/bc/adt/programs/programs/${encodeSapObjectName(objectName)}/source/main/enhancements/elements`,
        };
      }
    } catch (_programError) {
      // If program request fails, try as include
      logger?.info(`${objectName} is not a program, trying as include...`);
    }

    // Try as include
    const includeUrl = `/sap/bc/adt/programs/includes/${encodeSapObjectName(objectName)}`;
    const response = await makeAdtRequestWithTimeout(
      connection,
      includeUrl,
      'GET',
      'csrf',
      {
        Accept: 'application/vnd.sap.adt.programs.includes.v2+xml',
      },
    );

    if (response.status === 200) {
      logger?.info(`${objectName} is an include`);

      let context: string;

      // Use manual program context if provided
      if (manualProgramContext) {
        context = `/sap/bc/adt/programs/programs/${manualProgramContext}`;
        logger?.info(
          `Using manual program context for include ${objectName}: ${context}`,
        );
      } else {
        // Auto-determine context from metadata
        const xmlData = response.data;
        const contextMatch = xmlData.match(
          /include:contextRef[^>]+adtcore:uri="([^"]+)"/,
        );

        if (contextMatch?.[1]) {
          context = contextMatch[1];
          logger?.info(
            `Found auto-determined context for include ${objectName}: ${context}`,
          );
        } else {
          throw new EnhancementInputError(
            `Could not determine parent program context for include: ${objectName}. No contextRef found in metadata. Consider providing the 'program' parameter manually.`,
          );
        }
      }

      return {
        type: 'include',
        basePath: `/sap/bc/adt/programs/includes/${encodeSapObjectName(objectName)}/source/main/enhancements/elements`,
        context: context,
      };
    }

    throw new EnhancementInputError(
      `Could not determine object type for: ${objectName}. Object is neither a valid class, program, nor include.`,
    );
  } catch (error) {
    if (error instanceof EnhancementInputError) {
      throw error;
    }
    logger?.error(`Failed to determine object type for ${objectName}:`, error);
    throw new EnhancementInputError(
      `Failed to determine object type for: ${objectName}. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
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
  objectType: 'program' | 'include' | 'class',
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

    // For includes, we need to determine the parent program
    const parentName = objectName.toUpperCase();
    const parentType = 'PROG/P';

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

    // Step 1: Get root node structure to find the includes node (with timeout)
    const rootResponse = await Promise.race([
      utils.fetchNodeStructure(parentType, parentName, {
        nodeId: '000000', // Root node
        withShortDescriptions: true,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Timeout: Failed to get root node structure for ${objectName} within 10000ms`,
              ),
            ),
          10000,
        ),
      ),
    ]);

    if (!rootResponse.ok) {
      logger?.warn(
        `Refused while fetching root node structure for ${objectName}`,
      );
      return [];
    }

    // Step 2: Find the includes (PROG/I) node id among the type folders.
    const includesNode = rootResponse
      .getResult()
      .value.childNodes.find((info) => info.type === 'PROG/I');

    if (!includesNode) {
      logger?.info(`No includes node found for ${objectType} '${objectName}'`);
      return [];
    }

    // Step 3: Get includes list using the found node ID (with timeout)
    const includesResponse = await Promise.race([
      utils.fetchNodeStructure(parentType, parentName, {
        nodeId: includesNode.nodeId,
        withShortDescriptions: true,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Timeout: Failed to get includes list for ${objectName} within 10000ms`,
              ),
            ),
          10000,
        ),
      ),
    ]);

    if (!includesResponse.ok) {
      logger?.warn(`Refused while fetching includes list for ${objectName}`);
      return [];
    }

    // Step 4: Names of the objects under that node — de-duplicated, matching
    // the pre-migration parser's `[...new Set(...)]`.
    const includeNames = [
      ...new Set(
        includesResponse
          .getResult()
          .value.objects.filter((o) => o.type === 'PROG/I')
          .map((o) => o.name),
      ),
    ];

    logger?.info(
      `Found ${includeNames.length} includes for ${objectType} '${objectName}' using SAP ADT API`,
    );
    return includeNames;
  } catch (error) {
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
  );

  // Build URL based on object type
  let url = objectInfo.basePath;

  // Add context parameter only for includes
  if (objectInfo.type === 'include' && objectInfo.context) {
    url += `?context=${encodeURIComponent(objectInfo.context)}`;
    logger?.info(`Using context for include: ${objectInfo.context}`);
  }

  logger?.info(`Final enhancement URL: ${url}`);

  const response = await makeAdtRequestWithTimeout(
    connection,
    url,
    'GET',
    'default',
  );

  if (response.status === 200 && response.data) {
    // Parse the XML to extract enhancement implementations
    const enhancements = parseEnhancementsFromXml(response.data);

    const enhancementResponse: EnhancementResponse = {
      object_name: objectName,
      object_type: objectInfo.type,
      context: objectInfo.context,
      enhancements: enhancements,
    };

    return enhancementResponse;
  } else {
    throw new EnhancementInputError(
      `Failed to retrieve enhancements for ${objectName}. Status: ${response.status}`,
    );
  }
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
 *   - timeout: Optional timeout in milliseconds for each ADT request (default: 30000ms = 30s)
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

    // Simple timeout logic: one timeout for all ADT requests
    const requestTimeout = args.timeout ? parseInt(args.timeout, 10) : 30000; // Timeout for each ADT request (default: 30s)
    const maxIncludes = args.max_includes
      ? parseInt(args.max_includes, 10)
      : 50; // Maximum number of includes to process

    logger?.info(`Getting enhancements for object: ${objectName}`, {
      manualProgram: manualProgram || '(not provided)',
      includeNested: includeNested,
      requestTimeout: requestTimeout,
      maxIncludes: maxIncludes,
    });

    // Get enhancements for the main object
    const mainEnhancementResponse = await getEnhancementsForSingleObject(
      connection,
      objectName,
      manualProgram,
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

      // Limit the number of includes to process to avoid timeout
      if (includesList.length > maxIncludes) {
        logger?.warn(
          `Too many includes found (${includesList.length}). Limiting to first ${maxIncludes} includes to avoid timeout.`,
        );
        includesList = includesList.slice(0, maxIncludes);
      }

      // Collect all enhancement responses
      const allEnhancementResponses: EnhancementResponse[] = [
        mainEnhancementResponse,
      ];

      // Simple sequential processing with individual timeouts
      for (const includeName of includesList) {
        try {
          logger?.info(`Getting enhancements for include: ${includeName}`);

          // Create a promise with individual timeout for each include
          const includeEnhancementsPromise = getEnhancementsForSingleObject(
            connection,
            includeName,
            manualProgram,
          );

          const includeEnhancements = await createPromiseWithTimeout(
            includeEnhancementsPromise,
            requestTimeout,
            `Timeout: Failed to get enhancements for include ${includeName} within ${requestTimeout}ms`,
          );

          allEnhancementResponses.push(includeEnhancements);
        } catch (error) {
          logger?.warn(
            `Failed to get enhancements for include ${includeName}:`,
            error,
          );
          // Continue with other includes even if one fails
        }
      }

      return allEnhancementResponses;
    };

    // Execute nested processing without total timeout - each request has its own timeout
    let allEnhancementResponses: EnhancementResponse[];
    try {
      allEnhancementResponses = await processNestedIncludes();
    } catch (error) {
      logger?.error(
        'Nested enhancement processing failed or timed out:',
        error,
      );
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
                error: error instanceof Error ? error.message : String(error),
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

/**
 * Creates a promise with timeout that properly cleans up the timeout when the promise resolves
 * @param promise - The promise to wrap with timeout
 * @param timeoutMs - Timeout in milliseconds
 * @param errorMessage - Error message to use when timeout occurs
 * @returns Promise that resolves with the original promise result or rejects with timeout error
 */
function createPromiseWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string,
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  return Promise.race([
    promise
      .then((result) => {
        // Clear timeout when main promise resolves successfully
        clearTimeout(timeoutId);
        return result;
      })
      .catch((error) => {
        // Clear timeout when main promise rejects
        clearTimeout(timeoutId);
        throw error;
      }),
    timeoutPromise,
  ]);
}
