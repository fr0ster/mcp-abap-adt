/**
 * CreateDomain Handler - ABAP Domain Creation via ADT API
 *
 * Uses AdtClient.getDomain().{validate,create,lock,readMetadata,
 * updateMetadata,unlock,check,activate} from @mcp-abap-adt/adt-clients 19.
 *
 * A lifecycle, not one call: validate the name, create the bare object, lock
 * it, read-patch-write the properties the caller gave (through `withLock`,
 * released on every path out), wait for the write to be visible, check the
 * inactive version, and optionally activate. The lock wraps only the
 * read-modify-write in the middle — `create` and `check` are their own
 * requests outside it, matching the order the pre-migration handler ran
 * them in: `unlock` then the wait then `check`, not the other way round —
 * `check` is the first call after the write that reads it back, so it is
 * the one the wait has to sit ahead of. The pre-migration handler's own
 * wait was `read({withLongPolling: true})`; domain exposes no plain `read`
 * in adt-clients 19 (only `readMetadata`), so the wait here is
 * `readMetadata({withLongPolling: true})`, discarded for its result but not
 * for what it does — this repository's own `xmlPatch.ts` documents the live
 * incident behind it: a read of a not-yet-ready object answers 200 with an
 * empty body, never a 404.
 *
 * **`config.packageName` never reaches the wire on `updateMetadata`.** The
 * shipped `updateDomain()` wire function (`core/domain/update.js`) builds
 * its URL and PUT from `args.domain_name`, `args.transport_request` and
 * `document` only — `args.package_name` is passed in but never read. Not
 * sent (the create call above still carries it, where it is read).
 */

import { domainDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { patchDomainXml } from '../../../lib/strategies/domainPatch';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { sequence } from '../../../lib/strategies/sequence';
import { withLock } from '../../../lib/strategies/withLock';
import { extractXmlString } from '../../../lib/strategies/xmlPatch';
import { return_error } from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation';

export const TOOL_DEFINITION = {
  name: 'CreateDomain',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Create. Subject: Domain. Will be useful for creating domain. Create a new ABAP domain in SAP system. Creates the domain object in initial state.',
  inputSchema: {
    type: 'object',
    properties: {
      domain_name: {
        type: 'string',
        description:
          'Domain name (e.g., ZZ_TEST_0001). Must follow SAP naming conventions.',
      },
      description: {
        type: 'string',
        description:
          '(optional) Domain description. If not provided, domain_name will be used.',
      },
      package_name: {
        type: 'string',
        description:
          '(optional) Package name (e.g., ZOK_LOCAL, $TMP for local objects)',
      },
      transport_request: {
        type: 'string',
        description:
          '(optional) Transport request number (e.g., E19K905635). Required for transportable packages.',
      },
      datatype: {
        type: 'string',
        description:
          '(optional) Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.',
        default: 'CHAR',
      },
      length: {
        type: 'number',
        description: '(optional) Field length (max depends on datatype)',
        default: 100,
      },
      decimals: {
        type: 'number',
        description: '(optional) Decimal places (for DEC, CURR, QUAN types)',
        default: 0,
      },
      conversion_exit: {
        type: 'string',
        description:
          '(optional) Conversion exit routine name (without CONVERSION_EXIT_ prefix)',
      },
      lowercase: {
        type: 'boolean',
        description: '(optional) Allow lowercase input',
        default: false,
      },
      sign_exists: {
        type: 'boolean',
        description: '(optional) Field has sign (+/-)',
        default: false,
      },
      value_table: {
        type: 'string',
        description: '(optional) Value table name for foreign key relationship',
      },
      activate: {
        type: 'boolean',
        description:
          '(optional) Activate domain after creation (default: true)',
        default: true,
      },
      fixed_values: {
        type: 'array',
        description: '(optional) Array of fixed values for domain value range',
        items: {
          type: 'object',
          properties: {
            low: {
              type: 'string',
              description: "Fixed value (e.g., '001', 'A')",
            },
            text: {
              type: 'string',
              description: 'Description text for the fixed value',
            },
          },
          required: ['low', 'text'],
        },
      },
      master_language: {
        type: 'string',
        description:
          'Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['domain_name'],
  },
} as const;

interface DomainArgs {
  domain_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  datatype?: string;
  length?: number;
  decimals?: number;
  conversion_exit?: string;
  lowercase?: boolean;
  sign_exists?: boolean;
  value_table?: string;
  activate?: boolean;
  fixed_values?: Array<{ low: string; text: string }>;
  super_package?: string;
  master_language?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateDomain(
  context: HandlerContext,
  args: DomainArgs,
) {
  const { connection, logger } = context;

  if (!args?.domain_name) {
    return return_error('Domain name is required');
  }
  if (!args?.package_name) {
    return return_error('Package name is required');
  }

  validateTransportRequest(
    args.package_name,
    args.transport_request,
    args.super_package,
  );

  const domainName = args.domain_name.toUpperCase();
  const shouldActivate = args.activate !== false;
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateDomain', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getDomain(
        resultsFor(domainDocuments),
      );

      const checked = await sequence(
        () =>
          obj.validate(
            {
              domainName,
              description: args.description || domainName,
              packageName: args.package_name,
            },
            { analyse: analyseException },
          ),
        () =>
          obj.create(
            {
              domainName,
              description: args.description || domainName,
              packageName: args.package_name,
              transportRequest: args.transport_request,
              masterLanguage: args.master_language,
            },
            { analyse: analyseException },
          ),
        () =>
          withLock(
            () => obj.lock({ domainName }),
            (
              lockHandle,
            ): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> =>
              sequence(
                () =>
                  obj.readMetadata(
                    { domainName },
                    { analyse: analyseException },
                  ),
                (current) =>
                  obj.updateMetadata(
                    {
                      domainName,
                      transportRequest: args.transport_request,
                      document: patchDomainXml(
                        extractXmlString(current.raw, `domain ${domainName}`),
                        {
                          description: args.description || domainName,
                          datatype: args.datatype || 'CHAR',
                          length: args.length || 100,
                          decimals: args.decimals || 0,
                          conversion_exit: args.conversion_exit,
                          lowercase: args.lowercase || false,
                          sign_exists: args.sign_exists || false,
                          value_table: args.value_table,
                          fixed_values: args.fixed_values,
                        },
                      ),
                    },
                    { lockHandle, analyse: analyseException },
                  ),
              ),
            (lockHandle) => obj.unlock({ domainName }, lockHandle),
          ),
        // Best-effort: wait for the write to be visible, right before the
        // first call that reads it back — this is the call most likely to
        // meet a not-yet-ready object (see `xmlPatch.ts`), so the wait sits
        // immediately ahead of it, exactly where the pre-migration handler
        // put it (between `unlock` and `check`).
        async () => {
          await obj
            .readMetadata(
              { domainName },
              { withLongPolling: true, analyse: analyseException },
            )
            .catch(() => undefined);
          return obj.check({ domainName }, undefined, {
            analyse: analyseException,
          });
        },
      );

      if (!checked.ok || !shouldActivate) {
        return checked as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      return obj.activate({ domainName }, { analyse: analyseActivation });
    },
    project(detail, terseWrite),
  );
}
