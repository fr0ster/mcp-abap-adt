import * as z from 'zod';
import { failureEntry, isCredentialPayload } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { readEnhancementSpotMetadata } from '../../../lib/strategies/metadataReads';
import {
  attributeOf,
  firstAttribute,
  firstAttributeOn,
  membersNamed,
  parseStructure,
} from '../../../lib/strategies/reading';
import { carryingFailure } from '../../../lib/strategies/step';
import { logger, return_error } from '../../../lib/utils';
import { enhancementTypeOf, notThroughAdt } from './enhancementAvailability';

export const TOOL_DEFINITION = {
  name: 'GetEnhancementSpot',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Retrieve metadata and list of implementations for a specific enhancement spot, at its active version.',
  inputSchema: z.object({
    enhancement_spot: z.string().describe('Name of the enhancement spot'),
  }),
} as const;

/**
 * Interface for enhancement spot response
 */
export interface EnhancementSpotResponse {
  enhancement_spot: string;
  metadata: EnhancementSpotMetadata;
}

/** What the spot's document names: each member only when the document has it. */
export interface EnhancementSpotMetadata {
  name?: string;
  description?: string;
  type?: string;
  status?: string;
  package?: string;
  interface?: string;
  badi_definitions?: Array<{
    name: string | undefined;
    shorttext: string | undefined;
    interface: string | undefined;
  }>;
  links?: Array<{
    href: string | undefined;
    rel: string | undefined;
    type: string | undefined;
    title: string | undefined;
  }>;
}

/**
 * Parses enhancement spot XML to extract metadata and function (implementation) descriptions.
 * @param xmlData - Raw XML response from ADT
 * @returns Metadata object with description, type, status, and functions (implementations)
 */
function parseEnhancementSpotMetadata(
  xmlData: string,
): EnhancementSpotMetadata {
  const metadata: EnhancementSpotMetadata = {};
  try {
    const document = parseStructure(xmlData);
    // Spot name, description, type: the first element that states each — the
    // spot's own root; its package off its package reference.
    const name = firstAttribute(document, 'adtcore:name');
    if (name) metadata.name = name;
    const description = firstAttribute(document, 'adtcore:description');
    if (description) metadata.description = description;
    const type = firstAttribute(document, 'adtcore:type');
    if (type) metadata.type = type;
    const pkg = firstAttributeOn(
      document,
      'adtcore:packageRef',
      'adtcore:name',
    );
    if (pkg) metadata.package = pkg;

    // Interface reference
    const iface = firstAttributeOn(document, 'enhs:interface', 'adtcore:name');
    if (iface) metadata.interface = iface;

    // BAdI definitions
    const badiDefs = membersNamed(document, 'enhs:badiDefinition').map(
      ({ node }) => ({
        name: attributeOf(node, 'enhs:name'),
        shorttext: attributeOf(node, 'enhs:shorttext'),
        interface: firstAttributeOn(node, 'enhs:interface', 'adtcore:name'),
      }),
    );
    if (badiDefs.length > 0) metadata.badi_definitions = badiDefs;

    // All atom:link rels
    const links = membersNamed(document, 'atom:link').map(({ node }) => ({
      href: attributeOf(node, 'href'),
      rel: attributeOf(node, 'rel'),
      type: attributeOf(node, 'type'),
      title: attributeOf(node, 'title'),
    }));
    if (links.length > 0) metadata.links = links;

    logger?.info(`Parsed structured metadata for enhancement spot:`, metadata);
    return metadata;
  } catch (parseError) {
    logger?.error('Failed to parse enhancement spot XML metadata:', parseError);
    return {};
  }
}

/**
 * Handler to retrieve metadata for a specific BAdI enhancement spot (ENHS/XSB)
 * in an ABAP system, through adt-clients' `getEnhancement().readMetadata`,
 * regardless of whether it has any implementations. It is designed to provide
 * information about the spot's existence, description, type, and status.
 *
 * @param args - Tool arguments containing:
 *   - enhancement_spot: Name of the enhancement spot (e.g., 'SADT_REST_RFC_APPLICATION'). This is a required parameter.
 * @returns Response object containing:
 *   - enhancement_spot: The name of the queried enhancement spot.
 *   - metadata: An object with properties like description, type, and status of the enhancement spot.
 *   - raw_xml: The raw XML response from the ADT API for debugging purposes.
 *   - In case of error, an error object with details about the failure.
 */
export async function handleGetEnhancementSpot(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const { connection, logger } = context;
  try {
    logger?.info('handleGetEnhancementSpot called with args:', args);

    if (!args?.enhancement_spot) {
      return return_error('Enhancement spot is required');
    }

    const enhancementSpot = args.enhancement_spot;

    logger?.info(`Getting metadata for enhancement spot: ${enhancementSpot}`);

    // adt-clients' BAdI spot (`enhsxsb`), with its own media type, read with
    // the strategy every other read uses.
    const step = 'read enhancement spot';
    const answer = await readEnhancementSpotMetadata(
      createAdtClient(connection, logger),
      {
        enhancementName: enhancementSpot,
      },
      'active',
    );

    if (answer.ok) {
      const document = String(answer.getResult().value ?? '');
      if (!document) {
        return return_error(
          `Failed to retrieve metadata for enhancement spot ${enhancementSpot}: SAP answered no document.`,
        );
      }
      // Parse the XML to extract metadata
      const metadata = parseEnhancementSpotMetadata(document);

      const enhancementSpotResponse: EnhancementSpotResponse = {
        enhancement_spot: enhancementSpot,
        metadata: metadata,
      };

      return {
        isError: false,
        content: [
          {
            type: 'json',
            json: enhancementSpotResponse,
          },
        ],
      };
    }

    const error = answer.getError();
    // A credential failure ends the call as it came; anything else may be a
    // plain spot, which `enhsxsb` does not serve — its own collection answers
    // `500 I::000` too — so say what it is rather than pass that on. Any other
    // failure is the method's error as it is, with the step.
    if (!isCredentialPayload(failureEntry(error, step))) {
      const type = await enhancementTypeOf(
        connection,
        String(enhancementSpot),
        'ENHS/XSB',
      );
      const why = type
        ? notThroughAdt(String(enhancementSpot), type)
        : undefined;
      if (why) return return_error(why);
    }
    return return_error(carryingFailure(new Error(error.message), error, step));
  } catch (error) {
    // A throw — no answer of the method's to read: as it came.
    return return_error(error);
  }
}
