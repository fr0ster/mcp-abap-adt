/**
 * The URL that opens a published service binding's preview in a browser.
 *
 * **Why a tool.** Nothing in a binding's payload carries it. ADT's Preview button
 * builds the URL itself from repository facts, and the path segment it puts after
 * `feap/` is not a token the server issued — it is a `##`-joined descriptor of the
 * service, shifted by 20 and percent-encoded (see `feapDescriptor.ts`, whose fixture
 * is a URL Eclipse produced, re-encoded byte for byte). So the URL can be assembled
 * from reads, and until now every tier of this server could read the binding and
 * still not answer "where do I look at it".
 *
 * **What it reads, and why each one.** The binding says the service, its version and
 * the protocol — and NOT the entity sets, which are the `expose … as <alias>`
 * aliases in the service definition. The navigation segment is an association or
 * composition of the exposed root view, so the view's source is read only when a
 * navigation is wanted and none was given.
 *
 * **What the descriptor's segments are actually worth.** Measured against the FEAP
 * endpoint's own `manifest.json` (trial, OData V2, 2026-09-29) by asking for one
 * descriptor after another: the server reads the SERVICE and the ENTITY SET and
 * derives the rest. An empty, bogus or plain wrong navigation segment all answered
 * the same nested page — `"navigationProperty": "to_children", "entitySet":
 * "Child"` — and an empty annotation-service segment still answered
 * `TechnicalName='…_VAN'`. Only a bogus entity set changed the answer, to a list
 * report with no page under it. The segments are still filled, because that is the
 * shape Eclipse produces and a later release may begin to read them.
 *
 * **What it refuses to invent.** The entity set, then — the one segment that decides
 * what opens. When it cannot be resolved the answer carries the service URLs, the
 * entity sets to choose from and what is missing, rather than a URL built on a guess
 * that would look exactly like a working one. A Web API binding has no preview at
 * all, and says so instead of carrying a FEAP URL that opens nothing.
 */
import {
  ddlDocuments,
  getSystemInformation,
  serviceDefinitionDocuments,
  serviceDocuments,
} from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  annotationServiceOf,
  type FeapDescriptor,
  type FeapV4Descriptor,
  feapDescriptor,
  feapPreviewUrl,
  feapV4Descriptor,
} from '../../../lib/strategies/feapDescriptor';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { sequence, succeededWith } from '../../../lib/strategies/sequence';
import {
  associationsOf,
  categoryServiceUrlsOf,
  exposedEntitiesOf,
  serviceBindingFactsOf,
} from '../../../lib/strategies/serviceBindingFacts';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetServiceBindingPreviewUrl',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Build the browser URL that previews a published service binding, and the service and $metadata URLs beside it. Answers: "open the service in a browser", "preview this service binding", "what is the OData URL of this binding". Reads the binding for the service, version and protocol, and the service definition for the entity sets; the preview URL needs an entity set, and says what is missing rather than guessing. A Web API binding has no preview page and answers the service URLs instead.',
  inputSchema: {
    type: 'object',
    properties: {
      service_binding_name: {
        type: 'string',
        description: 'Service binding name.',
      },
      entity_set: {
        type: 'string',
        description:
          'Entity set to open. Omitted, the first one the service definition exposes is used.',
      },
      navigation: {
        type: 'string',
        description:
          'Association or composition to follow. Omitted, the first one of the exposed root view is used.',
      },
      target_entity_set: {
        type: 'string',
        description:
          'Entity set the navigation reaches. Omitted, the second exposed entity set is used.',
      },
      client: {
        type: 'string',
        description:
          'Client for the sap-client parameter. Omitted, the client the system reports is used; an empty string leaves the parameter out.',
      },
      language: {
        type: 'string',
        description:
          'Logon language for the preview. Omitted, the language the system reports is used.',
      },
    },
    required: ['service_binding_name'],
  },
} as const;

export async function handleGetServiceBindingPreviewUrl(
  context: HandlerContext,
  args: {
    service_binding_name: string;
    entity_set?: string;
    navigation?: string;
    target_entity_set?: string;
    client?: string;
    language?: string;
  },
) {
  const { connection, logger } = context;
  const { service_binding_name } = args;
  if (!service_binding_name)
    return return_error(new Error('service_binding_name is required'));

  const bindingName = service_binding_name.trim().toUpperCase();
  const adt = createAdtClient(connection, logger);
  const binding = adt.getServiceBinding(resultsFor(serviceDocuments));
  const definition = adt.getServiceDefinition(
    resultsFor(serviceDefinitionDocuments),
  );
  const baseUrl = (await connection.getBaseUrl()).replace(/\/+$/, '');

  // `client` and `language` are what the preview URL carries and what a caller
  // has no way to know. ADT answers both from `systeminformation`, which this
  // server already reads for a request's system context, so they are not the
  // caller's to supply — asked for only when one was left out.
  //
  // A failure here is not this tool's failure: the URL is answerable without a
  // client, and `getSystemInformation` answers `null` where the endpoint is
  // absent but THROWS on anything else. So it is caught, reported in the answer
  // beside the URL it shaped, and never allowed to fail a read that worked.
  // An explicit empty string suppresses the parameter.
  let systemClient: string | undefined;
  let systemLanguage: string | undefined;
  let systemLookupFailed: string | undefined;
  if (args.client === undefined || args.language === undefined) {
    try {
      const info = await getSystemInformation(connection);
      systemClient = info?.client;
      systemLanguage = info?.language;
    } catch (error) {
      systemLookupFailed =
        error instanceof Error ? error.message : String(error);
    }
  }
  const client = args.client ?? systemClient;
  const language = args.language ?? systemLanguage;

  interface Found {
    facts: ReturnType<typeof serviceBindingFactsOf>;
    exposed: ReturnType<typeof exposedEntitiesOf>;
    associations: string[];
    category: ReturnType<typeof categoryServiceUrlsOf>;
  }

  return answer(
    { tool: 'GetServiceBindingPreviewUrl', detail: 'terse' },
    () =>
      sequence(
        () =>
          binding.read({ bindingName }, undefined, {
            analyse: analyseException,
          }),
        async (
          bindingSource: AdtReading<string>,
        ): Promise<IAdtResponse<Found, IAdtError>> => {
          const facts = serviceBindingFactsOf(bindingSource.raw);
          if (!facts.serviceDefinition) {
            // A binding with no definition names nothing to expose; the answer
            // says so through `missing` rather than failing the read that worked.
            return succeededWith<Found>({
              facts,
              exposed: [],
              associations: [],
              category: {},
            });
          }

          const srvd = await definition.read(
            { serviceDefinitionName: facts.serviceDefinition },
            'active',
            { analyse: analyseException },
          );
          if (!srvd.ok)
            return srvd as unknown as IAdtResponse<Found, IAdtError>;
          const exposed = exposedEntitiesOf(
            (srvd.getResult().value as AdtReading<string>).raw,
          );

          // The view is read only when a navigation is needed and none was
          // named: a third request for a segment the caller already knows is
          // waste, and this tool is meant to be cheap enough to call blind.
          let associations: string[] = [];
          if (args.navigation === undefined && exposed.length > 0) {
            const ddl = await adt
              .getDdl(resultsFor(ddlDocuments))
              .read({ ddlName: exposed[0].entity }, 'active', {
                analyse: analyseException,
              });
            if (ddl.ok) {
              associations = associationsOf(
                (ddl.getResult().value as AdtReading<string>).raw,
              );
            }
          }

          // What ADT itself says the service URL is. The Service Binding editor
          // reads this resource to fill its own "Service URL" field, so its answer
          // outranks anything composed from a naming rule — it knows about
          // prefixes and rewrites that a rule cannot. `servicename` and
          // `serviceversion` are required: without them the V4 resource answers
          // `400`. Measured on a trial it comes back EMPTY even for a binding
          // whose service answers `200`, so this only ever adds information; the
          // composed URL remains the answer when it says nothing.
          let category: ReturnType<typeof categoryServiceUrlsOf> = {};
          if (facts.protocol !== undefined && facts.service !== undefined) {
            try {
              const answered = await connection.makeAdtRequest({
                url:
                  `/sap/bc/adt/businessservices/${facts.protocol}/` +
                  `${bindingName}`,
                method: 'GET',
                // The contract requires one; this read is an enrichment, so it
                // gets a short leash rather than the default.
                timeout: 30_000,
                params: {
                  servicename: facts.service,
                  serviceversion: facts.version ?? '0001',
                },
              });
              category = categoryServiceUrlsOf(String(answered.data ?? ''));
            } catch {
              // Absent, refused or shaped otherwise: the composed URL answers.
            }
          }

          return succeededWith<Found>({
            facts,
            exposed,
            associations,
            category,
          });
        },
      ),
    ({ facts, exposed, associations, category }: Found) => {
      const entitySet = args.entity_set ?? exposed[0]?.entitySet;
      const navigation = args.navigation ?? associations[0];
      const target =
        args.target_entity_set ?? exposed[1]?.entitySet ?? entitySet;

      const composedUrl =
        facts.protocol === 'odatav2'
          ? `${baseUrl}/sap/opu/odata/sap/${facts.service ?? bindingName}/`
          : // The second position is the SERVICE, not the service definition.
            // Two systems were needed to see it: on a SAP-delivered binding the
            // service and the definition are both `ZUI_TRAVEL`, so the wrong
            // reading answered `200`; on our own, where the service is the
            // binding's name and the definition is not, the same rule answered
            // `404`. A URL Eclipse produced for it carries the service.
            `${baseUrl}/sap/opu/odata4/sap/${bindingName.toLowerCase()}` +
            `/srvd/sap/${(facts.service ?? bindingName).toLowerCase()}` +
            `/${facts.version ?? '0001'}/`;
      // The system's own answer wins when there is one.
      const serviceUrl =
        category.serviceUrl === undefined
          ? composedUrl
          : category.serviceUrl.startsWith('http')
            ? category.serviceUrl
            : `${baseUrl}${category.serviceUrl}`;

      // A Fiori preview belongs to the UI variant. A Web API binding has no
      // FEAP page at all, so its entity set and navigation are not "missing" —
      // they are not part of any answer, and the service and `$metadata` URLs
      // are how such a binding is addressed. Building a FEAP URL for it would
      // hand back a link that opens nothing.
      // **And only OData V2.** The preview path exists for both protocols —
      // `/businessservices/odatav4/feap` answers `400` bare, exactly as the V2 one
      // does — but no descriptor resolves under it. Measured 2026-09-29 against a
      // PUBLISHED V4 UI binding and against a second, SAP-delivered one that
      // Eclipse previews: every composition tried answered `404` (the service
      // name, the binding name, with and without the `_VAN` segment, the service
      // definition in first and second place, a shortened descriptor), while the
      // V2 path answered `200` for both `flp.html` and `manifest.json` in the same
      // run. A V4 binding has no `_VAN` object either — publication creates a
      // service group (`SCO2`/`SIA6`) and no `IWVB` — so the sixth segment is
      // probably not what V2 puts there.
      //
      // The V2 composition came from a URL Eclipse produced. The V4 one was
      // EXTRAPOLATED from it by swapping the protocol in the path, and that is
      // exactly the mistake this repository has a note about: a capture shows what
      // is sent, not what is required. Until a V4 capture exists, no URL — the
      // service and `$metadata` URLs are answered, and those are measured.
      const previewApplies = facts.category !== 'web_api';

      const missing: string[] = [];
      if (!facts.service) missing.push('service (srvb:services/@srvb:name)');
      if (!facts.protocol)
        missing.push('protocol (srvb:binding/@srvb:version)');
      // Only the entity set. **Measured** against the FEAP endpoint's own
      // `manifest.json` on a trial, OData V2, 2026-09-29: of the six descriptor
      // segments the server reads exactly two — the service and the entity set.
      // A descriptor whose navigation segment was empty, bogus (`BOGUS_NAV`) or
      // the wrong association (`_parent`) answered the same nested page,
      // `"navigationProperty": "to_children", "entitySet": "Child"`, because the
      // server derives the navigation and its target from the service's metadata.
      // An empty annotation-service segment still answered
      // `TechnicalName='ZMCP_PRV_SB_VAN'`. Only a bogus ENTITY SET changed the
      // answer — `ListReport|Nope` with no nested page at all.
      //
      // So refusing a URL for want of a navigation withheld one that works. The
      // segments are still filled, because that is the shape Eclipse produces and
      // a future release may start reading them; none of them gates the answer.
      if (previewApplies && !entitySet) missing.push('entity_set');

      // Two protocols, two documents. V2 names the service and the `_VAN`
      // annotation service; V4 carries the service's URL PATH first and the
      // BINDING last, because that is what its authorisation check reads. Both
      // shapes are decoded from URLs Eclipse produced; see `feapDescriptor.ts`.
      const descriptor: FeapDescriptor | FeapV4Descriptor | undefined =
        !previewApplies ||
        facts.service === undefined ||
        facts.protocol === undefined ||
        entitySet === undefined
          ? undefined
          : facts.protocol === 'odatav4'
            ? {
                servicePath: new URL(serviceUrl).pathname,
                entitySet,
                navigation: navigation ?? '',
                targetEntitySet: target ?? entitySet,
                service: facts.service,
                version: facts.version ?? '0001',
                binding: bindingName,
              }
            : {
                service: facts.service,
                entitySet,
                navigation: navigation ?? '',
                targetEntitySet: target ?? entitySet,
                annotationService: annotationServiceOf(facts.service),
                version: facts.version ?? '0001',
              };

      const notes = [
        facts.published
          ? undefined
          : 'The binding is not published, so neither the service nor the preview answers until it is.',
        facts.category === 'web_api'
          ? 'This is an OData Web API binding, which has no Fiori preview page. ' +
            'The service and $metadata URLs are how it is addressed.'
          : undefined,

        systemLookupFailed === undefined
          ? undefined
          : `The client and language the system reports could not be read (${systemLookupFailed}), so the preview URL carries only what was passed in.`,
      ].filter((one): one is string => one !== undefined);

      return {
        success: true,
        service_binding_name: bindingName,
        published: facts.published,
        protocol: facts.protocol,
        service: facts.service,
        service_definition: facts.serviceDefinition,
        version: facts.version,
        entity_sets: exposed.map((one) => one.entitySet),
        binding_category: facts.category,
        client,
        language,
        associations,
        service_url: serviceUrl,
        service_url_source:
          category.serviceUrl === undefined ? 'composed' : 'system',
        metadata_url: `${serviceUrl}$metadata`,
        annotation_url: category.annotationUrl,
        preview_url:
          descriptor === undefined || facts.protocol === undefined
            ? undefined
            : feapPreviewUrl({
                baseUrl,
                protocol: facts.protocol,
                descriptor,
                client,
                language,
              }),
        preview_descriptor:
          descriptor === undefined
            ? undefined
            : 'servicePath' in descriptor
              ? feapV4Descriptor(descriptor)
              : feapDescriptor(descriptor),
        // Said out loud: a preview URL that quietly guesses a segment is
        // indistinguishable from one that works, until it opens nothing.
        missing: missing.length === 0 ? undefined : missing,
        note: notes.length === 0 ? undefined : notes.join(' '),
      };
    },
  );
}
