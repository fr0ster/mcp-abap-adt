/**
 * The type gate (`helpers/unknownSweep.ts`): `any` is an error — the keyword
 * written, and every expression typed `any` not handed on whole into a slot
 * declared `unknown` or `any`, outside a listed boundary; `unknown` written by
 * us is a warning — listed with its class, failing nothing, written to the CI
 * job's summary — unless it is in a listed boundary, a sink contract, or
 * forced by a third party's contract (`FORCED_BY_CONTRACT`).
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { REPO } from './helpers/failureScan';
import {
  eachProject,
  FORCED_BY_CONTRACT,
  fixtureProgram,
  type GateSite,
  gateProduction,
  gateSites,
  PARSE_SITES,
  PROGRAM_INPUT_SITES,
  productionKeys,
  SINK_SITES,
  SINK_SLOTS,
  THROWN_READERS,
  UNKNOWN_CLASSES,
} from './helpers/unknownSweep';

const FIXTURES = path.join(
  REPO,
  'src/__tests__/unit/sources/__fixtures__/typeGate',
);

function sitesOf(fixture: string): GateSite[] {
  const file = path.join(FIXTURES, `${fixture}.ts`);
  return gateSites(fixtureProgram([file]), new Set([file]));
}

/** `[line, kind]` of each site, by line. */
function linesOf(sites: readonly GateSite[]): [number, GateSite['kind']][] {
  return sites
    .map((site): [number, GateSite['kind']] => [
      Number(site.where.split(':').pop()),
      site.kind,
    ])
    .sort(([a], [b]) => a - b);
}

/** The area a site is in: its package, or `src/<dir>/<dir>`. */
function areaOf(site: GateSite): string {
  const parts = site.where.split(':')[0]?.split('/') ?? [];
  return parts[0] === 'src' ? parts.slice(0, 3).join('/') : (parts[0] ?? '');
}

/** The warning list as Markdown: a table of the sites, and the counts per area. */
function warningMarkdown(sites: readonly GateSite[]): string {
  const warned = sites.filter((site) => site.why !== 'forced');
  const forced = sites.filter((site) => site.why === 'forced');
  const areas = new Map<string, number>();
  for (const site of warned)
    areas.set(areaOf(site), (areas.get(areaOf(site)) ?? 0) + 1);
  const cell = (text: string): string => text.split('|').join('\\|');
  return [
    `### Written \`unknown\`: ${warned.length} site(s), ${forced.length} forced by a contract`,
    '',
    '| Site | Written | In | Why |',
    '| --- | --- | --- | --- |',
    ...warned.map(
      (site) =>
        `| ${site.where} | \`${cell(site.text)}\` | ${cell(site.owner)} | ${site.why} |`,
    ),
    '',
    '| Area | Sites |',
    '| --- | --- |',
    ...[...areas]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([area, count]) => `| ${area} | ${count} |`),
    '',
    "#### Forced by a third party's contract",
    '',
    '| Site | Written | Forced by |',
    '| --- | --- | --- |',
    ...forced.map(
      (site) =>
        `| ${site.where} | \`${cell(site.text)}\` | ${site.forcedBy ?? ''} |`,
    ),
    '',
  ].join('\n');
}

/** The warning list as plain text, grouped by area, with a total. */
function warningText(sites: readonly GateSite[]): string {
  const warned = sites.filter((site) => site.why !== 'forced');
  const byArea = new Map<string, GateSite[]>();
  for (const site of warned) {
    const list = byArea.get(areaOf(site)) ?? [];
    list.push(site);
    byArea.set(areaOf(site), list);
  }
  const lines: string[] = [];
  for (const [area, list] of [...byArea].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    lines.push(`${area} (${list.length})`);
    for (const site of list) {
      lines.push(
        `  ${site.where}  ${site.text}  in ${site.owner}  [${site.why}]`,
      );
    }
  }
  const forced = sites.filter((site) => site.why === 'forced');
  lines.push(
    `total: ${warned.length} written unknown, ${forced.length} forced by a contract`,
  );
  for (const site of forced) {
    lines.push(`  forced ${site.where}  ${site.forcedBy ?? ''}`);
  }
  return lines.join('\n');
}

describe('the type gate: any is an error', () => {
  it('the keyword written, and an expression typed any kept, read, inspected or handed into a narrower slot, are errors; handed on whole into an unknown or any slot it passes', () => {
    assert.deepEqual(linesOf(sitesOf('anyErrors')), [
      [5, 'unknown'],
      [9, 'any-keyword'],
      [15, 'any'],
      [16, 'any'],
      [21, 'any'],
      [26, 'any'],
      [32, 'any'],
      [37, 'any'],
      [43, 'unknown'],
      [48, 'unknown'],
      [60, 'unknown'],
      [61, 'any'],
    ]);
  });
});

describe('the type gate: unknown written by us is a warning', () => {
  it('lists the keyword in every type position', () => {
    assert.deepEqual(linesOf(sitesOf('unknownPositions')), [
      [4, 'unknown'],
      [7, 'unknown'],
      [10, 'unknown'],
      [14, 'unknown'],
      [18, 'unknown'],
      [20, 'unknown'],
      [22, 'unknown'],
      [26, 'unknown'],
      [30, 'unknown'],
    ]);
  });

  it("a sink contract's own unknown is not warned; the same outside it is", () => {
    assert.deepEqual(linesOf(sitesOf('sinkContract')), [[15, 'unknown']]);
  });
});

describe('the sweep reads only programs the compiler accepts', () => {
  const base = 'src/__tests__/unit/sources/__fixtures__/sweepProjects';
  const project = (name: string) => ({
    tsconfig: `${base}/${name}/tsconfig.json`,
    dir: `${base}/${name}/src`,
  });

  it('a project with a diagnostic before emit fails the sweep, naming the project and its first diagnostics', () => {
    assert.throws(
      () => eachProject([project('unresolved')], () => []),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes(`${base}/unresolved/tsconfig.json`) &&
        error.message.includes("Cannot find module '@sibling/unbuilt'"),
    );
    assert.deepEqual(
      eachProject([project('resolved')], (program) => [
        program.getRootFileNames().length,
      ]),
      [1],
    );
  });
});

describe('production: no any, and the list of written unknown', () => {
  const sites = gateProduction();
  const warnings = sites.filter((site) => site.kind === 'unknown');

  it('has no any', () => {
    assert.deepEqual(
      sites
        .filter((site) => site.kind !== 'unknown')
        .map((site) => `${site.where} ${site.kind} ${site.text}`),
      [],
    );
  });

  it('lists every written unknown with its class, and writes the list to the job summary', () => {
    process.stdout.write(`${warningText(warnings)}\n`);
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary !== undefined && summary !== '') {
      try {
        fs.appendFileSync(summary, warningMarkdown(warnings));
      } catch {
        // The summary is a report: a failed write fails nothing.
      }
    }
    assert.ok(warnings.every((site) => site.why !== undefined));
  });

  it('names no listed, forced or classified site that is gone', () => {
    const keys = productionKeys();
    const forced = new Set(
      warnings.filter((site) => site.why === 'forced').map((site) => site.key),
    );
    assert.deepEqual(
      [
        ...[
          ...THROWN_READERS,
          ...PARSE_SITES,
          ...PROGRAM_INPUT_SITES,
          ...SINK_SITES,
        ].filter((entry) => !keys.has(entry)),
        ...[...SINK_SLOTS.values()].filter(
          (reader) => ![...keys].some((key) => key.startsWith(`${reader}(`)),
        ),
        ...[...FORCED_BY_CONTRACT.keys()].filter((key) => !forced.has(key)),
        ...[...UNKNOWN_CLASSES.keys()].filter(
          (owner) => ![...keys].some((key) => key.startsWith(`${owner}(`)),
        ),
      ],
      [],
    );
  });
});
