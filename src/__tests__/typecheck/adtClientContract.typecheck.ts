/**
 * The server's client contract (`src/lib/adtClientContract.ts`), checked by
 * the compiler: `npm run test:check` compiles this file, and each
 * `@ts-expect-error` below fails the check the moment the call it marks
 * compiles — a factory the variant's table does not serve, or an operation
 * the API's table entry does not list.
 *
 * The contract is composed per variant from the ADT type tables, so the
 * same call is checked on each variant:
 * - SAP_BASIS 7.40 (`basis740`) serves neither a package nor a
 *   transformation: those factories are not on its contract; its DDL source
 *   lists no `checkCdsTestDoubles` (a gate, `PerformedOn`);
 * - on premise and ABAP cloud serve the same APIs; they part where the
 *   tables do: a program and an include are created, changed, activated,
 *   locked and deleted only on premise (`ADT_TYPES_ONPREM`), so those members
 *   are on the on-premise contract only — not on the cloud one, and not on
 *   the default one, which gets what both serve;
 * - an operation the API does not list at all — a domain has no source to
 *   `read`, a package is never `activate`d.
 *
 * Each negative check stands beside the positive one it differs from, so a
 * check cannot pass because the whole call is broken.
 *
 * Nothing runs here: it is not a test file, and Jest never loads it.
 */

import type {
  IAdtHeaders,
  IDdlResults,
  IDomainResults,
  IIncludeResults,
  IPackageResults,
  IProgramResults,
  ITransformationResults,
  IUtilResults,
} from '@mcp-abap-adt/interfaces-adt';
import type { IServerAdtClient } from '../../lib/adtClientContract';

declare const onPrem: IServerAdtClient<'onprem'>;
declare const cloud: IServerAdtClient<'cloud'>;
declare const legacy: IServerAdtClient<'basis740'>;
declare const modern: IServerAdtClient;
declare const ddl: IDdlResults;
declare const domain: IDomainResults;
declare const include: IIncludeResults;
declare const program: IProgramResults;
declare const pkg: IPackageResults;
declare const transformation: ITransformationResults;

export function factoriesTheVariantLacks() {
  onPrem.getPackage(pkg);
  cloud.getPackage(pkg);
  modern.getTransformation(transformation);
  // @ts-expect-error SAP_BASIS 7.40's table serves no package
  legacy.getPackage(pkg);
  // @ts-expect-error SAP_BASIS 7.40's table serves no transformation
  legacy.getTransformation(transformation);
}

export function operationsTheApiLacks() {
  // Served on premise and on ABAP cloud, gated on 7.40.
  onPrem.getDdl(ddl).checkCdsTestDoubles('VIEW');
  cloud.getDdl(ddl).checkCdsTestDoubles('VIEW');
  legacy.getDdl(ddl).read({ ddlName: 'VIEW' });
  // @ts-expect-error SAP_BASIS 7.40's DDL source lists no checkCdsTestDoubles
  legacy.getDdl(ddl).checkCdsTestDoubles('VIEW');

  // On premise: a domain is read through its metadata; it has no source.
  onPrem.getDomain(domain).readMetadata({ domainName: 'DOMAIN' });
  // @ts-expect-error the on-premise table lists no read for a domain
  onPrem.getDomain(domain).read({ domainName: 'DOMAIN' });

  // ABAP cloud: a package's metadata is read; a package is never activated.
  cloud.getPackage(pkg).readMetadata({ packageName: 'PACKAGE' });
  // @ts-expect-error the cloud table lists no activate for a package
  cloud.getPackage(pkg).activate({ packageName: 'PACKAGE' });
}

/**
 * The members are named, not called: an absent member is the only error a
 * line can have, so each `@ts-expect-error` stands for the gate alone.
 */
export function onPremOnlyMembers() {
  // A program is created, changed, activated, locked and deleted on premise.
  const onPremProgram = onPrem.getProgram(program);
  void onPremProgram.create;
  void onPremProgram.update;
  void onPremProgram.activate;
  void onPremProgram.lock;
  void onPremProgram.delete;
  void onPremProgram.validate;
  // ABAP cloud reads it, checks it and lists its versions.
  const cloudProgram = cloud.getProgram(program);
  void cloudProgram.read;
  void cloudProgram.check;
  void cloudProgram.getVersions;
  // @ts-expect-error the cloud table lists no create for a program
  void cloudProgram.create;
  // @ts-expect-error the cloud table lists no update for a program
  void cloudProgram.update;
  // @ts-expect-error the cloud table lists no activate for a program
  void cloudProgram.activate;
  // @ts-expect-error the cloud table lists no lock for a program
  void cloudProgram.lock;
  // @ts-expect-error the cloud table lists no delete for a program
  void cloudProgram.delete;
  // @ts-expect-error the cloud table lists no validate for a program
  void cloudProgram.validate;
  // @ts-expect-error the default contract gets what both tables serve
  void modern.getProgram(program).activate;

  // An include: changed on premise, read on ABAP cloud.
  void onPrem.getInclude(include).update;
  void cloud.getInclude(include).read;
  // @ts-expect-error the cloud table lists no update for an include
  void cloud.getInclude(include).update;
}

declare const utilResults: IUtilResults;
declare const headers: IAdtHeaders;

/**
 * `getUtils()`'s search takes the variant's search names
 * (`IAdtSearchObjectsParamsOf<V>`, adt-clients 39): a name of the variant's
 * object types list, not a code, and not a name only another variant lists.
 */
export function searchTakesTheVariantsNames() {
  const onPremUtils = onPrem.getUtils(utilResults);
  const cloudUtils = cloud.getUtils(utilResults);
  const modernUtils = modern.getUtils(utilResults);
  void onPremUtils.search({ query: 'Z*', objectType: 'DEVC' });
  void cloudUtils.search({ query: 'Z*', objectType: 'STRU' });
  void onPremUtils.search({ query: 'Z*', objectType: 'BCCH' });
  void cloudUtils.search({ query: 'Z*', objectType: 'TXPA' });
  void modernUtils.search({ query: 'Z*', objectType: 'ENHO' });
  // @ts-expect-error a code is no filter value
  void onPremUtils.search({ query: 'Z*', objectType: 'DEVC/K' });
  // @ts-expect-error a name only the on-premise list holds
  void cloudUtils.search({ query: 'Z*', objectType: 'BCCH' });
  // @ts-expect-error a name only the cloud list holds
  void onPremUtils.search({ query: 'Z*', objectType: 'TXPA' });
  // @ts-expect-error the default contract takes the names both lists hold
  void modernUtils.search({ query: 'Z*', objectType: 'BCCH' });
}

/**
 * Where-used and the group members are the typed atoms of the variant
 * (`IAdtTypedWhereUsed`, `IAdtTypedGroupLifecycle`): `VIEW/DV` is taken, a
 * function module names its group, and a code the variant's group
 * activation does not take is refused.
 */
export function groupMembersTakeTheTypedReferences() {
  const onPremUtils = onPrem.getUtils(utilResults);
  const cloudUtils = cloud.getUtils(utilResults);
  void onPremUtils.getWhereUsed(
    { object_name: 'ZV', object_type: 'VIEW/DV' },
    { headers },
  );
  void onPremUtils.activateObjectsGroup(
    [{ name: 'ZV', type: 'VIEW/DV' }],
    true,
    { headers },
  );
  void onPremUtils.activateObjectsGroup(
    [{ name: 'Z_FM', type: 'FUGR/FF', parentName: 'ZFG' }],
    true,
    { headers },
  );
  void onPremUtils.activateObjectsGroup(
    [{ name: 'ZP', type: 'PROG/P' }],
    true,
    { headers },
  );
  void onPremUtils.activateObjectsGroup(
    // @ts-expect-error a function module's reference names its group
    [{ name: 'Z_FM', type: 'FUGR/FF' }],
    true,
    { headers },
  );
  void cloudUtils.activateObjectsGroup(
    // @ts-expect-error the cloud table activates no program
    [{ name: 'ZP', type: 'PROG/P' }],
    true,
    { headers },
  );
  void onPremUtils.getWhereUsed(
    // @ts-expect-error where-used is asked of no function include
    { object_name: 'ZI', object_type: 'FUGR/I' },
    { headers },
  );
}
