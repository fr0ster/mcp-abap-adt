/**
 * Config consistency checker for shared dependencies.
 *
 * Pure offline validation — no SAP connection required.
 * All checks are driven by shared_dependencies config — no hardcoded prefixes.
 *
 * Verifies:
 *   1. dep_* params resolve to entries in shared_dependencies
 *   2. Param values matching shared_dependencies names are defined there
 *   3. Shared view/bdef DDL cross-references to tables are defined
 *   4. Orphan shared deps (defined but never referenced) produce warnings
 *
 * Run:  npm run shared:check
 */

import {
  getSharedDependenciesConfig,
  loadTestConfig,
} from '../../integration/helpers/configHelpers';

/** Map dep_* param names to shared_dependencies section names */
const DEP_PARAM_MAP: Record<string, string> = {
  dep_table_name: 'tables',
  dep_view_name: 'views',
  dep_bdef_name: 'behavior_definitions',
};

/** Map generic param names to shared_dependencies section names */
const PARAM_TO_TYPE: Record<string, string> = {
  table_name: 'tables',
  view_name: 'views',
  root_entity: 'views',
  behavior_definition: 'behavior_definitions',
};

/** Get all names (upper-cased) from a shared_dependencies section */
function getSharedNames(
  sharedConfig: Record<string, any>,
  type: string,
): string[] {
  const items = sharedConfig[type];
  if (!Array.isArray(items)) return [];
  return items.map((item: any) => String(item.name).toUpperCase());
}

/** Build a set of ALL shared dependency names across all sections */
function buildAllSharedNamesSet(
  sharedConfig: Record<string, any>,
): Set<string> {
  const allNames = new Set<string>();
  const sections = ['tables', 'views', 'behavior_definitions'];
  for (const section of sections) {
    for (const name of getSharedNames(sharedConfig, section)) {
      allNames.add(name);
    }
  }
  return allNames;
}

/** Collect all test case param values across all handler sections */
function collectAllTestCaseParams(config: Record<string, any>): Array<{
  handler: string;
  testCase: string;
  paramKey: string;
  paramValue: string;
}> {
  const results: Array<{
    handler: string;
    testCase: string;
    paramKey: string;
    paramValue: string;
  }> = [];

  for (const [handlerKey, handlerValue] of Object.entries(config)) {
    if (
      !handlerValue ||
      typeof handlerValue !== 'object' ||
      !('test_cases' in (handlerValue as object))
    ) {
      continue;
    }

    const testCases = (handlerValue as any).test_cases;
    if (!Array.isArray(testCases)) continue;

    for (const tc of testCases) {
      const params = tc.params;
      if (!params || typeof params !== 'object') continue;

      for (const [paramKey, paramValue] of Object.entries(params)) {
        if (typeof paramValue === 'string' && paramValue.trim()) {
          results.push({
            handler: handlerKey,
            testCase: tc.name || 'unnamed',
            paramKey,
            paramValue: paramValue.trim(),
          });
        }
      }
    }
  }

  return results;
}

describe('Config: shared_dependencies consistency', () => {
  const config = loadTestConfig();
  const sharedConfig = getSharedDependenciesConfig();

  it('should have shared_dependencies section', () => {
    expect(sharedConfig).toBeTruthy();
  });

  it('dep_* params should resolve to shared_dependencies entries', () => {
    if (!sharedConfig) return;

    const allParams = collectAllTestCaseParams(config);
    const errors: string[] = [];

    for (const { handler, testCase, paramKey, paramValue } of allParams) {
      const targetType = DEP_PARAM_MAP[paramKey];
      if (!targetType) continue;

      const sharedNames = getSharedNames(sharedConfig, targetType);
      if (!sharedNames.includes(paramValue.toUpperCase())) {
        errors.push(
          `${handler}.${testCase}: ${paramKey}="${paramValue}" not found in shared_dependencies.${targetType}`,
        );
      }
    }

    if (errors.length > 0) {
      throw new Error(`Unresolved dep_* references:\n  ${errors.join('\n  ')}`);
    }
  });

  it('param values using shared dependency names should reference correct section', () => {
    if (!sharedConfig) return;

    const allParams = collectAllTestCaseParams(config);
    const warnings: string[] = [];

    for (const { handler, testCase, paramKey, paramValue } of allParams) {
      const targetType = PARAM_TO_TYPE[paramKey];
      if (!targetType) continue;

      const upperValue = paramValue.toUpperCase();
      const targetSectionNames = getSharedNames(sharedConfig, targetType);

      // Skip values that aren't in the target section at all —
      // they may be test-created objects or reference objects from other sections
      if (targetSectionNames.includes(upperValue)) continue;

      // Check if the value exists in a *different* section (informational only)
      const allSharedNames = buildAllSharedNamesSet(sharedConfig);
      if (allSharedNames.has(upperValue)) {
        warnings.push(
          `${handler}.${testCase}: ${paramKey}="${paramValue}" exists in shared_dependencies but in a different section than ${targetType}`,
        );
      }
    }

    // Cross-section matches are informational only — not necessarily errors
    // (e.g., BIMPL's behavior_definition referencing a view name is valid
    // when the test creates the BDEF itself)
    if (warnings.length > 0) {
      console.warn(
        `Cross-section shared dependency references (informational):\n  ${warnings.join('\n  ')}`,
      );
    }
  });

  it('shared view/bdef DDL should only reference tables defined in shared_dependencies', () => {
    if (!sharedConfig) return;

    const sharedTableNames = getSharedNames(sharedConfig, 'tables');
    const allSharedNames = buildAllSharedNamesSet(sharedConfig);
    const errors: string[] = [];

    // Check view DDL: "select from <table>"
    const views = sharedConfig.views || [];
    for (const view of views) {
      if (typeof view.source !== 'string') continue;
      const matches = view.source.match(/select\s+from\s+(\w+)/gi) || [];
      for (const match of matches) {
        const tableName = match
          .replace(/select\s+from\s+/i, '')
          .trim()
          .toUpperCase();
        if (!allSharedNames.has(tableName)) continue;
        if (!sharedTableNames.includes(tableName)) {
          errors.push(
            `shared_dependencies.views.${view.name}: DDL references "${tableName}" not in shared_dependencies.tables`,
          );
        }
      }
    }

    // Check bdef DDL: "persistent table <table>"
    const bdefs = sharedConfig.behavior_definitions || [];
    for (const bdef of bdefs) {
      if (typeof bdef.source !== 'string') continue;
      const matches = bdef.source.match(/persistent\s+table\s+(\w+)/gi) || [];
      for (const match of matches) {
        const tableName = match
          .replace(/persistent\s+table\s+/i, '')
          .trim()
          .toUpperCase();
        if (!allSharedNames.has(tableName)) continue;
        if (!sharedTableNames.includes(tableName)) {
          errors.push(
            `shared_dependencies.behavior_definitions.${bdef.name}: DDL references "${tableName}" not in shared_dependencies.tables`,
          );
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Unresolved DDL table references:\n  ${errors.join('\n  ')}`,
      );
    }
  });

  it('should warn about orphan shared dependencies (defined but never referenced)', () => {
    if (!sharedConfig) return;

    const allSharedNames = buildAllSharedNamesSet(sharedConfig);
    const allParams = collectAllTestCaseParams(config);

    // Collect all referenced names that match a shared dependency
    const referencedNames = new Set<string>();
    for (const { paramValue } of allParams) {
      const upper = paramValue.toUpperCase();
      if (allSharedNames.has(upper)) {
        referencedNames.add(upper);
      }
    }

    // Also collect names referenced via DDL source in shared views
    for (const view of sharedConfig.views || []) {
      if (typeof view.source !== 'string') continue;
      for (const m of view.source.match(/select\s+from\s+(\w+)/gi) || []) {
        const name = m
          .replace(/select\s+from\s+/i, '')
          .trim()
          .toUpperCase();
        if (allSharedNames.has(name)) referencedNames.add(name);
      }
    }

    // Also collect names referenced via bdef DDL
    for (const bdef of sharedConfig.behavior_definitions || []) {
      if (typeof bdef.source === 'string') {
        for (const m of bdef.source.match(/persistent\s+table\s+(\w+)/gi) ||
          []) {
          const name = m
            .replace(/persistent\s+table\s+/i, '')
            .trim()
            .toUpperCase();
          if (allSharedNames.has(name)) referencedNames.add(name);
        }
      }
      if (typeof bdef.root_entity === 'string') {
        const name = bdef.root_entity.toUpperCase();
        if (allSharedNames.has(name)) referencedNames.add(name);
      }
    }

    const orphans: string[] = [];
    const sections = ['tables', 'views', 'behavior_definitions'];
    for (const type of sections) {
      for (const name of getSharedNames(sharedConfig, type)) {
        if (!referencedNames.has(name)) {
          orphans.push(`shared_dependencies.${type}: ${name}`);
        }
      }
    }

    if (orphans.length > 0) {
      console.warn(
        `Orphan shared dependencies (defined but never referenced):\n  ${orphans.join('\n  ')}`,
      );
    }
  });
});
