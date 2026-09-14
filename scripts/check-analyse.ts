// `npx tsx scripts/check-analyse.ts 'src/handlers/domain/low/**'`
import { globSync } from 'node:fs';
import { analyseOmissions } from '../src/lib/audit/analyseOmissions';

const pattern = process.argv[2] ?? 'src/handlers/**/handle*.ts';
const files = globSync(pattern);
const { offenders, inspected } = analyseOmissions(files);

for (const line of offenders) console.error(line);
console.log(
  `${files.length} files, ${inspected} calls accept an analyse, ${offenders.length} were given none`,
);

// Zero inspected is a FAILURE, not a pass.
//
// This runs from Task 10 onward, while the tree still has hundreds of compiler
// errors, so "the checker resolved nothing" is a live possibility and not a
// theoretical one. A mistyped glob does the same. Both produce zero offenders,
// and a script that exits 0 on them reports a clean family it never looked at —
// which is the shape of every masking defect this migration exists to remove.
if (files.length === 0) {
  console.error(`no files matched ${pattern}`);
  process.exit(2);
}
if (inspected === 0) {
  console.error(
    `${files.length} files matched but no call accepted an analyse — either the family genuinely has none, or the program resolved nothing. Check one signature by hand before believing this.`,
  );
  process.exit(2);
}
process.exit(offenders.length === 0 ? 0 : 1);
