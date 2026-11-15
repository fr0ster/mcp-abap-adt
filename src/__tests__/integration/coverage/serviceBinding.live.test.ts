/**
 * Service bindings, live, on both systems.
 *
 * - The validations of a new binding (`ValidateServiceBinding`,
 *   `HandlerServiceBindingValidate`) and the binding types
 *   (`ListServiceBindingTypes`, `HandlerServiceBindingListTypes`) read only:
 *   a name nobody created, in the package the coverage suites create in.
 * - A binding of the case's own: a service definition exposing a shared
 *   projection (read only), and an OData V4 UI binding on it, each name read
 *   free first and recorded for cleanup before its create. The case reads the
 *   binding's metadata and source (`GetServiceBinding`), publishes it
 *   (`UpdateServiceBinding`) and builds its preview URL
 *   (`GetServiceBindingPreviewUrl`). The cleanup unpublishes it (`unpublish`,
 *   asked again on a refusal), deletes both and reads them absent.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, it } from 'node:test';
import {
  deleteRecorded,
  expectAbsent,
  expectNameFree,
  liveCall,
  livePrepare,
  liveSuite,
  recordCreated,
} from '../helpers/live';
import {
  member,
  onRequest,
  ownPackage,
  payloadOf,
  succeeded,
} from './ownObjects';

const SUFFIX = randomBytes(2).toString('hex').toUpperCase();
const SERVICE = `ZMCP_SBD_${SUFFIX}`;
const BINDING = `ZMCP_SBB_${SUFFIX}`;
/** A binding name nobody creates: the validations are of a new binding. */
const NEW_BINDING = `ZMCP_SBN_${SUFFIX}`;

/** Whether the case left the binding published. */
const state = { published: false };

/** The pause between two unpublish asks, and how long the cleanup asks. */
const UNPUBLISH_PAUSE_MS = 30_000;
const UNPUBLISH_LIMIT_MS = 10 * 60_000;

/**
 * The cleanup's unpublish, asked again on a refusal: SAP's unpublish job on
 * the cloud system fails for minutes after a publish (measured 2026-11-15:
 * it failed for at least 90 s, then succeeded minutes later). At the limit
 * the cleanup fails, naming SAP's words and the two objects left over (and
 * the leftovers report names them: their records stay).
 */
async function unpublish(): Promise<void> {
  const started = Date.now();
  for (;;) {
    const answered = await livePrepare('UpdateServiceBinding', {
      service_binding_name: BINDING,
      desired_publication_state: 'unpublished',
      service_name: SERVICE,
    });
    if (!answered.isError) {
      state.published = false;
      return;
    }
    const waited = Date.now() - started;
    if (waited >= UNPUBLISH_LIMIT_MS) {
      throw new Error(
        `the binding ${BINDING} stays published after ${Math.round(waited / 1000)} s of unpublish attempts; ${BINDING} and ${SERVICE} are left over: ${answered.text}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, UNPUBLISH_PAUSE_MS));
  }
}

liveSuite(['onprem', 'cloud'], 'Service bindings', () => {
  after(async () => {
    if (state.published) await unpublish();
    await deleteRecorded();
    await expectAbsent({
      tool: 'GetServiceBinding',
      args: { service_binding_name: BINDING },
    });
    await expectAbsent({
      tool: 'GetServiceDefinition',
      args: { service_definition_name: SERVICE },
    });
  });

  it('ValidateServiceBinding and HandlerServiceBindingValidate validate a new binding', async () => {
    const full = await liveCall('ValidateServiceBinding', {
      service_binding_name: NEW_BINDING,
      service_definition_name: SERVICE,
      package_name: ownPackage(),
      description: 'MCP service binding live case',
    });
    succeeded('ValidateServiceBinding', full);
    const compact = await liveCall('HandlerServiceBindingValidate', {
      service_binding_name: NEW_BINDING,
      service_definition_name: SERVICE,
      package_name: ownPackage(),
      description: 'MCP service binding live case',
    });
    succeeded('HandlerServiceBindingValidate', compact);
  });

  it('ListServiceBindingTypes and HandlerServiceBindingListTypes list the OData V4 types', async () => {
    const full = await liveCall('ListServiceBindingTypes', {
      response_format: 'json',
    });
    assert.ok(succeeded('ListServiceBindingTypes', full).text.includes('V4'));
    const compact = await liveCall('HandlerServiceBindingListTypes', {
      response_format: 'json',
    });
    assert.ok(
      succeeded('HandlerServiceBindingListTypes', compact).text.includes('V4'),
    );
  });

  it('GetServiceBinding reads its metadata and source, UpdateServiceBinding publishes it, GetServiceBindingPreviewUrl builds its URL', async () => {
    await expectNameFree({
      tool: 'GetServiceDefinition',
      args: { service_definition_name: SERVICE },
    });
    recordCreated('DeleteServiceDefinition', {
      service_definition_name: SERVICE,
      ...onRequest(),
    });
    succeeded(
      'CreateServiceDefinition',
      await livePrepare('CreateServiceDefinition', {
        service_definition_name: SERVICE,
        description: 'MCP service binding live case',
        package_name: ownPackage(),
        source_code: [
          "@EndUserText.label: 'MCP service binding live case'",
          `define service ${SERVICE} {`,
          '  expose ZMCP_SHR_C_ROOT as Root;',
          '}',
        ].join('\n'),
        activate: true,
        ...onRequest(),
      }),
    );
    await expectNameFree({
      tool: 'GetServiceBinding',
      args: { service_binding_name: BINDING },
    });
    recordCreated('DeleteServiceBinding', {
      service_binding_name: BINDING,
      ...onRequest(),
    });
    succeeded(
      'CreateServiceBinding',
      await livePrepare('CreateServiceBinding', {
        service_binding_name: BINDING,
        service_definition_name: SERVICE,
        package_name: ownPackage(),
        description: 'MCP service binding live case',
        binding_variant: 'ODATA_V4_UI',
        service_name: SERVICE,
        activate: true,
        ...onRequest(),
      }),
    );

    const metadata = await liveCall('GetServiceBinding', {
      service_binding_name: BINDING,
      part: 'metadata',
    });
    assert.ok(
      succeeded('GetServiceBinding metadata', metadata).text.includes(BINDING),
    );
    const source = await liveCall('GetServiceBinding', {
      service_binding_name: BINDING,
      part: 'source',
    });
    assert.ok(
      succeeded('GetServiceBinding source', source).text.includes(SERVICE),
    );

    const published = await liveCall('UpdateServiceBinding', {
      service_binding_name: BINDING,
      desired_publication_state: 'published',
      service_name: SERVICE,
    });
    state.published = true;
    assert.ok(
      succeeded('UpdateServiceBinding published', published).text.includes(
        'SUCCESS',
      ),
    );

    const preview = await liveCall('GetServiceBindingPreviewUrl', {
      service_binding_name: BINDING,
      entity_set: 'Root',
    });
    succeeded('GetServiceBindingPreviewUrl', preview);
    assert.equal(member(payloadOf(preview), 'published'), true);
    assert.equal(typeof member(payloadOf(preview), 'preview_url'), 'string');
  });
});
