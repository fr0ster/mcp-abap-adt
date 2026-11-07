import {
  enumerateScanTargets,
  type PackageContentItem,
  type PackageContentsFetcher,
} from '../../../lib/search-source/packageEnumerator';
import { listing } from '../../helpers/sourceReaderFake';

function item(
  name: string,
  type: string,
  packageName: string,
  isPackage = false,
): PackageContentItem {
  return { name, type, packageName, isPackage };
}

describe('enumerateScanTargets', () => {
  it('returns only objects of requested families and drops subpackage rows', async () => {
    const fetch: PackageContentsFetcher = async (name) =>
      listing(name, [
        item('ZPKG_SUB', 'DEVC/K', 'ZPKG', true),
        item('ZP_FOO', 'PROG/P', 'ZPKG'),
        item('ZF_BAR', 'FUGR/F', 'ZPKG'),
        item('ZC_BAZ', 'CLAS/OC', 'ZPKG'),
        item('ZD_QUX', 'DTEL/D', 'ZPKG'),
      ]);
    const { targets: out } = await enumerateScanTargets(fetch, {
      packages: ['ZPKG'],
      include_subpackages: false,
      object_types: ['PROG', 'CLAS'],
    });
    expect(out).toEqual([
      {
        devclass: 'ZPKG',
        object_type: 'CLAS',
        object_name: 'ZC_BAZ',
        code: 'CLAS/OC',
      },
      {
        devclass: 'ZPKG',
        object_type: 'PROG',
        object_name: 'ZP_FOO',
        code: 'PROG/P',
      },
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
    const fetch: PackageContentsFetcher = async (name) =>
      listing(name, byPkg[name] ?? []);
    const { targets: out } = await enumerateScanTargets(fetch, {
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
    const fetch: PackageContentsFetcher = async (name) =>
      listing(name, [
        item('Z_FOO_1', 'PROG/P', 'ZPKG'),
        item('Z_FOO_BAR', 'PROG/P', 'ZPKG'),
        item('Y_FOO', 'PROG/P', 'ZPKG'),
      ]);
    const { targets: out } = await enumerateScanTargets(fetch, {
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
        return listing(name, [
          item('ZP', 'PROG/P', 'ZA_SUB'),
          item('ZP', 'PROG/P', 'ZA_SUB'),
        ]);
      if (name === 'ZB') return listing(name, [item('ZP', 'PROG/P', 'ZA_SUB')]);
      return listing(name, []);
    };
    const { targets: out } = await enumerateScanTargets(fetch, {
      packages: ['ZA', 'ZB'],
      include_subpackages: true,
      object_types: ['PROG'],
    });
    expect(out).toEqual([
      {
        devclass: 'ZA_SUB',
        object_type: 'PROG',
        object_name: 'ZP',
        code: 'PROG/P',
      },
    ]);
  });

  it('a program include is a PROG target read by its own code', async () => {
    const fetch: PackageContentsFetcher = async (name) =>
      listing(name, [
        item('ZINCL', 'PROG/I', 'ZPKG'),
        item('ZIF', 'INTF/OI', 'ZPKG'),
      ]);
    const { targets } = await enumerateScanTargets(fetch, {
      packages: ['ZPKG'],
      include_subpackages: false,
      object_types: ['PROG', 'INTF'],
    });
    expect(targets).toEqual([
      {
        devclass: 'ZPKG',
        object_type: 'INTF',
        object_name: 'ZIF',
        code: 'INTF/OI',
      },
      {
        devclass: 'ZPKG',
        object_type: 'PROG',
        object_name: 'ZINCL',
        code: 'PROG/I',
      },
    ]);
  });

  it('a package whose walk was skipped at its place is not counted; a package reached twice is counted once', async () => {
    const fetch: PackageContentsFetcher = async (name) => {
      // The walker decided the root at its place: skipped, it answers nothing.
      if (name === 'ZGONE') return { items: [], walked: new Set() };
      return {
        items: [item(`P_${name}`, 'PROG/P', name)],
        walked: new Set([name, 'ZSHARED_SUB']),
      };
    };
    const { targets, packages } = await enumerateScanTargets(fetch, {
      packages: ['ZA', 'ZGONE', 'ZB'],
      include_subpackages: true,
      object_types: ['PROG'],
    });
    expect(targets.map((t) => t.object_name)).toEqual(['P_ZA', 'P_ZB']);
    expect(packages).toBe(3);
  });

  it("a failure the walk passes on is not the enumerator's to decide: it passes through (DO22)", async () => {
    const decided = new TypeError('a defect');
    const fetch: PackageContentsFetcher = async () => {
      throw decided;
    };
    await expect(
      enumerateScanTargets(fetch, {
        packages: ['ZA'],
        include_subpackages: true,
        object_types: ['PROG'],
      }),
    ).rejects.toBe(decided);
  });
});
