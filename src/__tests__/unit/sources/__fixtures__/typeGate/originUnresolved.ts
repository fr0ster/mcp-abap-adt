// The origin report, UNRESOLVED: a package with no manifest beside its
// declarations; the site is reported as such, never dropped.
import { loose } from './node_modules/no-manifest';

export const kept = String(loose);
