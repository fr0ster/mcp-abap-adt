import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  encodeSapObjectName,
  logger,
  makeAdtRequestWithTimeout,
  return_error,
} from '../../../lib/utils';
import { enhancementTypeOf, notThroughAdt } from './enhancementAvailability';

/**
 * Collections whose objects have no `/source/main`, so asking for one is
 * answered before any request. A class enhancement is not exposed by ADT at
 * all; a BAdI implementation has metadata (`enhoxhb/{name}`) but no source —
 * `enhoxhh`, the source code plugin, is the one collection with source.
 */
const NO_SOURCE: Record<string, string> = {
  enhoxh:
    'A class enhancement (ENHO/XH) is not available through ADT — Eclipse opens it in SAP GUI.',
  enhoxhb:
    'A BAdI implementation (ENHO/XHB) has no source: only a source code plugin (enhancement_spot "enhoxhh") does.',
};

/**
 * What to tell a caller whose read failed, once the name's type is known. A
 * source code plugin already asked under `enhoxhh` gets nothing: the
 * collection was right, so the failure itself is the answer.
 */
function explainByType(
  name: string,
  type: string,
  collection: string,
): string | undefined {
  const notExposed = notThroughAdt(name, type);
  if (notExposed) return notExposed;
  if (type === 'ENHO/XHB') return `${name}: ${NO_SOURCE.enhoxhb}`;
  if (type === 'ENHO/XHH' && collection !== 'enhoxhh')
    return `${name} is a source code plugin (ENHO/XHH): read it with enhancement_spot "enhoxhh".`;
  return undefined;
}

export const TOOL_DEFINITION = {
  name: 'GetEnhancementImpl',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Retrieve source code of a specific enhancement implementation by its name and enhancement spot.',
  inputSchema: {
    type: 'object',
    properties: {
      enhancement_spot: {
        type: 'string',
        description: 'Name of the enhancement spot',
      },
      enhancement_name: {
        type: 'string',
        description: '[read-only] Name of the enhancement implementation',
      },
    },
    required: ['enhancement_spot', 'enhancement_name'],
  },
} as const;

/**
 * Interface for enhancement by name response
 */
export interface EnhancementByNameResponse {
  enhancement_spot: string;
  enhancement_name: string;
  source_code: string;
}

/**
 * Parses enhancement source XML to extract the source code
 * @param xmlData - Raw XML response from ADT
 * @returns Decoded source code
 */
function parseEnhancementSourceFromXml(xmlData: string): string {
  try {
    // Look for source code in various possible formats

    // Try to find base64 encoded source in <source> or similar tags
    const base64SourceRegex =
      /<(?:source|enh:source)[^>]*>([^<]*)<\/(?:source|enh:source)>/;
    const base64Match = xmlData.match(base64SourceRegex);

    if (base64Match?.[1]) {
      try {
        // Decode base64 source code
        const decodedSource = Buffer.from(base64Match[1], 'base64').toString(
          'utf-8',
        );
        return decodedSource;
      } catch (decodeError) {
        logger?.warn('Failed to decode base64 source code:', decodeError);
      }
    }

    // Try to find plain text source code
    const textSourceRegex =
      /<(?:source|enh:source)[^>]*>\s*<!\[CDATA\[(.*?)\]\]>\s*<\/(?:source|enh:source)>/s;
    const textMatch = xmlData.match(textSourceRegex);

    if (textMatch?.[1]) {
      return textMatch[1];
    }

    // If no specific source tags found, return the entire XML as fallback
    logger?.warn(
      'Could not find source code in expected format, returning raw XML',
    );
    return xmlData;
  } catch (parseError) {
    logger?.error('Failed to parse enhancement source XML:', parseError);
    return xmlData; // Return raw XML as fallback
  }
}

/**
 * Handler to retrieve a specific enhancement implementation by name in an ABAP system.
 * This function is intended for retrieving the source code of a specific enhancement implementation (requires both spot and implementation name).
 * This function uses the SAP ADT API endpoint to fetch the source code of a specific enhancement
 * implementation within a given enhancement spot. If the implementation is not found, it falls back
 * to retrieving metadata about the enhancement spot itself to provide context about the failure.
 *
 * @param args - Tool arguments containing:
 *   - enhancement_spot: Name of the enhancement spot (e.g., 'enhoxhh'). This is a required parameter.
 *   - enhancement_name: Name of the specific enhancement implementation (e.g., 'zpartner_update_pai'). This is a required parameter.
 * @returns Response object containing:
 *   - If successful: enhancement_spot, enhancement_name, source_code, and raw_xml of the enhancement implementation.
 *   - If implementation not found: enhancement_spot, enhancement_name, status as 'not_found', a message, spot_metadata, and raw_xml of the spot.
 *   - In case of error: an error object with details about the failure.
 */
export async function handleGetEnhancementImpl(
  context: HandlerContext,
  args: any,
) {
  const { connection, logger } = context;
  try {
    logger?.info('handleGetEnhancementByName called with args:', args);

    if (!args?.enhancement_spot) {
      return return_error('Enhancement spot is required');
    }

    if (!args?.enhancement_name) {
      return return_error('Enhancement name is required');
    }

    const enhancementSpot = args.enhancement_spot;
    const enhancementName = args.enhancement_name;

    const noSource = NO_SOURCE[String(enhancementSpot).toLowerCase()];
    if (noSource) return return_error(noSource);

    logger?.info(
      `Getting enhancement: ${enhancementName} from spot: ${enhancementSpot}`,
    );

    // Build the ADT URL for the specific enhancement
    // Format: /sap/bc/adt/enhancements/{enhancement_spot}/{enhancement_name}/source/main
    const url = `/sap/bc/adt/enhancements/${encodeSapObjectName(enhancementSpot)}/${encodeSapObjectName(enhancementName)}/source/main`;

    logger?.info(`Enhancement URL: ${url}`);

    const response = await makeAdtRequestWithTimeout(
      connection,
      url,
      'GET',
      'default',
    );

    if (response.status === 200 && response.data) {
      // Parse the XML to extract source code
      const sourceCode = parseEnhancementSourceFromXml(response.data);

      const enhancementResponse: EnhancementByNameResponse = {
        enhancement_spot: enhancementSpot,
        enhancement_name: enhancementName,
        source_code: sourceCode,
      };

      const result = {
        isError: false,
        content: [
          {
            type: 'json',
            json: enhancementResponse,
          },
        ],
      };
      return result;
    } else {
      logger?.warn(
        `Enhancement ${enhancementName} not found in spot ${enhancementSpot}. Status: ${response.status}. Attempting to retrieve spot metadata as fallback.`,
      );
      // Fallback to retrieve metadata about the enhancement spot
      const spotUrl = `/sap/bc/adt/enhancements/${encodeSapObjectName(enhancementSpot)}`;
      logger?.info(`Fallback enhancement spot URL: ${spotUrl}`);

      const spotResponse = await makeAdtRequestWithTimeout(
        connection,
        spotUrl,
        'GET',
        'default',
        {
          Accept: 'application/vnd.sap.adt.enhancements.v1+xml',
        },
      );

      if (spotResponse.status === 200 && spotResponse.data) {
        // Parse metadata if possible
        const metadata: { description?: string } = {};
        const descriptionMatch = spotResponse.data.match(
          /<adtcore:description>([^<]*)<\/adtcore:description>/,
        );
        if (descriptionMatch?.[1]) {
          metadata.description = descriptionMatch[1];
        }

        const fallbackResult = {
          isError: false,
          content: [
            {
              type: 'json',
              json: {
                enhancement_spot: enhancementSpot,
                enhancement_name: enhancementName,
                status: 'not_found',
                message: `Enhancement implementation ${enhancementName} not found in spot ${enhancementSpot}.`,
                spot_metadata: metadata,
              },
            },
          ],
        };
        return fallbackResult;
      } else {
        return return_error(
          `Failed to retrieve enhancement ${enhancementName} from spot ${enhancementSpot}. Status: ${response.status}. Fallback to retrieve spot metadata also failed. Status: ${spotResponse.status}`,
        );
      }
    }
  } catch (error) {
    // The read failed: if the name says what it is, say why — a type ADT does
    // not expose, a BAdI implementation with no source, a source code plugin
    // asked under a spot name. Anything else is reported as it came.
    if (args?.enhancement_name) {
      const name = String(args.enhancement_name);
      const type = await enhancementTypeOf(connection, name, 'ENHO');
      const collection = String(args.enhancement_spot ?? '').toLowerCase();
      const why = type ? explainByType(name, type, collection) : undefined;
      if (why) return return_error(why);
    }
    return return_error(error);
  }
}
