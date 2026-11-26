/**
 * `HandlerSystem`'s ATC reads, live, on both systems: `atc_findings`,
 * `atc_results` and `atc_result`, each through the server's dispatch
 * (`throughServer`) — with `background: false` in the call, and without
 * `background` as a run read once with `HandlerBackgroundRunGet`.
 *
 * What they read is one ATC run of the test config's `run_atc`
 * `default_variant` case (as `readOnly/atc/AtcHandlers.test.ts` runs it): a
 * shared object checked with the system's DEFAULT variant, `RunATC` with
 * `wait`, once for the file. ATC reads the object and changes nothing in
 * it; the run's worklist and stored result are SAP's (the same as that
 * suite's runs leave).
 *
 * - `atc_findings`: the run's worklist, its findings held to their shape and
 *   to the case's `min_findings`;
 * - `atc_results`: every user's results of the last day, the run's among
 *   them (by its title, the object's name);
 * - `atc_result`: the newest of those, by its display id.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getTestCase } from '../helpers/configHelpers';
import {
  type LiveAnswer,
  liveCall,
  livePrepare,
  liveSuite,
  throughServer,
} from '../helpers/live';
import { member, payloadOf, succeeded } from './ownObjects';
import { finishedRun, startedRun } from './systemRuns';

/** The `run_atc` `default_variant` case's parameters. */
interface AtcCase {
  readonly objectName: string;
  readonly objectType: string;
  readonly checkVariant: string;
  readonly maxFindings: number;
  readonly minFindings: number;
}

/** A text the case states, or the case fails naming it. */
function statedText(params: unknown, field: string): string {
  const value = member(params, field);
  if (typeof value !== 'string' || value === '') {
    throw new Error(`run_atc.default_variant names no ${field}`);
  }
  return value;
}

/** A count the case states, else `fallback`. */
function statedCount(params: unknown, field: string, fallback: number): number {
  const value = member(params, field);
  return typeof value === 'number' ? value : fallback;
}

function atcCase(): AtcCase {
  const params = getTestCase('run_atc', 'default_variant')?.params;
  if (params === undefined) {
    throw new Error(
      'the test config holds no run_atc.test_cases[name=default_variant]',
    );
  }
  return {
    objectName: statedText(params, 'object_name'),
    objectType: statedText(params, 'object_type'),
    checkVariant: statedText(params, 'check_variant'),
    maxFindings: statedCount(params, 'max_findings', 100),
    minFindings: statedCount(params, 'min_findings', 0),
  };
}

/** The run of the file: `RunATC` with `wait`, once; its worklist id. */
let run: Promise<string> | undefined;

function worklist(): Promise<string> {
  run ??= (async () => {
    const atc = atcCase();
    const done = await livePrepare('RunATC', {
      objects: [{ name: atc.objectName, type: atc.objectType }],
      check_variant: atc.checkVariant,
      max_findings: atc.maxFindings,
      wait: true,
    });
    const payload = payloadOf(succeeded('RunATC', done));
    assert.equal(member(payload, 'waited'), true);
    const id = member(payload, 'worklist_id');
    if (typeof id !== 'string' || id === '') {
      throw new Error(`RunATC answered no worklist_id: ${done.text}`);
    }
    return id;
  })();
  return run;
}

/** The run's stored result: the newest of the last day's titled with the object's name. */
let stored: Promise<string> | undefined;

function storedResult(): Promise<string> {
  stored ??= (async () => {
    await worklist();
    const listed = await livePrepare('ListATCResults', {
      // The fields read below: the JSON of detail medium.
      detail: 'medium',
      created_by: '*',
      age_min: 0,
      age_max: 1,
      background: false,
    });
    const ours = resultsOf(succeeded('ListATCResults', listed));
    const newest = ours.reduce<unknown>(
      (found, each) =>
        found === undefined ||
        String(member(each, 'created_at')) > String(member(found, 'created_at'))
          ? each
          : found,
      undefined,
    );
    const id = member(newest, 'display_id');
    if (typeof id !== 'string' || id === '') {
      throw new Error(`no stored result of ${atcCase().objectName}`);
    }
    return id;
  })();
  return stored;
}

/** A findings answer of the run's worklist: its shape, and at least the case's count. */
async function expectFindings(answer: LiveAnswer): Promise<void> {
  const data = payloadOf(succeeded('HandlerSystem atc_findings', answer));
  assert.equal(member(data, 'worklist_id'), await worklist());
  const checked = member(data, 'objects_checked');
  assert.ok(typeof checked === 'number' && checked >= 1);
  const findings = member(data, 'findings');
  if (!Array.isArray(findings)) throw new Error('no findings list');
  assert.equal(member(data, 'finding_count'), findings.length);
  assert.ok(findings.length >= atcCase().minFindings);
  for (const finding of findings) {
    assert.equal(typeof member(finding, 'object'), 'string');
    assert.equal(typeof member(finding, 'object_type'), 'string');
    assert.equal(typeof member(finding, 'check'), 'string');
    assert.equal(typeof member(finding, 'message'), 'string');
  }
}

/** The results a list answer holds of the case's object (by title); the list's count checked. */
function resultsOf(answer: LiveAnswer): unknown[] {
  const list = payloadOf(answer);
  const results = member(list, 'results');
  if (!Array.isArray(results)) throw new Error('no results list');
  assert.equal(member(list, 'result_count'), results.length);
  return results.filter(
    (result) => member(result, 'title') === atcCase().objectName,
  );
}

/** A results list holding the run's result. */
function expectListed(answer: LiveAnswer): void {
  const ours = resultsOf(succeeded('HandlerSystem atc_results', answer));
  assert.ok(ours.length >= 1, `no result titled ${atcCase().objectName}`);
}

/** One stored result: the one asked, of the case's object, its findings counted. */
async function expectResult(answer: LiveAnswer): Promise<void> {
  const result = payloadOf(succeeded('HandlerSystem atc_result', answer));
  assert.equal(member(result, 'display_id'), await storedResult());
  assert.equal(member(result, 'title'), atcCase().objectName);
  const findings = member(result, 'findings');
  if (!Array.isArray(findings)) throw new Error('no findings list');
  assert.equal(member(result, 'finding_count'), findings.length);
}

liveSuite(['onprem', 'cloud'], 'HandlerSystem ATC reads', () => {
  describe('through the server', () => {
    throughServer();

    it('atc_findings with background false reads the run worklist in the call', async () => {
      const answer = await liveCall('HandlerSystem', {
        // The fields read below: the JSON of detail medium.
        detail: 'medium',
        action: 'atc_findings',
        worklist_id: await worklist(),
        background: false,
      });
      await expectFindings(answer);
    });

    it('atc_findings without background starts a run, whose answer HandlerBackgroundRunGet reads once', async () => {
      const started = await liveCall('HandlerSystem', {
        // The fields read below: the JSON of detail medium.
        detail: 'medium',
        action: 'atc_findings',
        worklist_id: await worklist(),
      });
      await expectFindings(await finishedRun(startedRun(started)));
    });

    it('atc_results with background false lists the run result in the call', async () => {
      await worklist();
      const answer = await liveCall('HandlerSystem', {
        // The fields read below: the JSON of detail medium.
        detail: 'medium',
        action: 'atc_results',
        created_by: '*',
        age_min: 0,
        age_max: 1,
        background: false,
      });
      expectListed(answer);
    });

    it('atc_results without background starts a run, whose answer HandlerBackgroundRunGet reads once', async () => {
      await worklist();
      const started = await liveCall('HandlerSystem', {
        // The fields read below: the JSON of detail medium.
        detail: 'medium',
        action: 'atc_results',
        created_by: '*',
        age_min: 0,
        age_max: 1,
      });
      expectListed(await finishedRun(startedRun(started)));
    });

    it('atc_result with background false reads the stored result in the call', async () => {
      const answer = await liveCall('HandlerSystem', {
        // The fields read below: the JSON of detail medium.
        detail: 'medium',
        action: 'atc_result',
        display_id: await storedResult(),
        background: false,
      });
      await expectResult(answer);
    });

    it('atc_result without background starts a run, whose answer HandlerBackgroundRunGet reads once', async () => {
      const started = await liveCall('HandlerSystem', {
        // The fields read below: the JSON of detail medium.
        detail: 'medium',
        action: 'atc_result',
        display_id: await storedResult(),
      });
      await expectResult(await finishedRun(startedRun(started)));
    });
  });
});
