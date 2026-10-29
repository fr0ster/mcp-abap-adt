import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
/**
 * Fixture for analyseOmissions.test.ts — verdict: unknown.
 *
 * `let options = { analyse: x }; options = {};` — the binding is rebound
 * before the call, so its initializer no longer describes the value at the
 * call site. `carriesAnalyse` only follows a `const`, precisely because a
 * `let` can look like this and prove the opposite of what its initializer
 * says.
 */
import type { IServerAdtClient } from '../../../lib/adtClientContract';

declare const client: IServerAdtClient;

export const call = () => {
  let options: { analyse?: typeof analyseException } = {
    analyse: analyseException,
  };
  options = {};
  return client
    .getClass(classDocuments)
    .read({ className: 'X' }, 'active', options);
};
