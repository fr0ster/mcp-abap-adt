import { classDocuments } from '@mcp-abap-adt/adt-clients';
/**
 * Fixture for analyseOmissions.test.ts — verdict: no.
 *
 * The shorthand form of the same thing: a `const analyse = undefined`
 * bound in this file, then written into the options literal as `{ analyse }`.
 * `carriesAnalyse` reads the property assignment's initializer for the
 * longhand form and the name itself for the shorthand form — both must
 * resolve to a type that IS `undefined`.
 */
import type { IServerAdtClient } from '../../../lib/adtClientContract';

declare const client: IServerAdtClient;

export const call = () => {
  const analyse = undefined;
  return client
    .getClass(classDocuments)
    .read({ className: 'X' }, 'active', { analyse });
};
