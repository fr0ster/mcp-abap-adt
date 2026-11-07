/**
 * Fields read off an object's metadata document and a where-used scope,
 * through the XML parser (`src/lib/strategies/metadataFields.ts`): the corpus
 * documents read as they read before, and what a text search mishandled — an
 * attribute quoted with apostrophes, an entity, attributes in another order —
 * reads as XML says.
 */
import { corpusBody } from '../../lib/adtCorpus';
import {
  classIncludeTypesOf,
  includeContextUriOf,
  packageRefNameOf,
  whereUsedScopeTypesOf,
} from '../../lib/strategies/metadataFields';

const CLASS = corpusBody('read-metadata-class--01-classes-zbpmcpshriroot');

describe('packageRefNameOf', () => {
  it.each([
    'read-metadata-class--01-classes-zbpmcpshriroot',
    'read-metadata-behavior-definition--01-behaviordefinitions-zmcpshriroot',
    'read-metadata-service-definition--01-sources-zmcpshrsrvd01',
  ])('reads the package of %s', (name) => {
    expect(packageRefNameOf(corpusBody(name))).toBe('ZMCP_SHR_PKG');
  });

  it('reads a package reference whose attributes are quoted with apostrophes', () => {
    expect(
      packageRefNameOf(
        "<program:abapProgram xmlns:program='http://www.sap.com/adt/programs/programs' xmlns:adtcore='http://www.sap.com/adt/core'><adtcore:packageRef adtcore:uri='/sap/bc/adt/packages/%24tmp' adtcore:name='$TMP'/></program:abapProgram>",
      ),
    ).toBe('$TMP');
  });

  it('reads the first package reference that names one', () => {
    expect(
      packageRefNameOf(
        '<x xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:packageRef/><adtcore:packageRef adtcore:name="ZPKG"/></x>',
      ),
    ).toBe('ZPKG');
  });

  it('reads nothing of a document without one, or of no document', () => {
    expect(packageRefNameOf('<x/>')).toBeUndefined();
    expect(packageRefNameOf('')).toBeUndefined();
  });
});

describe('classIncludeTypesOf', () => {
  it('reads the include types of the recorded class metadata, in order', () => {
    expect(classIncludeTypesOf(CLASS)).toEqual([
      'definitions',
      'implementations',
      'macros',
      'testclasses',
      'main',
    ]);
  });

  it('reads an include type quoted with apostrophes', () => {
    expect(
      classIncludeTypesOf(
        "<class:abapClass xmlns:class='http://www.sap.com/adt/oo/classes'><class:include class:includeType='main'/></class:abapClass>",
      ),
    ).toEqual(['main']);
  });
});

describe('includeContextUriOf', () => {
  it("reads an include's main program, as a system answers it", () => {
    expect(
      includeContextUriOf(
        '<?xml version="1.0" encoding="utf-8"?><include:abapInclude xmlns:include="http://www.sap.com/adt/programs/includes" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZINC"><include:contextRef adtcore:uri="/sap/bc/adt/programs/programs/zprog" adtcore:type="PROG/P" adtcore:name="ZPROG"/></include:abapInclude>',
      ),
    ).toBe('/sap/bc/adt/programs/programs/zprog');
  });

  it('reads a context whose uri carries an entity, decoded', () => {
    expect(
      includeContextUriOf(
        '<include:abapInclude xmlns:include="http://www.sap.com/adt/programs/includes" xmlns:adtcore="http://www.sap.com/adt/core"><include:contextRef adtcore:uri="/sap/bc/adt/programs/programs/%2fns%2fprog?a=1&amp;b=2"/></include:abapInclude>',
      ),
    ).toBe('/sap/bc/adt/programs/programs/%2fns%2fprog?a=1&b=2');
  });

  it('reads nothing of an include without a context', () => {
    expect(
      includeContextUriOf(
        '<include:abapInclude xmlns:include="http://www.sap.com/adt/programs/includes"/>',
      ),
    ).toBeUndefined();
  });
});

describe('whereUsedScopeTypesOf', () => {
  const SCOPE =
    '<?xml version="1.0"?><usagereferences:usageScopeResult xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences"><usagereferences:objectTypes><usagereferences:type isDefault="true" isSelected="true" name="CLAS/OC"/><usagereferences:type isDefault="false" isSelected="false" name="TABL/DT"/></usagereferences:objectTypes></usagereferences:usageScopeResult>';

  it('reads every type the scope offers, in order', () => {
    expect(whereUsedScopeTypesOf(SCOPE)).toEqual(['CLAS/OC', 'TABL/DT']);
  });

  it('reads a type quoted with apostrophes', () => {
    expect(
      whereUsedScopeTypesOf(
        "<usagereferences:usageScopeResult xmlns:usagereferences='http://www.sap.com/adt/ris/usageReferences'><usagereferences:objectTypes><usagereferences:type name='INTF/OI' isSelected='true'/></usagereferences:objectTypes></usagereferences:usageScopeResult>",
      ),
    ).toEqual(['INTF/OI']);
  });

  it('reads nothing of an empty answer', () => {
    expect(whereUsedScopeTypesOf('')).toEqual([]);
  });
});
