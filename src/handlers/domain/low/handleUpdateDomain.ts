import {
  domainDocuments,
  patchDomainDocument,
} from '@mcp-abap-adt/adt-clients';
import * as z from 'zod';
/**
 * UpdateDomain Handler - Update ABAP Domain Properties
 *
 * Read, patch, write. adt-clients 19 removed the merge that used to happen
 * inside `updateDomain`: the member takes the whole document now and replaces
 * with it, so anything not sent is gone. The sequence is the handler's, and
 * every step of it carries its own `analyse` — the verdict on each answer stays
 * the strategy's.
 *
 * **The patched document goes in `options.source`.** There used to be two
 * channels and a trap between them: `config.document` for an XML metadata
 * body, `options.sourceCode` for ABAP text, and an `options.xmlContent` the
 * options type declared while no member read it — a document put there issued
 * a PUT with `data: undefined` against a replace-semantics endpoint and
 * answered whatever status came back as success. `interfaces-adt@9` merged the
 * channels into one `options.source` (decision 33) and took `document` off
 * `IDomainConfig`, so the old shape no longer compiles.
 * `AdtDomain.updateMetadata()` reads `options?.source` and passes it straight
 * to `updateDomain(connection, {...}, source, options?.lockHandle)` as the PUT
 * body; the fields beside it in the config describe a create, and on an update
 * nothing merges them into a document because nothing is read to merge them
 * into. Verified against `AdtDomain.ts` and `core/domain/update.ts` in
 * adt-clients 22.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import {
  answerFailure,
  answerThrown,
  messageCarriedBy,
} from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  clearableText,
  givenCount,
  givenElements,
  givenFlag,
  givenText,
} from '../../../lib/propertyBag';
import {
  type DomainChanges,
  domainChanges,
} from '../../../lib/strategies/documentChanges';
import { patchedDocument } from '../../../lib/strategies/documentPatch';
import { sequence } from '../../../lib/strategies/sequence';
import { atStep } from '../../../lib/strategies/step';
import { return_error, return_response } from '../../../lib/utils';
import { child } from '../../../lib/xml/tree';

export const TOOL_DEFINITION = {
  name: 'UpdateDomainLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Update properties of an existing ABAP domain. Requires lock handle from LockObject. - use UpdateDomain (high-level) for full workflow with lock/unlock/activate.',
  inputSchema: z.object({
    domain_name: z.string().describe('Domain name. Domain must already exist.'),
    properties: z
      .unknown()
      .describe(
        'Domain properties object. Can include: description, datatype, length, decimals, conversion_exit, lowercase, sign_exists, value_table, fixed_values, etc.',
      ),
    lock_handle: z
      .string()
      .describe('Lock handle from LockObject. Required for update operation.'),
  }),
} as const;

/** The tool's arguments, as its schema parses them. */
type UpdateDomainArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/**
 * The changes `properties` names, each as the patch writes it: text, a
 * length or a count a number (or its digits), a flag a boolean (or `true` /
 * `false`), `null`
 * clearing the conversion exit and the value table, the fixed values a list
 * (each `low` and `text` written out); a value of no such kind is left out.
 */
function domainChangesOf(properties: unknown): DomainChanges {
  const fixedValues = givenElements(properties, 'fixed_values');
  return {
    description: givenText(properties, 'description'),
    datatype: givenText(properties, 'datatype'),
    length: givenCount(properties, 'length'),
    decimals: givenCount(properties, 'decimals'),
    conversion_exit: clearableText(properties, 'conversion_exit'),
    sign_exists: givenFlag(properties, 'sign_exists'),
    lowercase: givenFlag(properties, 'lowercase'),
    value_table: clearableText(properties, 'value_table'),
    fixed_values: fixedValues?.map((fixed) => ({
      low: String(child(fixed, 'low')),
      text: String(child(fixed, 'text')),
    })),
  };
}

/**
 * Main handler for UpdateDomain MCP tool
 *
 * Uses AdtClient.updateDomain - low-level single method call
 */
export async function handleUpdateDomain(
  context: HandlerContext,
  args: UpdateDomainArgs,
) {
  const { connection, logger } = context;
  try {
    const { domain_name, properties, lock_handle } = args;

    // Validation
    if (!domain_name || !properties || !lock_handle) {
      return return_error(
        new Error('domain_name, properties, and lock_handle are required'),
      );
    }

    const client = createAdtClient(connection, logger);

    const domainName = domain_name.toUpperCase();

    logger?.info(`Starting domain update: ${domainName}`);

    // `properties` always took both spellings, the same fallback
    // `UpdateDataElementLow`'s own `transportRequest` reads out of its
    // `properties` bag.
    const transportRequest =
      givenText(properties, 'transport_request') ||
      givenText(properties, 'transportRequest');

    try {
      // The three steps, in the handler because 19 put them there. `analyse` on
      // each one: a refusal from the read and a refusal from the write are
      // different failures, and whichever comes back is the one the caller
      // sees, built by the strategy rather than summarised here.
      const written = await sequence(
        atStep('read metadata', () =>
          client
            .getDomain(domainDocuments)
            .readMetadata(
              { domainName },
              { version: 'workingArea', analyse: analyseException },
            ),
        ),
        async (current) =>
          patchedDocument(
            patchDomainDocument(
              current,
              domainChanges(domainChangesOf(properties)),
            ),
            `domain ${domainName}`,
          ),
        atStep('update metadata', (document) =>
          withAdtHeaders(context, 'domain.updateMetadata', (headers) =>
            client.getDomain(domainDocuments).updateMetadata(
              {
                domainName,
                transportRequest,
              },
              {
                headers,
                source: document,
                lockHandle: lock_handle,
                analyse: analyseException,
              },
            ),
          ),
        ),
      );

      if (!written.ok) {
        const failure = written.getError();
        logger?.error(`UpdateDomain refused: ${failure.message}`);
        // The method's error as it is, with the step it arose at.
        return answerFailure(failure, {
          tool: 'UpdateDomainLow',
          detail: 'terse',
        });
      }

      logger?.info(`✅ UpdateDomain completed: ${domainName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            domain_name: domainName,
            message: `Domain ${domainName} updated successfully. Remember to unlock using UnlockObject.`,
          },
          null,
          2,
        ),
      });
    } catch (error) {
      // `sequence()`'s two calls each carry their own `analyse` and never
      // throw for a refusal — `written.ok`/`written.getError()` above is
      // where that verdict is read. This catch is left for a genuine bug in
      // this block, not for a wire refusal, so it no longer guesses an HTTP
      // status or re-parses an `exc` namespace `exception` element out of a body no v19 call here
      // can still produce — that read belongs to `analyseException`, not a
      // second opinion here (found while writing the handler invariant that
      // checks for exactly this).
      const message = messageCarriedBy(error);
      logger?.error(`Error updating domain ${domainName}: ${message}`);
      return answerThrown(error, { tool: 'UpdateDomainLow', detail: 'terse' });
    }
  } catch (error) {
    return return_error(error);
  }
}
