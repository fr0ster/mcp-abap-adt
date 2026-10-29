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
  IDdlResults,
  IDomainResults,
  IIncludeResults,
  IPackageResults,
  IProgramResults,
  ITransformationResults,
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
