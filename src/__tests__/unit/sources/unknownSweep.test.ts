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

const ORIGINS = ['OURS', 'EXTERNAL', 'LANGUAGE', 'UNRESOLVED'] as const;

/** The unknown sites of each origin, each split by whether a list covers it. */
function byOrigin(sites: readonly GateSite[]) {
  return ORIGINS.map((origin) => {
    const of = sites.filter((site) => site.origin === origin);
    const covered = of.filter((site) => (site.boundary ?? 'none') !== 'none');
    return {
      origin,
      sites: of,
      covered: covered.length,
      open: of.length - covered.length,
    };
  });
}

/** The origin report as Markdown: totals per origin, then each origin's sites. */
function originMarkdown(sites: readonly GateSite[]): string {
  const cell = (text: string): string => text.split('|').join('\\|');
  const groups = byOrigin(sites);
  return [
    `### Where \`unknown\` enters: ${sites.length} site(s)`,
    '',
    '| Origin | Sites | Covered by a list | Not covered |',
    '| --- | --- | --- | --- |',
    ...groups.map(
      (group) =>
        `| ${group.origin} | ${group.sites.length} | ${group.covered} | ${group.open} |`,
    ),
    '',
    ...groups.flatMap((group) =>
      group.sites.length === 0
        ? []
        : [
            `#### ${group.origin} (${group.sites.length})`,
            '',
            '| From | Site | Enters as | Covered by | In | Why |',
            '| --- | --- | --- | --- | --- | --- |',
            ...group.sites.map(
              (site) =>
                `| ${cell(site.from ?? '')} | ${site.where} | ${site.entry ?? ''} | ${site.boundary ?? 'none'} | ${cell(site.owner)} | ${site.why} |`,
            ),
            '',
          ],
    ),
  ].join('\n');
}

/** The origin report as plain text, origin first, with counts. */
function originText(sites: readonly GateSite[]): string {
  const lines: string[] = [];
  for (const group of byOrigin(sites)) {
    lines.push(
      `${group.origin}: ${group.sites.length} (${group.covered} covered by a list, ${group.open} not)`,
    );
    for (const site of group.sites) {
      lines.push(
        `  ${site.from ?? ''}  ${site.where}  ${site.entry ?? ''}  [${site.boundary ?? 'none'}]  ${site.text}`,
      );
    }
  }
  lines.push(`total: ${sites.length} site(s) where unknown enters`);
  return lines.join('\n');
}

/** `[line, origin, from]` of each unknown site, by line. */
function originsOf(sites: readonly GateSite[]): [number, string, string][] {
  return sites
    .filter((site) => site.kind === 'unknown')
    .map((site): [number, string, string] => [
      Number(site.where.split(':').pop()),
      site.origin ?? '',
      site.from === site.where ? 'here' : (site.from ?? ''),
    ])
    .sort(([a], [b]) => a - b);
}

describe('the origin report: every unknown where it enters', () => {
  it('OURS: the keyword written, at its own line', () => {
    assert.deepEqual(originsOf(sitesOf('originOurs')), [
      [2, 'OURS', 'here'],
      [6, 'OURS', 'here'],
    ]);
  });

  it("EXTERNAL: a package's value, call, callback — named by its manifest and member", () => {
    assert.deepEqual(originsOf(sitesOf('originExternal')), [
      [10, 'EXTERNAL', 'external-contracts@1.4.2 raw'],
      [12, 'EXTERNAL', 'external-contracts@1.4.2 makeGeneric()'],
      [15, 'EXTERNAL', 'external-contracts@1.4.2 subscribe(listener)'],
    ]);
  });

  it('LANGUAGE: a catch binding and a member of the language', () => {
    assert.deepEqual(originsOf(sitesOf('originLanguage')), [
      [7, 'LANGUAGE', 'catch binding'],
      [13, 'LANGUAGE', 'Error.cause'],
    ]);
  });

  it('UNRESOLVED: a package with no manifest is said so, not dropped', () => {
    assert.deepEqual(originsOf(sitesOf('originUnresolved')), [
      [
        5,
        'UNRESOLVED',
        'src/__tests__/unit/sources/__fixtures__/typeGate/node_modules/no-manifest/index.d.ts loose',
      ],
    ]);
  });
});

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
      [67, 'unknown'],
      [70, 'any'],
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

  it("a sink contract's own unknown is reported as covered by it; the same outside it is not covered", () => {
    assert.deepEqual(
      sitesOf('sinkContract').map((site) => [
        Number(site.where.split(':').pop()),
        site.boundary,
      ]),
      [
        [4, 'SINK_CONTRACTS'],
        [8, 'SINK_CONTRACTS'],
        [15, 'none'],
      ],
    );
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

  it('reports every unknown where it enters, by origin, and writes the report to the job summary', () => {
    process.stdout.write(`${originText(warnings)}\n`);
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary !== undefined && summary !== '') {
      try {
        fs.appendFileSync(summary, originMarkdown(warnings));
      } catch {
        // The summary is a report: a failed write fails nothing.
      }
    }
    assert.ok(warnings.every((site) => site.origin !== undefined));
  });

  it('names no listed, forced or classified site that is gone', () => {
    const keys = productionKeys();
    const forced = new Set(
      warnings
        .filter((site) => site.boundary === 'FORCED_BY_CONTRACT')
        .map((site) => site.key),
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
