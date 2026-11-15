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
 *   (`UpdateServiceBinding`), waits until the published service answers, and
 *   builds its preview URL (`GetServiceBindingPreviewUrl`). The cleanup
 *   unpublishes it (asked again on a refusal), waits until the service no
 *   longer answers, deletes both and reads them absent.
 *
 * **When a publish has completed.** On the cloud system the publish is a
 * SAP background job: the ADT answer (`SEVERITY OK "… published locally"`,
 * our `SUCCESS`) comes once SAP's handler has waited up to 120 s for it,
 * whatever its state, and the binding reads `published` at once. The
 * measured completion signal is the published service itself: the cloud
 * gateway answers its `$metadata` 403 "The request has been blocked by
 * UCON." until SAP's publish job ends, then 200 (measured 2026-11-15: 200
 * at 95 s and 129 s after the publish answered; an unpublish asked then was
 * accepted at once). An unpublish is a job too: its `$metadata` turns
 * non-200 after its answer (within 32 s, measured). On premise the publish
 * is synchronous: 200 at once, 404 after the unpublish. Tests may wait;
 * the tools do not.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, it } from 'node:test';
import {
  deleteRecorded,
  expectAbsent,
  expectNameFree,
  liveCall,
  liveConnection,
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

/** Whether the case left the binding published, when its publish answered, and its service's `$metadata` path. */
const state: { published: boolean; publishedAt: number; metadata?: string } = {
  published: false,
  publishedAt: 0,
};

/** The pause between two attempts. */
const PAUSE_MS = 30_000;
/** How long a publish may take to complete before the case fails. */
const PUBLISH_LIMIT_MS = 20 * 60_000;
/** How long the cleanup asks for the unpublish, and waits for it to complete. */
const UNPUBLISH_LIMIT_MS = 15 * 60_000;

const pause = () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS));

/** Seconds since the publish answered. */
const since = (): number => Math.round((Date.now() - state.publishedAt) / 1000);

/** One stderr line per attempt: seconds since the publish, and how it went. */
function attempt(what: string, outcome: string): void {
  process.stderr.write(
    `[service binding] ${since()} s after the publish: ${what} ${outcome}\n`,
  );
}

/** The published service's `$metadata`, read through the suite's connection: SAP's status. */
async function metadataStatus(path: string): Promise<number | undefined> {
  try {
    const answered = await liveConnection().makeAdtRequest({
      url: path,
      method: 'GET',
      timeout: 0,
      headers: { Accept: 'application/xml' },
    });
    return answered.status;
  } catch (error) {
    const status = member(member(error, 'response'), 'status');
    return typeof status === 'number' ? status : undefined;
  }
}

/** The path of a URL GetServiceBindingPreviewUrl answers (absolute, or a path over RFC). */
function pathOf(url: string): string {
  if (url.startsWith('/')) return url;
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

/**
 * Waits, at `PAUSE_MS`, until the service's `$metadata` answers as `done`
 * says; at `limitMs` it throws, naming the last status.
 */
async function untilMetadata(
  path: string,
  what: string,
  done: (status: number | undefined) => boolean,
  limitMs: number,
): Promise<void> {
  const started = Date.now();
  for (;;) {
    const status = await metadataStatus(path);
    attempt(`$metadata (${what})`, String(status));
    if (done(status)) return;
    if (Date.now() - started >= limitMs) {
      throw new Error(
        `the service of ${BINDING} is not ${what} after ${Math.round((Date.now() - started) / 1000)} s: its $metadata answers ${String(status)}`,
      );
    }
    await pause();
  }
}

/**
 * The cleanup's unpublish, asked again on a refusal; then the wait until the
 * service no longer answers. At either limit the cleanup fails, naming
 * SAP's words and the two objects left over (and the leftovers report names
 * them: their records stay).
 */
async function unpublish(): Promise<void> {
  const started = Date.now();
  for (;;) {
    const answered = await livePrepare('UpdateServiceBinding', {
      service_binding_name: BINDING,
      desired_publication_state: 'unpublished',
      service_name: SERVICE,
    });
    attempt('unpublish', answered.isError ? 'refused' : 'unpublished');
    if (!answered.isError) {
      state.published = false;
      break;
    }
    if (Date.now() - started >= UNPUBLISH_LIMIT_MS) {
      throw new Error(
        `the binding ${BINDING} stays published after ${Math.round((Date.now() - started) / 1000)} s of unpublish attempts; ${BINDING} and ${SERVICE} are left over: ${answered.text}`,
      );
    }
    await pause();
  }
  if (state.metadata !== undefined) {
    await untilMetadata(
      state.metadata,
      'unpublished',
      (status) => status !== 200,
      UNPUBLISH_LIMIT_MS,
    );
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
    state.publishedAt = Date.now();
    assert.ok(
      succeeded('UpdateServiceBinding published', published).text.includes(
        'SUCCESS',
      ),
    );

    // The publish has completed when the service answers (see the head).
    const located = await livePrepare('GetServiceBindingPreviewUrl', {
      service_binding_name: BINDING,
      entity_set: 'Root',
    });
    const metadataUrl = member(
      payloadOf(succeeded('GetServiceBindingPreviewUrl', located)),
      'metadata_url',
    );
    assert.equal(typeof metadataUrl, 'string');
    state.metadata = pathOf(String(metadataUrl));
    await untilMetadata(
      state.metadata,
      'published',
      (status) => status === 200,
      PUBLISH_LIMIT_MS,
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
