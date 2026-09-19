/**
 * Fixture for analyseOmissions.test.ts — verdict: no.
 *
 * A genuinely zero-argument call, so `call.arguments.at(-1)` is `undefined`
 * itself — `carriesAnalyse`'s very first line — rather than the
 * empty-object-literal branch `no-empty-literal.ts` already covers.
 *
 * **Why this is not a real `@mcp-abap-adt/adt-clients` call.** Every member
 * across the package whose options carry `analyse` also declares a REQUIRED
 * `config` before it (`read(config, version?, options?)`,
 * `readMetadata(config, options?)`, and so on) — `config` is never itself
 * optional, so a truly no-argument call never type-checks against a real
 * member; the closest reachable shape is `no-empty-literal.ts`'s single
 * argument that IS an empty-options object, which lands on a different
 * branch (the object-literal loop finding no `analyse` property, not the
 * `argument === undefined` check). This fixture instead declares a
 * synthetic single-member type whose sole parameter is optional, built from
 * the real `@mcp-abap-adt/interfaces` options type so the checker still
 * resolves a genuine `analyse`-bearing shape — the one piece the real
 * client cannot supply here is the optionality of the FIRST parameter, not
 * the shape of the options themselves.
 */
import type { IAdtError, IAdtOperationOptions } from '@mcp-abap-adt/interfaces';

declare const obj: {
  read(options?: IAdtOperationOptions<IAdtError>): Promise<void>;
};

export const call = () => obj.read();
