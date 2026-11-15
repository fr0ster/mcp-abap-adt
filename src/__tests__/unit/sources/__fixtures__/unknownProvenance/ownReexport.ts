// A value of ours, its type argument written here (`writtenMembers.ts` reads
// it through `ownReexportVia.ts`'s namespace).
import type { Generic } from './node_modules/external-contracts';

type ToolArgs = Readonly<Record<string, unknown>>;

export declare const ownGiven: Generic<ToolArgs>;
