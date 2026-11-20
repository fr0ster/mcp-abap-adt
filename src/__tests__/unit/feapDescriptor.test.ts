/**
 * The preview segment is obfuscated, not signed — and this is the proof.
 *
 * **The fixture is a measurement.** Eclipse produced the URL below for an
 * on-premise binding (`ZSB_STUDENT_V2`, an OData V2 UI service). Decoding its path
 * segment by shifting every character down by 20 yields a readable descriptor, and
 * re-encoding that descriptor reproduces the segment byte for byte. That round trip
 * is what licenses building a preview URL from repository reads instead of asking
 * ADT for one — and it is why the fixture stays here verbatim rather than being
 * paraphrased into a "pattern".
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  annotationServiceOf,
  browserHostOf,
  decodeFeapSegment,
  encodeFeapSegment,
  type FeapV4Descriptor,
  feapDescriptor,
  feapPreviewUrl,
  feapV4Descriptor,
} from '../../lib/strategies/feapDescriptor';

/** The path segment Eclipse produced, exactly as it appeared in the browser. */
const ECLIPSE_SEGMENT =
  'ngVsghiXYbhsjF77%C2%87%C2%88%C2%89xy%C2%82%C2%88sxu%C2%88u77%C2%88%C2%83sUXXfYgg77%C2%87%C2%88%C2%89xy%C2%82%C2%88suxx%C2%86y%C2%87%C2%8777ngVsghiXYbhsjFsjUb77DDDE';

const DESCRIPTOR =
  'ZSB_STUDENT_V2##student_data##to_ADDRESS##student_address##ZSB_STUDENT_V2_VAN##0001';

describe('the ADT preview segment', () => {
  it('decodes to a readable descriptor', () => {
    assert.equal(decodeFeapSegment(ECLIPSE_SEGMENT), DESCRIPTOR);
  });

  it('re-encodes to the very segment Eclipse produced', () => {
    assert.equal(encodeFeapSegment(DESCRIPTOR), ECLIPSE_SEGMENT);
  });

  it('keeps the three encoding ranges apart', () => {
    // `#` (0x23) shifts to `7`, a digit shifts into letters, `_` shifts to `s`,
    // and a lowercase letter from `l` on leaves ASCII and needs the two UTF-8
    // bytes. A rule that treats them alike produces a URL that opens nothing.
    assert.equal(encodeFeapSegment('#'), '7');
    assert.equal(encodeFeapSegment('0001'), 'DDDE');
    assert.equal(encodeFeapSegment('_'), 's');
    assert.equal(encodeFeapSegment('k'), '%7F');
    assert.equal(encodeFeapSegment('l'), '%C2%80');
    assert.equal(encodeFeapSegment('z'), '%C2%8E');
  });

  it('joins the descriptor in the order the preview expects', () => {
    assert.equal(
      feapDescriptor({
        service: 'ZSB_STUDENT_V2',
        entitySet: 'student_data',
        navigation: 'to_ADDRESS',
        targetEntitySet: 'student_address',
        annotationService: 'ZSB_STUDENT_V2_VAN',
        version: '0001',
      }),
      DESCRIPTOR,
    );
  });

  it('names the annotation service after the service', () => {
    assert.equal(annotationServiceOf('ZSB_STUDENT_V2'), 'ZSB_STUDENT_V2_VAN');
    assert.equal(annotationServiceOf('zsb_student_v2'), 'ZSB_STUDENT_V2_VAN');
  });

  it('moves a BTP preview onto the browser host, and leaves on premise alone', () => {
    // Measured: the ADT host answers 401 Basic for this path and a trial user has
    // no password; the `abap-web` host answers the BTP logon bootstrap.
    assert.equal(
      browserHostOf('https://abc123.abap.us10.hana.ondemand.com'),
      'https://abc123.abap-web.us10.hana.ondemand.com',
    );
    // On premise there is no such split.
    assert.equal(
      browserHostOf('https://host.example.com:44300'),
      'https://host.example.com:44300',
    );
    // And a host that merely contains the word is not rewritten.
    assert.equal(
      browserHostOf('https://abap.example.com'),
      'https://abap.example.com',
    );
  });

  it('builds the absolute URL ADT opens', () => {
    const url = feapPreviewUrl({
      baseUrl: 'https://host.example.com:44300/',
      protocol: 'odatav2',
      client: '100',
      descriptor: {
        service: 'ZSB_STUDENT_V2',
        entitySet: 'student_data',
        navigation: 'to_ADDRESS',
        targetEntitySet: 'student_address',
        annotationService: 'ZSB_STUDENT_V2_VAN',
        version: '0001',
      },
    });
    assert.equal(
      url,
      'https://host.example.com:44300/sap/bc/adt/businessservices/odatav2/feap/' +
        `${ECLIPSE_SEGMENT}/flp.html?sap-ui-xx-viewCache=false&sap-ui-language=EN&sap-client=100`,
    );
  });
});

/**
 * The V4 descriptor, from two URLs Eclipse produced for one binding — the root
 * entity set and the child. Seven parts, the service's URL path first, the BINDING
 * last: a different document from the V2 one, not the same with another protocol in
 * the path, which is what this repository assumed until these two arrived.
 */
describe('the V4 descriptor Eclipse produces', () => {
  const PATH = '/sap/opu/odata4/sap/zmcp_prv_sb4u/srvd/sap/zmcp_prv_sb4u/0001/';

  const ROOT_SEGMENT =
    'C%C2%87u%C2%84C%C2%83%C2%84%C2%89C%C2%83xu%C2%88uHC%C2%87u%C2%84C%C2%8E%C2%81w%C2%84s%C2%84%C2%86%C2%8As%C2%87vH%C2%89C%C2%87%C2%86%C2%8AxC%C2%87u%C2%84C%C2%8E%C2%81w%C2%84s%C2%84%C2%86%C2%8As%C2%87vH%C2%89CDDDEC77f%C2%83%C2%83%C2%8877sw%7C%7D%C2%80x%C2%86y%C2%8277W%7C%7D%C2%80x77naWdsdfjsgVHi77DDDE77naWdsdfjsgVHi';
  const ROOT_DESCRIPTOR = `${PATH}##Root##_children##Child##ZMCP_PRV_SB4U##0001##ZMCP_PRV_SB4U`;

  const CHILD_SEGMENT =
    'C%C2%87u%C2%84C%C2%83%C2%84%C2%89C%C2%83xu%C2%88uHC%C2%87u%C2%84C%C2%8E%C2%81w%C2%84s%C2%84%C2%86%C2%8As%C2%87vH%C2%89C%C2%87%C2%86%C2%8AxC%C2%87u%C2%84C%C2%8E%C2%81w%C2%84s%C2%84%C2%86%C2%8As%C2%87vH%C2%89CDDDEC77W%7C%7D%C2%80x77s%C2%84u%C2%86y%C2%82%C2%8877f%C2%83%C2%83%C2%8877naWdsdfjsgVHi77DDDE77naWdsdfjsgVHi';
  const CHILD_DESCRIPTOR = `${PATH}##Child##_parent##Root##ZMCP_PRV_SB4U##0001##ZMCP_PRV_SB4U`;

  const parts = (entitySet: string, navigation: string, target: string) =>
    ({
      servicePath: PATH,
      entitySet,
      navigation,
      targetEntitySet: target,
      service: 'ZMCP_PRV_SB4U',
      version: '0001',
      binding: 'ZMCP_PRV_SB4U',
    }) satisfies FeapV4Descriptor;

  it('decodes the root capture', () => {
    assert.equal(decodeFeapSegment(ROOT_SEGMENT), ROOT_DESCRIPTOR);
  });

  it('decodes the child capture, which differs only in parts 2 to 4', () => {
    assert.equal(decodeFeapSegment(CHILD_SEGMENT), CHILD_DESCRIPTOR);
  });

  it('joins seven parts in the order the preview expects', () => {
    assert.equal(
      feapV4Descriptor(parts('Root', '_children', 'Child')),
      ROOT_DESCRIPTOR,
    );
    assert.equal(
      feapV4Descriptor(parts('Child', '_parent', 'Root')),
      CHILD_DESCRIPTOR,
    );
  });

  it('re-encodes to the very segments Eclipse produced', () => {
    assert.equal(encodeFeapSegment(ROOT_DESCRIPTOR), ROOT_SEGMENT);
    assert.equal(encodeFeapSegment(CHILD_DESCRIPTOR), CHILD_SEGMENT);
  });

  it('builds the V4 preview URL from the V4 parts', () => {
    const url = feapPreviewUrl({
      baseUrl: 'https://abc123.abap.us10.hana.ondemand.com',
      protocol: 'odatav4',
      descriptor: parts('Root', '_children', 'Child'),
      client: '100',
    });
    assert.equal(
      url,
      'https://abc123.abap-web.us10.hana.ondemand.com' +
        `/sap/bc/adt/businessservices/odatav4/feap/${ROOT_SEGMENT}` +
        '/flp.html?sap-ui-xx-viewCache=false&sap-ui-language=EN&sap-client=100',
    );
  });
});
