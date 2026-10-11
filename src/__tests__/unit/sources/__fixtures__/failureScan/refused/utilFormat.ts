import * as util from 'node:util';

export function run(work: () => void): string {
  try {
    work();
    return '';
  } catch (caught) {
    return util.format('failed: %o', caught);
  }
}
