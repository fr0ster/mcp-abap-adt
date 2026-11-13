/**
 * The test config is data from outside the type system: the harness parses it
 * once through its schema (`testConfigSchema.ts`) and reads it typed after.
 * The committed template must parse, every handler section of it included; a
 * key written with no value reads as absent; a value of the wrong type is
 * refused at its path, and so is a case whose params a test does not read as
 * it states them.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import * as yaml from 'js-yaml';
import * as z from 'zod';
import { repositoryRoot } from '../helpers/repoRoot';
import {
  handlerTestCases,
  parseTestConfig,
  readCaseParams,
  sharedDependenciesOf,
  stated,
} from '../integration/helpers/testConfigSchema';

const TEMPLATE = path.join(
  repositoryRoot(__dirname),
  'tests',
  'test-config.yaml.template',
);

describe('the test config schema', () => {
  it('parses the committed template, every handler section of it', () => {
    const config = parseTestConfig(
      yaml.load(fs.readFileSync(TEMPLATE, 'utf8')),
      TEMPLATE,
    );
    const sections = Object.keys(config).filter(
      (key) =>
        typeof config[key] === 'object' &&
        config[key] !== null &&
        'test_cases' in Object(config[key]),
    );
    assert.ok(sections.length > 40, `${sections.length} handler sections`);
    for (const section of sections) {
      assert.ok(handlerTestCases(config, section).length > 0, section);
    }
    const shared = config.shared_dependencies;
    assert.ok(shared);
    assert.ok(sharedDependenciesOf(shared, 'tables').length > 0);
  });

  it('reads a key written with no value as absent', () => {
    const config = parseTestConfig(
      { environment: { default_transport: null, default_package: 'ZPKG' } },
      'inline',
    );
    assert.equal(config.environment?.default_transport, undefined);
    assert.equal(config.environment?.default_package, 'ZPKG');
  });

  it('keeps what it does not name, and an empty file is an empty config', () => {
    const config = parseTestConfig({ environment: { ashost: 'h' } }, 'inline');
    assert.equal(config.environment?.ashost, 'h');
    assert.deepEqual(parseTestConfig(undefined, 'empty'), {});
  });

  it('refuses a value of the wrong type at its path, naming the file', () => {
    assert.throws(
      () =>
        parseTestConfig({ environment: { cleanup_after: 'yes' } }, 'f.yaml'),
      /^Error: f\.yaml is not a test config: environment\.cleanup_after: /,
    );
    const config = parseTestConfig(
      { create_class: { test_cases: [{ enabled: true }] } },
      'inline',
    );
    assert.throws(
      () => handlerTestCases(config, 'create_class'),
      /create_class section is not a handler's: test_cases\.0\.name: /,
    );
  });

  it("reads a case's params through the test's schema, refusing what does not fit", () => {
    const schema = z.looseObject({
      class_name: z.string(),
      length: z.number().optional(),
    });
    assert.deepEqual(
      readCaseParams({ class_name: 'ZCL', other: 1 }, schema, 'here'),
      { class_name: 'ZCL', other: 1 },
    );
    assert.throws(
      () => readCaseParams({ length: 3 }, schema, 'create_class'),
      /^Error: create_class: the test case's params are not what the test reads: class_name: /,
    );
  });

  it('refuses a value the case must state and does not', () => {
    assert.equal(stated('ZCL', 'class_name'), 'ZCL');
    assert.throws(
      () => stated(undefined, 'class_name'),
      /the test case states no class_name/,
    );
  });
});
