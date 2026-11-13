/**
 * The test config's schema: `tests/test-config.yaml` (or the file
 * `MCP_TEST_CONFIG` names) is data from outside the type system, so it is
 * parsed once, here, and typed after. Every object is loose — a key the
 * schema does not name is kept as it is, so a config with more than the
 * harness reads still parses — and a value the schema names must have the
 * type it states; `null` (a key written with no value) reads as absent.
 *
 * A handler section (`create_class`, `whereused_readonly`, …) is read by its
 * name when a test asks for it (`handlerTestCases`), not at the load: the
 * config's top level holds every handler's section beside the settings.
 */
import * as z from 'zod';

/** `schema`, or absent: a key written with no value (`null`) reads as absent. */
function absent<S extends z.ZodType>(schema: S) {
  return z.preprocess(
    (value) => (value === null ? undefined : value),
    schema.optional(),
  );
}

const text = absent(z.string());
const flag = absent(z.boolean());
const count = absent(z.number());

/** A test case's parameters: whatever the case states, read by the test that runs it. */
export const caseParamsSchema = z.record(z.string(), z.unknown());

export type CaseParams = z.output<typeof caseParamsSchema>;

export const testCaseSchema = z.looseObject({
  name: z.string(),
  enabled: flag,
  description: text,
  available_in: absent(z.array(z.string())),
  params: absent(caseParamsSchema),
  params_groups: absent(z.record(z.string(), caseParamsSchema)),
});

export type TestCase = z.output<typeof testCaseSchema>;

export const handlerSectionSchema = z.looseObject({
  test_cases: absent(z.array(testCaseSchema)),
});

const hardModeSchema = z.looseObject({
  enabled: flag,
  transport: text,
  mcp_destination: text,
  launch_http: flag,
  name_suffix: text,
});

/** One object of `shared_dependencies.<kind>`. */
export const sharedDependencySchema = z.looseObject({
  name: z.string(),
  description: text,
  available_in: absent(z.array(z.string())),
  source: text,
  group: text,
  test_classes: text,
  root_entity: text,
  implementation_type: absent(
    z.enum(['Managed', 'Unmanaged', 'Abstract', 'Projection']),
  ),
  base_structure: text,
  datatype: text,
  type_kind: text,
  type_name: text,
  short_label: text,
  medium_label: text,
  long_label: text,
  heading_label: text,
  length: count,
  decimals: count,
});

export type SharedDependency = z.output<typeof sharedDependencySchema>;

const dependencies = absent(z.array(sharedDependencySchema));

export const sharedDependenciesSchema = z.looseObject({
  package: text,
  super_package: text,
  software_component: text,
  transport_layer: text,
  transport_request: text,
  record_changes: flag,
  tables: dependencies,
  structures: dependencies,
  append_structures: dependencies,
  views: dependencies,
  behavior_definitions: dependencies,
  classes: dependencies,
  function_groups: dependencies,
  function_modules: dependencies,
  service_definitions: dependencies,
  domains: dependencies,
  data_elements: dependencies,
  interfaces: dependencies,
  programs: dependencies,
  metadata_extensions: dependencies,
});

export type SharedDependencies = z.output<typeof sharedDependenciesSchema>;

export const testConfigSchema = z.looseObject({
  test_settings: absent(
    z.looseObject({
      fail_fast: flag,
      verbose: flag,
      cleanup_after_test: flag,
      cleanup_on_failure: flag,
    }),
  ),
  environment: absent(
    z.looseObject({
      env: text,
      system_type: text,
      connection_type: text,
      default_package: text,
      default_transport: text,
      default_master_system: text,
      default_responsible: text,
      database_system: text,
      cleanup_after: flag,
      skip_cleanup: flag,
      use_auth_broker: flag,
      integration_hard_mode: absent(hardModeSchema),
    }),
  ),
  integration_hard_mode: absent(hardModeSchema),
  auth_broker: absent(
    z.looseObject({
      use_auth_broker: flag,
      unsafe: flag,
      unsafe_session_store: flag,
      browser: text,
      browser_auth_port: count,
      paths: absent(z.looseObject({ service_keys_dir: text })),
    }),
  ),
  shared_dependencies: absent(sharedDependenciesSchema),
  shared_objects: absent(z.record(z.string(), caseParamsSchema)),
  params_groups: absent(z.record(z.string(), caseParamsSchema)),
  create_transported_object: absent(
    z.looseObject({
      enabled: flag,
      transport_request: text,
      package_name: text,
      class_name: text,
    }),
  ),
});

export type TestConfig = z.output<typeof testConfigSchema>;

/** The issues of a parse that failed, each at its path, for a refusal's words. */
function issueWords(issues: readonly z.core.$ZodIssue[]): string {
  return issues
    .map((issue) =>
      issue.path.length === 0
        ? issue.message
        : `${issue.path.map(String).join('.')}: ${issue.message}`,
    )
    .join('; ');
}

/**
 * `document` (what YAML read from `file`) as the test config; an empty file
 * is an empty config. Refused, naming each issue, when it is not one.
 */
export function parseTestConfig(document: unknown, file: string): TestConfig {
  const parsed = testConfigSchema.safeParse(document ?? {});
  if (!parsed.success) {
    throw new Error(
      `${file} is not a test config: ${issueWords(parsed.error.issues)}`,
    );
  }
  return parsed.data;
}

/** The test cases of `handler`'s section of `config`; none when it has no section. */
export function handlerTestCases(
  config: TestConfig,
  handler: string,
): TestCase[] {
  const section = config[handler];
  if (section === undefined || section === null) return [];
  const parsed = handlerSectionSchema.safeParse(section);
  if (!parsed.success) {
    throw new Error(
      `The test config's ${handler} section is not a handler's: ${issueWords(parsed.error.issues)}`,
    );
  }
  return parsed.data.test_cases ?? [];
}

/** The objects of `shared_dependencies.<kind>`; none when the kind is not a list. */
export function sharedDependenciesOf(
  shared: SharedDependencies,
  kind: string,
): SharedDependency[] {
  const parsed = z.array(sharedDependencySchema).safeParse(shared[kind]);
  return parsed.success ? parsed.data : [];
}

/**
 * A case's parameters as `schema` reads them: what the test that runs the
 * case needs, checked once. Refused, naming each issue and `where`, when the
 * case does not state them as the test needs.
 */
export function readCaseParams<S extends z.ZodType>(
  params: CaseParams | undefined,
  schema: S,
  where: string,
): z.output<S> {
  const parsed = schema.safeParse(params ?? {});
  if (!parsed.success) {
    throw new Error(
      `${where}: the test case's params are not what the test reads: ${issueWords(parsed.error.issues)}`,
    );
  }
  return parsed.data;
}

/** `value`, which the test case must state as `what`; refused, naming it, when it does not. */
export function stated<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new Error(`the test case states no ${what}`);
  }
  return value;
}
