import { enhancementDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { failureEntry, isCredentialPayload } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { carryingFailure } from '../../../lib/strategies/step';
import { logger, return_error } from '../../../lib/utils';
import { enhancementTypeOf, notThroughAdt } from './enhancementAvailability';

/**
 * Collections whose objects have no `/source/main`, so asking for one is
 * answered before any request. A class enhancement is not exposed by ADT at
 * all; a BAdI implementation (`enhoxhb`) and a BAdI spot (`enhsxsb`) have
 * metadata but no source — `enhoxhh`, the source code plugin, is the one
 * subtype with source (adt-clients' `EnhancementType`).
 */
const NO_SOURCE: Record<string, string> = {
  enhoxh:
    'A class enhancement (ENHO/XH) is not available through ADT — Eclipse opens it in SAP GUI.',
  enhoxhb:
    'A BAdI implementation (ENHO/XHB) has no source: only a source code plugin (enhancement_spot "enhoxhh") does.',
  enhsxsb:
    'A BAdI enhancement spot (ENHS/XSB) has no source: read it with GetEnhancementSpot.',
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
 * The source of a source code plugin (ENHO/XHH) is read through adt-clients'
 * `getEnhancement().read`; ADT answers a missing object with 200 and no body,
 * which is answered `not_found`.
 *
 * @param args - Tool arguments containing:
 *   - enhancement_spot: The enhancement collection — 'enhoxhh' for a source code plugin. This is a required parameter.
 *   - enhancement_name: Name of the specific enhancement implementation (e.g., 'zpartner_update_pai'). This is a required parameter.
 * @returns Response object containing:
 *   - If successful: enhancement_spot, enhancement_name, source_code.
 *   - If SAP answered no source: enhancement_spot, enhancement_name, status as 'not_found' and a message.
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

    const collection = String(enhancementSpot).toLowerCase();
    const name = String(enhancementName);
    /** What the name's type says about this read, after the search. */
    const explained = async () => {
      const type = await enhancementTypeOf(connection, name, 'ENHO/XHH');
      return type ? explainByType(name, type, collection) : undefined;
    };

    // Only a source code plugin has source; any other collection name is no
    // ADT enhancement collection at all — say what the name is, if known.
    if (collection !== 'enhoxhh') {
      const why = await explained();
      return return_error(
        why ??
          `"${enhancementSpot}" is not an enhancement collection with source: a source code plugin (ENHO/XHH) is read with enhancement_spot "enhoxhh".`,
      );
    }

    // adt-clients' source code plugin read, with the strategy every other
    // read uses.
    const step = 'read enhancement source';
    const answer = await createAdtClient(connection, logger)
      .getEnhancement(enhancementDocuments)
      .read({ enhancementName: name, enhancementType: 'enhoxhh' }, 'active', {
        analyse: analyseException,
      });

    if (answer.ok) {
      const body = String(answer.getResult().value ?? '');
      if (!body) {
        return {
          isError: false,
          content: [
            {
              type: 'json',
              json: {
                enhancement_spot: enhancementSpot,
                enhancement_name: enhancementName,
                status: 'not_found',
                message: `Enhancement implementation ${enhancementName} not found in spot ${enhancementSpot}.`,
              },
            },
          ],
        };
      }
      // Parse the answer to extract source code
      const sourceCode = parseEnhancementSourceFromXml(body);

      const enhancementResponse: EnhancementByNameResponse = {
        enhancement_spot: enhancementSpot,
        enhancement_name: enhancementName,
        source_code: sourceCode,
      };

      return {
        isError: false,
        content: [
          {
            type: 'json',
            json: enhancementResponse,
          },
        ],
      };
    }

    // The read failed: if the name says what it is, say why — a type ADT does
    // not expose, a BAdI implementation with no source. A credential failure
    // ends the call as it came; anything else is the method's error as it is,
    // with the step.
    const error = answer.getError();
    if (!isCredentialPayload(failureEntry(error, step))) {
      const why = await explained();
      if (why) return return_error(why);
    }
    return return_error(carryingFailure(new Error(error.message), error, step));
  } catch (error) {
    // A throw — no answer of the method's to read: as it came.
    return return_error(error);
  }
}
