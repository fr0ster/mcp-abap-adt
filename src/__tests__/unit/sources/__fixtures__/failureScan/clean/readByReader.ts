import { failureOf } from '../../../../../../lib/auth/failures';

export function run(work: () => void): string {
  try {
    work();
    return 'ok';
  } catch (caught) {
    const read = failureOf(caught);
    console.error(`[x] ${read?.error ?? 'failed'}`);
    return read?.message ?? 'failed';
  }
}
