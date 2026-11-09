// The node:test build (D27): `npm run test:build`.
//
//   node tools/build-node-tests.mjs [--repo <dir>]
//
// Removes `.test-build/`, then compiles into `.test-build/tree/`, with the options of
// `tsconfig.node-test.json`, the files that configuration names (the
// runner's preload) and every source of the node:test list
// (`tools/node-test-files.json`), with what they import, into it. `tsc -p`
// cannot take the list from a JSON file, so the program is built here through
// TypeScript's own API; `noEmitOnError` in the configuration means a failed
// compile emits nothing, and the build exits non-zero. After a successful
// compile it places the files of `tools/node-test-placed.json` beside the
// compiled code (spec §2, "Files production code reads beside itself").
//
// `--repo` names another repository holding its own list and
// `tsconfig.node-test.json` (the runner's tests build fixtures that way); the
// default is the repository this file belongs to.
import { cpSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import {
  buildDir,
  buildRoot,
  OWN_REPO,
  readList,
  readPlaced,
  sourceFile,
} from './node-test-list.mjs';

function fail(words) {
  console.error(`build-node-tests: ${words}`);
  process.exit(1);
}

let repo = OWN_REPO;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--repo' && i + 1 < args.length) {
    repo = args[i + 1];
    i += 1;
  } else {
    fail(`unknown argument: ${args[i]}`);
  }
}

const host = {
  getCanonicalFileName: (name) =>
    ts.sys.useCaseSensitiveFileNames ? name : name.toLowerCase(),
  getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
  getNewLine: () => ts.sys.newLine,
};
function report(diagnostics) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
}

const configFile = join(repo, 'tsconfig.node-test.json');
const parsed = ts.getParsedCommandLineOfConfigFile(
  configFile,
  {},
  {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      report([diagnostic]);
      process.exit(1);
    },
  },
);
if (parsed === undefined) fail(`${configFile} could not be read`);
if (parsed.errors.length > 0) {
  report(parsed.errors);
  process.exit(1);
}
const outDir = parsed.options.outDir;
if (outDir === undefined) fail(`${configFile} names no outDir`);
if (resolve(outDir) !== resolve(buildDir(repo))) {
  fail(`${configFile}: outDir must be ${buildDir(repo)}`);
}

// Read before the clean: a list that cannot be placed fails the build with
// nothing removed or emitted.
let placed;
try {
  placed = readPlaced(repo);
} catch (error) {
  fail(error.message);
}

// The whole build root goes, not only the compiled tree.
rmSync(buildRoot(repo), { recursive: true, force: true });

const program = ts.createProgram({
  rootNames: [
    ...parsed.fileNames,
    ...readList(repo).map((source) => sourceFile(repo, source)),
  ],
  options: parsed.options,
  projectReferences: parsed.projectReferences,
});
const found = ts.getPreEmitDiagnostics(program);
// With `noEmitOnError`, a program with diagnostics emits nothing; without
// it, the emit below would still write files, and the build still fails.
const emitted = program.emit();
const diagnostics = found.length > 0 ? found : emitted.diagnostics;
if (diagnostics.length > 0) {
  report(diagnostics);
  process.exit(1);
}
if (emitted.emitSkipped) fail('the compiler emitted nothing');

// The files production code reads by its own location, placed beside the
// compiled code at their repository paths (spec §2), fresh after the clean.
for (const entry of placed) {
  const parts = entry.split('/');
  cpSync(join(repo, ...parts), join(outDir, ...parts), { recursive: true });
}
