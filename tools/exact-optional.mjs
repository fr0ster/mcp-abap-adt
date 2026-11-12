// The exact-optional gate of the no-assertions work (S2): each project compiled
// with its own configuration plus `exactOptionalPropertyTypes`, on the
// compiler API.
//
//   node tools/exact-optional.mjs          (npm run test:check:exact)
//   node tools/exact-optional.mjs --all    (npm run measure:exact)
//
// - The list, `tools/exact-optional-files.json`, names per project (its
//   `tsconfig`) the files already converted and the typechecks that pin them.
//   The typechecks are added to the project's program as roots; the files are
//   compiled as the project compiles them.
// - Without `--all`, a diagnostic in a listed file fails the run; one in a file
//   not listed yet is not this gate's (its batch has not come), so a converted
//   file cannot regress while its imports wait for their own batch. A listed
//   file that does not exist fails the run too.
// - With `--all`, every diagnostic of every project is counted, per file, and
//   nothing fails: the measurement of what is left.
//
// A configuration `include` cannot isolate a batch: TypeScript checks what the
// included files import. Hence a filter over each project's own diagnostics.
// Plain string code; no regular expression.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const ts = require('typescript');

/** A repository path with forward slashes, as the list writes it. */
const repoPath = (file) => relative(REPO, file).split(sep).join('/');

/** One project's diagnostics under the option, its typechecks among the roots. */
function diagnosticsOf(tsconfig, typechecks) {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    join(REPO, tsconfig),
    { exactOptionalPropertyTypes: true, noEmit: true },
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        );
      },
    },
  );
  const program = ts.createProgram({
    rootNames: [
      ...parsed.fileNames,
      ...typechecks.map((file) => join(REPO, file)),
    ],
    options: parsed.options,
  });
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.category === ts.DiagnosticCategory.Error);
}

function describe(d) {
  const text = ts.flattenDiagnosticMessageText(d.messageText, ' ');
  if (!d.file) return `TS${d.code} ${text}`;
  const at = d.file.getLineAndCharacterOfPosition(d.start ?? 0);
  return `${repoPath(d.file.fileName)}:${at.line + 1} TS${d.code} ${text}`;
}

const all = process.argv.includes('--all');
const list = JSON.parse(
  readFileSync(join(REPO, 'tools', 'exact-optional-files.json'), 'utf8'),
);
let failed = 0;
for (const project of list.projects) {
  const typechecks = project.typechecks ?? [];
  const listed = new Set([...(project.files ?? []), ...typechecks]);
  for (const file of listed) {
    if (!existsSync(join(REPO, file))) {
      console.error(`${project.tsconfig}: listed file missing: ${file}`);
      failed += 1;
    }
  }
  const found = diagnosticsOf(project.tsconfig, typechecks).filter(
    (d) => d.file === undefined || !d.file.fileName.includes('node_modules'),
  );
  if (all) {
    const perFile = new Map();
    for (const d of found) {
      const key = d.file ? repoPath(d.file.fileName) : '(global)';
      perFile.set(key, (perFile.get(key) ?? 0) + 1);
    }
    console.log(`${project.tsconfig}: ${found.length} error(s)`);
    for (const [file, count] of [...perFile].sort((a, b) => b[1] - a[1]))
      console.log(`  ${count}\t${file}${listed.has(file) ? '\t(listed)' : ''}`);
    continue;
  }
  const mine = found.filter(
    (d) => d.file === undefined || listed.has(repoPath(d.file.fileName)),
  );
  for (const d of mine) console.error(describe(d));
  failed += mine.length;
  console.log(
    `${project.tsconfig}: ${listed.size} listed file(s), ${mine.length} error(s) in them`,
  );
}
if (!all && failed > 0) process.exit(1);
