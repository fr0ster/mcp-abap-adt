/**
 * What `UpdateServiceBinding` puts on the publication job, per protocol.
 *
 * **Measured, adt-clients 23.0.5 ERRATA** ("A V2 publication job resolves the
 * service by name and version"): an OData V2 publish or unpublish resolves the
 * service from `servicename` and `serviceversion` in the query string, and without
 * them answers `200` with `SEVERITY ERROR`, naming an EMPTY service and version
 * `0000`. V4 settles the target from the body alone. Both binding CATEGORIES were
 * measured on both protocols — UI and Web API behave the same — so the axis is the
 * protocol.
 *
 * This handler accepted `service_name`/`service_version` and dropped them for as
 * long as the library had nowhere to put them, which is why publishing a V2 binding
 * through this server could not succeed. These two cases are that regression's
 * guard: the fields reach the wire for `ODATA_V2_*` and do not for `ODATA_V4_*`.
 */
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { handleUpdateServiceBinding } from '../../handlers/service_binding/high/handleUpdateServiceBinding';
import {
  LOCK_SUCCESS_XML,
  type RecordingConnection,
  recordingConnection,
} from '../helpers/recordingConnection';

const ctx = (connection: IAbapConnection) => ({
  connection,
  logger: undefined,
});

const OK_JOB =
  '<?xml version="1.0" encoding="utf-8"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml">' +
  '<asx:values><DATA><SEVERITY>OK</SEVERITY><SHORT_TEXT>published locally</SHORT_TEXT></DATA></asx:values></asx:abap>';

const jobOf = (connection: RecordingConnection) =>
  connection.requests.find((r) => r.url.includes('publishjobs'));

describe('the publication job UpdateServiceBinding issues', () => {
  it('carries the service name and version for an OData V2 binding', async () => {
    const connection = recordingConnection([
      { data: LOCK_SUCCESS_XML },
      { data: OK_JOB },
    ]);

    await handleUpdateServiceBinding(
      ctx(connection) as never,
      {
        service_binding_name: 'zmcp_x',
        desired_publication_state: 'published',
        binding_variant: 'ODATA_V2_UI',
        service_name: 'zmcp_x_srv',
        service_version: '0002',
      } as never,
    );

    const job = jobOf(connection);
    expect(job?.url).toContain('/businessservices/odatav2/publishjobs');
    // Upper-cased, as the name is in the repository.
    expect(job?.params).toEqual({
      servicename: 'ZMCP_X_SRV',
      serviceversion: '0002',
    });
  });

  it('defaults the version to 0001, because the tool surface does', async () => {
    const connection = recordingConnection([
      { data: LOCK_SUCCESS_XML },
      { data: OK_JOB },
    ]);

    await handleUpdateServiceBinding(
      ctx(connection) as never,
      {
        service_binding_name: 'ZMCP_X',
        desired_publication_state: 'published',
        binding_variant: 'ODATA_V2_WEB_API',
        service_name: 'ZMCP_X_SRV',
      } as never,
    );

    // Web API, same protocol, same demand — the category is not the axis.
    const job = jobOf(connection);
    expect(job?.url).toContain('/businessservices/odatav2/publishjobs');
    expect(job?.params).toEqual({
      servicename: 'ZMCP_X_SRV',
      serviceversion: '0001',
    });
  });

  it('carries no query string for an OData V4 binding', async () => {
    const connection = recordingConnection([
      { data: LOCK_SUCCESS_XML },
      { data: OK_JOB },
    ]);

    await handleUpdateServiceBinding(
      ctx(connection) as never,
      {
        service_binding_name: 'ZMCP_X',
        desired_publication_state: 'published',
        binding_variant: 'ODATA_V4_UI',
        service_name: 'ZMCP_X_SRV',
        service_version: '0001',
      } as never,
    );

    const job = jobOf(connection);
    expect(job?.url).toContain('/businessservices/odatav4/publishjobs');
    // Left exactly as it was measured working; sending it there was never measured.
    expect(job?.params).toBeUndefined();
  });
});
