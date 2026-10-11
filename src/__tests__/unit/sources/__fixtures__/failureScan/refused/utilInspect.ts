import { inspect } from 'node:util';

export function run(work: () => void): string {
  try {
    work();
    return '';
  } catch (caught) {
    return inspect(caught);
  }
}
