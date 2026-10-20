/**
 * Header probe: how a system answers the server's request header pairs.
 *
 * Prepare:
 *   - the server's destination configuration, the one the server starts
 *     with: a destination (`--mcp=<destination>`), a session `.env` by name
 *     (`--env=<name>`, from the sessions store) or by path
 *     (`--env-path=<file>`), YAML (`--conf=<file>`), and the system type
 *     (`--system-type`, `SAP_SYSTEM_TYPE` or YAML) — any server flag is
 *     passed through to the server's own configuration reader;
 *   - a package that exists, and a transport request for it: every
 *     temporary object is created there and deleted again.
 *
 * Run:
 *   npm run header:discovery -- --package <package> --transport <request> <server flags>
 *   npm run header:discovery -- … --only class,domain      # these object types only
 *   npm run header:discovery -- … --operation update       # this member only
 *   npm run header:discovery -- … --sequential             # one request at a time, no batch
 *   npm run header:discovery -- --compare <batched.json> <sequential.json>
 *
 * `--package` and `--transport` are required. `--only` takes object types
 * (class, interface, program, include, domain, dataElement, structure,
 * table, tableType, ddl, functionGroup, functionModule, messageClass,
 * transformation, serviceDefinition, accessControl, metadataExtension,
 * utils). `--operation` keeps the cycle but probes only that member.
 * `--compare` reads two reports and writes which probes differ.
 *
 * Report: `.header-probe/report-<timestamp>.json` (everything recorded) and
 * `.header-probe/report-<timestamp>.md` (a table per object type, then the
 * summary). The directory is gitignored: the report holds system answers.
 *
 * Every operation gets three requests, each through the member itself and
 * the server's `withAdtHeaders`:
 *   - known pair: the server's default pair (`DEFAULT_ADT_HEADERS`);
 *   - bad Accept: Accept `application/x-header-probe`, the default
 *     Content-Type — a 406 is expected;
 *   - bad Content-Type: the default Accept, Content-Type
 *     `application/x-header-probe` — a 415 is expected.
 * Outside a batch the server corrects a 406/415 that names a type once, and
 * the report shows that second answer too.
 *
 * More in tools/header-probe/README.md.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_ADT_HEADERS } from '../../src/lib/adtHeaders/defaultPairs';
import { Probe } from './cycle';
import { Interrupt, Interrupted, Ledger, withCleanup } from './ledger';
import { OBJECT_SPECS, skipReason } from './objects';
import {
  type IProbeReport,
  type IRemoval,
  keepsType,
  renderComparison,
  renderMarkdown,
  unreportedRows,
} from './record';
import { StartRefused, startProbeServer } from './server';

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const OUT_DIR = path.resolve(__dirname, '../../.header-probe');

const progress = (line: string): void => {
  process.stdout.write(`${line}\n`);
};
const loud = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

interface IArgs {
  only?: string[];
  operation?: string;
  sequential: boolean;
  compare?: [string, string];
  packageName?: string;
  transportRequest?: string;
  /** Every other argument: the server's own flags. */
  server: string[];
}

function parseArgs(argv: readonly string[]): IArgs {
  const args: IArgs = { sequential: false, server: [] };
  const value = (i: number, flag: string): string => {
    const next = argv[i];
    if (next === undefined) throw new Error(`${flag} needs a value`);
    return next;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '--only')
      args.only = value(++i, arg).split(',').filter(Boolean);
    else if (arg === '--operation') args.operation = value(++i, arg);
    else if (arg === '--sequential') args.sequential = true;
    else if (arg === '--package') args.packageName = value(++i, arg);
    else if (arg === '--transport') args.transportRequest = value(++i, arg);
    else if (arg === '--compare')
      args.compare = [value(++i, arg), value(++i, arg)];
    else args.server.push(arg);
  }
  return args;
}

function stamp(): string {
  return new Date().toISOString().split(':').join('-').split('.').join('-');
}

function writeReport(report: IProbeReport): string[] {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const base = path.join(OUT_DIR, `report-${stamp()}`);
  fs.writeFileSync(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(`${base}.md`, renderMarkdown(report));
  return [`${base}.json`, `${base}.md`];
}

function randomRun(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let run = '';
  for (let i = 0; i < 4; i++)
    run += alphabet[Math.floor(Math.random() * alphabet.length)];
  return run;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.compare) {
    const [a, b] = args.compare.map(
      (file) => JSON.parse(fs.readFileSync(file, 'utf8')) as IProbeReport,
    ) as [IProbeReport, IProbeReport];
    const [batched, sequential] = a.mode === 'batched' ? [a, b] : [b, a];
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const out = path.join(OUT_DIR, `compare-${stamp()}.md`);
    fs.writeFileSync(out, renderComparison(batched, sequential));
    progress(out);
    return;
  }
  if (args.packageName === undefined || !args.packageName)
    throw new Error('--package <package> is required');
  if (args.transportRequest === undefined)
    throw new Error('--transport <request> is required');

  const report: IProbeReport = {
    startedAt: new Date().toISOString(),
    mode: args.sequential ? 'sequential' : 'batched',
    filters: {
      ...(args.only ? { only: args.only } : {}),
      ...(args.operation ? { operation: args.operation } : {}),
    },
    rows: [],
    removals: [],
  };
  const ledger = new Ledger((removal: IRemoval) => {
    report.removals.push(removal);
    progress(
      `  cleanup: ${removal.removed ? 'removed' : 'NOT REMOVED'} ${removal.label}`,
    );
  });
  const interrupt = new Interrupt();
  // Ctrl-C stops new requests; the member call in flight finishes whole, the
  // run unwinds, and the cleanup removes the ledger as it then stands. A
  // second Ctrl-C while that runs is ignored.
  process.on('SIGINT', () => {
    if (interrupt.requested) return;
    interrupt.stop();
    report.error = 'interrupted (SIGINT)';
    progress(
      'interrupted: waiting for the member call in flight, then removing the temporary objects',
    );
  });

  const { server } = await startProbeServer(args.server, loud);
  try {
    await server.onConnection(async (connection) => {
      const probe = new Probe(
        connection,
        args,
        ledger,
        {
          packageName: args.packageName as string,
          transportRequest: args.transportRequest as string,
        },
        randomRun(),
        interrupt,
        progress,
      );
      report.rows = probe.rows;
      try {
        await withCleanup(ledger, async () => {
          for (const spec of OBJECT_SPECS) {
            if (!keepsType(args, spec.type)) continue;
            await probe.objectType(spec);
          }
          if (keepsType(args, 'utils')) await probe.utils();
        });
      } catch (error) {
        if (!(error instanceof Interrupted)) {
          report.error = message(error);
          loud(`The probe stopped: ${report.error}`);
        }
      }
      // Whatever a cleanup missed — an entry added after it ran — goes now.
      await ledger.cleanup();
      report.rows.push(
        ...unreportedRows(
          Object.keys(DEFAULT_ADT_HEADERS),
          report.rows,
          args,
          (objectType) => skipReason(objectType),
        ),
      );
    });
  } finally {
    report.finishedAt = new Date().toISOString();
    for (const file of writeReport(report)) progress(file);
    const left = report.removals.filter((removal) => !removal.removed);
    if (left.length) {
      loud(
        `\n!!! ${left.length} temporary object(s) could not be removed — delete them by hand:`,
      );
      for (const removal of left)
        loud(`!!!   ${removal.label}: ${removal.detail}`);
    }
    await server.terminalClose();
  }
  if (interrupt.requested) process.exit(130);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    loud(
      `header probe: ${error instanceof StartRefused ? error.message : message(error)}`,
    );
    process.exit(1);
  },
);
