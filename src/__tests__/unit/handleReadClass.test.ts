import { handleReadClass } from '../../handlers/class/readonly/handleReadClass';
import { corpusBody } from '../../lib/adtCorpus';
import {
  fakeClientOf,
  okResponse,
  reading,
  recordAnalyse,
  refusedResponse,
} from '../helpers/fakeClient';

let fakeClient: any;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

const context = { connection: {} as any, logger: undefined };

describe('handleReadClass', () => {
  it('answers the source and the metadata on success', async () => {
    const source = corpusBody('read-class-source-text--01-read-source');
    const metadata = corpusBody(
      'read-metadata-class--01-classes-zbpmcpshriroot',
    );
    fakeClient = fakeClientOf({
      read: async () => okResponse(reading(source)),
      readMetadata: async () => okResponse(reading(metadata)),
    });

    const result: any = await handleReadClass(context as any, {
      class_name: 'zcl_x',
    });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.class_name).toBe('ZCL_X');
    expect(payload.source_code).toBe(source);
    expect(payload.metadata).toBe(metadata);
  });

  it('reports a refused read as an error, not as success with a null body', async () => {
    fakeClient = fakeClientOf({
      read: async () => refusedResponse('Resource not found'),
      readMetadata: async () => {
        throw new Error('must not be reached');
      },
    });

    const result: any = await handleReadClass(context as any, {
      class_name: 'zcl_missing',
    });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.message).toBe('Resource not found');
    expect(payload.origin).toBe('refusal');
    expect(result.content[0].text).not.toContain('"success": true');
  });

  it('hands both read and readMetadata their own analyse strategy', async () => {
    const seen = recordAnalyse();
    fakeClient = seen.client;

    await handleReadClass(context as any, { class_name: 'zcl_x' });

    expect(seen.countOf('read')).toBe(1);
    expect(seen.countOf('readMetadata')).toBe(1);
    const readCall = seen.calls.find((c) => c.member === 'read');
    const readMetadataCall = seen.calls.find(
      (c) => c.member === 'readMetadata',
    );
    expect(readCall?.carriedAnalyse).toBe(true);
    expect(readMetadataCall?.carriedAnalyse).toBe(true);
  });
});
