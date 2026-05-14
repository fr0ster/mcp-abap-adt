import {
  enumerateScanTargets,
  type PackageContentItem,
  type PackageContentsFetcher,
} from '../../../lib/search-source/packageEnumerator';

function item(
  name: string,
  adtType: string,
  packageName: string,
  isPackage = false,
): PackageContentItem {
  return { name, adtType, packageName, isPackage };
}

describe('enumerateScanTargets', () => {
  it('returns only objects of requested families and drops subpackage rows', async () => {
    const fetch: PackageContentsFetcher = async () => [
      item('ZPKG_SUB', 'DEVC/K', 'ZPKG', true),
      item('ZP_FOO', 'PROG/P', 'ZPKG'),
      item('ZF_BAR', 'FUGR/F', 'ZPKG'),
      item('ZC_BAZ', 'CLAS/OC', 'ZPKG'),
      item('ZD_QUX', 'DTEL/D', 'ZPKG'),
    ];
    const out = await enumerateScanTargets(fetch, {
      packages: ['ZPKG'],
      include_subpackages: false,
      object_types: ['PROG', 'CLAS'],
    });
    expect(out).toEqual([
      { devclass: 'ZPKG', object_type: 'CLAS', object_name: 'ZC_BAZ' },
      { devclass: 'ZPKG', object_type: 'PROG', object_name: 'ZP_FOO' },
    ]);
  });

  it('flattens results from multiple packages and sorts by (devclass, type, name)', async () => {
    const byPkg: Record<string, PackageContentItem[]> = {
      ZB: [item('ZB_PROG', 'PROG/P', 'ZB')],
      ZA: [
        item('ZA_PROG_2', 'PROG/P', 'ZA'),
        item('ZA_PROG_1', 'PROG/P', 'ZA_SUB'),
      ],
    };
    const fetch: PackageContentsFetcher = async (name) => byPkg[name] ?? [];
    const out = await enumerateScanTargets(fetch, {
      packages: ['ZB', 'ZA'],
      include_subpackages: true,
      object_types: ['PROG'],
    });
    expect(out.map((o) => `${o.devclass}/${o.object_name}`)).toEqual([
      'ZA/ZA_PROG_2',
      'ZA_SUB/ZA_PROG_1',
      'ZB/ZB_PROG',
    ]);
  });

  it('applies object_filter glob ("Z_FOO*" matches Z_FOO_1 and Z_FOO_BAR, not Y_FOO)', async () => {
    const fetch: PackageContentsFetcher = async () => [
      item('Z_FOO_1', 'PROG/P', 'ZPKG'),
      item('Z_FOO_BAR', 'PROG/P', 'ZPKG'),
      item('Y_FOO', 'PROG/P', 'ZPKG'),
    ];
    const out = await enumerateScanTargets(fetch, {
      packages: ['ZPKG'],
      include_subpackages: false,
      object_types: ['PROG'],
      object_filter: 'Z_FOO*',
    });
    expect(out.map((o) => o.object_name)).toEqual(['Z_FOO_1', 'Z_FOO_BAR']);
  });

  it('deduplicates objects appearing in overlapping subpackage results', async () => {
    const fetch: PackageContentsFetcher = async (name) => {
      if (name === 'ZA')
        return [item('ZP', 'PROG/P', 'ZA_SUB'), item('ZP', 'PROG/P', 'ZA_SUB')];
      if (name === 'ZB') return [item('ZP', 'PROG/P', 'ZA_SUB')];
      return [];
    };
    const out = await enumerateScanTargets(fetch, {
      packages: ['ZA', 'ZB'],
      include_subpackages: true,
      object_types: ['PROG'],
    });
    expect(out).toEqual([
      { devclass: 'ZA_SUB', object_type: 'PROG', object_name: 'ZP' },
    ]);
  });
});
