/**
 * A package's metadata, read three ways: the summary (`terse`), the summary with
 * every sub-package (`full`), the document itself (`raw`, not here).
 */
import { corpusBody } from '../../lib/adtCorpus';
import {
  packageDetails,
  packageSummary,
} from '../../lib/strategies/packageSummary';

const WITH_SUB_PACKAGES = `<?xml version="1.0" encoding="utf-8"?><pak:package xmlns:pak="http://www.sap.com/adt/packages" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZPARENT" adtcore:description="Parent"><pak:attributes pak:packageType="structure"/><pak:subPackages><pak:packageRef adtcore:name="ZCHILD_A" adtcore:description="Child A"/><pak:packageRef adtcore:name="ZCHILD_B" adtcore:description="Child B"/></pak:subPackages></pak:package>`;

describe('packageSummary', () => {
  it('reads the captured package: its attributes and no sub-package', () => {
    expect(
      packageSummary(
        corpusBody('read-metadata-package--01-packages-zmcpshrpkg'),
      ),
    ).toEqual(
      expect.objectContaining({
        name: 'ZMCP_SHR_PKG',
        package_type: 'development',
        super_package: 'ZADT_BLD_PKG03',
        software_component: 'ZLOCAL',
        sub_package_count: 0,
      }),
    );
  });

  it('counts the sub-packages and lists none of them', () => {
    const summary = packageSummary(WITH_SUB_PACKAGES);
    expect(summary.sub_package_count).toBe(2);
    expect(summary).not.toHaveProperty('sub_packages');
  });
});

describe('packageDetails', () => {
  it('adds every sub-package by name and description', () => {
    expect(packageDetails(WITH_SUB_PACKAGES)).toEqual(
      expect.objectContaining({
        name: 'ZPARENT',
        package_type: 'structure',
        sub_package_count: 2,
        sub_packages: [
          { name: 'ZCHILD_A', description: 'Child A' },
          { name: 'ZCHILD_B', description: 'Child B' },
        ],
      }),
    );
  });
});
