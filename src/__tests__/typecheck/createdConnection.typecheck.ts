/**
 * The test helpers receive what `createAbapConnection` builds as the
 * connection package's `CreatedConnection` (plan C2 Step 4), so the refusal
 * guard wraps it with no cast: `npm run test:check` compiles this file, and
 * each `@ts-expect-error` below fails the check the moment the line it marks
 * compiles.
 *
 * Nothing runs here: it is not a test file, and Jest never loads it.
 */

import type { CreatedConnection } from '@mcp-abap-adt/connection';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { createAbapConnection } from '../../lib/connectionFactory';
import type {
  GuardedConnection,
  refusalGuardedConnection,
} from '../integration/helpers/refusalGuard';

type Built = ReturnType<typeof createAbapConnection>;
type Wrapped = Parameters<typeof refusalGuardedConnection>[0];

/** What the factory builds is what the guard wraps… */
export const wrapsWhatIsBuilt = (built: Built): Wrapped => built;
/** …the connection package's own type… */
export const builtIsCreated = (built: Built): CreatedConnection => built;
// @ts-expect-error …never the wider interface, which a connection that
// lacks `disconnect` also satisfies.
export const wrapsAnyConnection = (any: IAbapConnection): Wrapped => any;

/** A guarded connection is still a connection every handler takes. */
export const guardedIsConnection = (
  guarded: GuardedConnection,
): IAbapConnection => guarded;
