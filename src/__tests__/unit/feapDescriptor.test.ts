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
import {
  annotationServiceOf,
  decodeFeapSegment,
  encodeFeapSegment,
  feapDescriptor,
  feapPreviewUrl,
} from '../../lib/strategies/feapDescriptor';

/** The path segment Eclipse produced, exactly as it appeared in the browser. */
const ECLIPSE_SEGMENT =
  'ngVsghiXYbhsjF77%C2%87%C2%88%C2%89xy%C2%82%C2%88sxu%C2%88u77%C2%88%C2%83sUXXfYgg77%C2%87%C2%88%C2%89xy%C2%82%C2%88suxx%C2%86y%C2%87%C2%8777ngVsghiXYbhsjFsjUb77DDDE';

const DESCRIPTOR =
  'ZSB_STUDENT_V2##student_data##to_ADDRESS##student_address##ZSB_STUDENT_V2_VAN##0001';

describe('the ADT preview segment', () => {
  it('decodes to a readable descriptor', () => {
    expect(decodeFeapSegment(ECLIPSE_SEGMENT)).toBe(DESCRIPTOR);
  });

  it('re-encodes to the very segment Eclipse produced', () => {
    expect(encodeFeapSegment(DESCRIPTOR)).toBe(ECLIPSE_SEGMENT);
  });

  it('keeps the three encoding ranges apart', () => {
    // `#` (0x23) shifts to `7`, a digit shifts into letters, `_` shifts to `s`,
    // and a lowercase letter from `l` on leaves ASCII and needs the two UTF-8
    // bytes. A rule that treats them alike produces a URL that opens nothing.
    expect(encodeFeapSegment('#')).toBe('7');
    expect(encodeFeapSegment('0001')).toBe('DDDE');
    expect(encodeFeapSegment('_')).toBe('s');
    expect(encodeFeapSegment('k')).toBe('%7F');
    expect(encodeFeapSegment('l')).toBe('%C2%80');
    expect(encodeFeapSegment('z')).toBe('%C2%8E');
  });

  it('joins the descriptor in the order the preview expects', () => {
    expect(
      feapDescriptor({
        service: 'ZSB_STUDENT_V2',
        entitySet: 'student_data',
        navigation: 'to_ADDRESS',
        targetEntitySet: 'student_address',
        annotationService: 'ZSB_STUDENT_V2_VAN',
        version: '0001',
      }),
    ).toBe(DESCRIPTOR);
  });

  it('names the annotation service after the service', () => {
    expect(annotationServiceOf('ZSB_STUDENT_V2')).toBe('ZSB_STUDENT_V2_VAN');
    expect(annotationServiceOf('zsb_student_v2')).toBe('ZSB_STUDENT_V2_VAN');
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
    expect(url).toBe(
      'https://host.example.com:44300/sap/bc/adt/businessservices/odatav2/feap/' +
        `${ECLIPSE_SEGMENT}/flp.html?sap-ui-xx-viewCache=false&sap-ui-language=EN&sap-client=100`,
    );
  });
});
