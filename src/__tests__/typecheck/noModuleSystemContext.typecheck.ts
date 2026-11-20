/**
 * The system context is per instance (D26 E3): no module-global setter is
 * left. An embedder states `systemContext` on the server's options. Each
 * line marked `@ts-expect-error` fails `npm run test:check` the moment the
 * setter is exported again.
 *
 * Nothing runs here: it is not a test file, and the runner never loads it.
 */

// @ts-expect-error `setSystemContext` is gone from the system context module.
import { setSystemContext as fromModule } from '../../lib/systemContext';
// @ts-expect-error … and from `@mcp-abap-adt/lib/utils`.
import { setSystemContext as fromUtils } from '../../lib/utils';

export const gone = [fromModule, fromUtils];
