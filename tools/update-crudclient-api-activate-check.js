#!/usr/bin/env node
/**
 * Script to update activate, check, validate, delete methods to use config objects
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const SPECIFIC_FILE = process.argv.includes('--file')
  ? process.argv[process.argv.indexOf('--file') + 1]
  : null;

// Mapping of method names to their config object structure
const METHOD_MAPPINGS = {
  // Activate methods - single parameter (name)
  activateClass: { paramName: 'className', configKey: 'className' },
  activateInterface: { paramName: 'interfaceName', configKey: 'interfaceName' },
  activateProgram: { paramName: 'programName', configKey: 'programName' },
  activateTable: { paramName: 'tableName', configKey: 'tableName' },
  activateStructure: { paramName: 'structureName', configKey: 'structureName' },
  activateView: { paramName: 'viewName', configKey: 'viewName' },
  activateDataElement: { paramName: 'dataElementName', configKey: 'dataElementName' },
  activateFunctionModule: { paramName: 'functionModuleName', configKey: 'functionModuleName', secondParam: 'functionGroupName' },
  activateFunctionGroup: { paramName: 'functionGroupName', configKey: 'functionGroupName' },
  activateDomain: { paramName: 'domainName', configKey: 'domainName' },
  activateBehaviorDefinition: { paramName: 'name', configKey: 'name' },
  activateMetadataExtension: { paramName: 'name', configKey: 'name' },

  // Check methods - single parameter (name), some have optional version/sourceCode
  checkClass: { paramName: 'className', configKey: 'className' },
  checkInterface: { paramName: 'interfaceName', configKey: 'interfaceName' },
  checkProgram: { paramName: 'programName', configKey: 'programName' },
  checkTable: { paramName: 'tableName', configKey: 'tableName' },
  checkStructure: { paramName: 'structureName', configKey: 'structureName' },
  checkView: { paramName: 'viewName', configKey: 'viewName' },
  checkDataElement: { paramName: 'dataElementName', configKey: 'dataElementName' },
  checkFunctionModule: { paramName: 'functionModuleName', configKey: 'functionModuleName', secondParam: 'functionGroupName' },
  checkFunctionGroup: { paramName: 'functionGroupName', configKey: 'functionGroupName' },
  checkDomain: { paramName: 'domainName', configKey: 'domainName' },
  checkBehaviorDefinition: { paramName: 'name', configKey: 'name' },
  checkMetadataExtension: { paramName: 'name', configKey: 'name' },
  checkPackage: { paramName: 'packageName', configKey: 'packageName', secondParam: 'superPackage' },

  // Validate methods - single parameter (name) or with package/description
  validateClass: { paramName: 'className', configKey: 'className', needsPackage: true },
  validateInterface: { paramName: 'interfaceName', configKey: 'interfaceName', needsPackage: true },
  validateProgram: { paramName: 'programName', configKey: 'programName', needsPackage: true },
  validateTable: { paramName: 'tableName', configKey: 'tableName', needsPackage: true },
  validateStructure: { paramName: 'structureName', configKey: 'structureName', needsPackage: true },
  validateView: { paramName: 'viewName', configKey: 'viewName', needsPackage: true },
  validateDataElement: { paramName: 'dataElementName', configKey: 'dataElementName', needsPackage: true },
  validateFunctionModule: { paramName: 'functionModuleName', configKey: 'functionModuleName', secondParam: 'functionGroupName', needsPackage: true },
  validateFunctionGroup: { paramName: 'functionGroupName', configKey: 'functionGroupName', needsDescription: true },
  validateDomain: { paramName: 'domainName', configKey: 'domainName', needsPackage: true },
  validateBehaviorDefinition: { paramName: 'name', configKey: 'name' },
  validateMetadataExtension: { paramName: 'name', configKey: 'name' },
  validatePackage: { paramName: 'packageName', configKey: 'packageName', secondParam: 'superPackage', needsDescription: true },

  // Delete methods - name and optional transportRequest
  deleteClass: { paramName: 'className', configKey: 'className', needsTransport: true },
  deleteInterface: { paramName: 'interfaceName', configKey: 'interfaceName', needsTransport: true },
  deleteProgram: { paramName: 'programName', configKey: 'programName', needsTransport: true },
  deleteTable: { paramName: 'tableName', configKey: 'tableName', needsTransport: true },
  deleteStructure: { paramName: 'structureName', configKey: 'structureName', needsTransport: true },
  deleteView: { paramName: 'viewName', configKey: 'viewName', needsTransport: true },
  deleteDataElement: { paramName: 'dataElementName', configKey: 'dataElementName', needsTransport: true },
  deleteFunctionModule: { paramName: 'functionModuleName', configKey: 'functionModuleName', secondParam: 'functionGroupName', needsTransport: true },
  deleteFunctionGroup: { paramName: 'functionGroupName', configKey: 'functionGroupName', needsTransport: true },
  deleteBehaviorDefinition: { paramName: 'name', configKey: 'name' },
  deleteMetadataExtension: { paramName: 'name', configKey: 'name' },
};

function updateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  let changes = [];

  for (const [methodName, mapping] of Object.entries(METHOD_MAPPINGS)) {
    // Pattern 1: await client.methodName(param)
    const pattern1 = new RegExp(
      `(await\\s+client\\.${methodName}\\s*\\(\\s*)([^,)]+)(\\s*\\))`,
      'g'
    );

    // Pattern 2: client.methodName(param) without await
    const pattern2 = new RegExp(
      `(client\\.${methodName}\\s*\\(\\s*)([^,)]+)(\\s*\\))`,
      'g'
    );

    // Pattern 3: methodName(param, param2) - for methods with two parameters
    const pattern3 = new RegExp(
      `(await\\s+)?client\\.${methodName}\\s*\\(\\s*([^,]+),\\s*([^,)]+)\\s*\\)`,
      'g'
    );

    // Pattern 4: methodName(param, param2, param3) - for methods with three parameters
    const pattern4 = new RegExp(
      `(await\\s+)?client\\.${methodName}\\s*\\(\\s*([^,]+),\\s*([^,]+),\\s*([^,)]+)\\s*\\)`,
      'g'
    );

    // Pattern 5: methodName with many parameters (like createBehaviorDefinition)
    const pattern5 = new RegExp(
      `(await\\s+)?client\\.${methodName}\\s*\\(\\s*([^)]+)\\s*\\)`,
      'g'
    );

    for (const pattern of [pattern1, pattern2, pattern3, pattern4, pattern5]) {
      let lastContent = '';
      let iterations = 0;
      while (content !== lastContent && iterations < 10) {
        lastContent = content;
        iterations++;
        content = content.replace(pattern, (match, awaitPart, ...args) => {
          // Skip if already using object syntax
          if (match.includes(`{ ${mapping.configKey}:`) || match.includes(`{${mapping.configKey}:`)) {
            return match;
          }

          // Skip if this is a nested call (already replaced)
          if (match.includes('client.activateClass({') || match.includes('client.checkClass({')) {
            return match;
          }

        // Extract parameters
        let params = [];
        if (args.length > 0) {
          // For pattern5, args[0] is the full parameter string
          if (args[0] && typeof args[0] === 'string' && args[0].includes(',')) {
            params = args[0].split(',').map(p => p.trim());
          } else {
            params = args.filter(p => p && typeof p === 'string' && p.trim()).map(p => p.trim());
          }
        }

        if (params.length === 0) {
          return match;
        }

        try {
          const firstParam = params[0];
          let configObj;

          if (mapping.secondParam && params.length > 1) {
            // Two parameters
            configObj = `{ ${mapping.configKey}: ${firstParam}, ${mapping.secondParam}: ${params[1]} }`;
          } else {
            // Single parameter
            if (mapping.needsPackage || mapping.needsDescription) {
              // For validate methods, we need package/description, but they might not be provided
              // Use empty strings as defaults
              const packagePart = mapping.needsPackage ? `packageName: '', ` : '';
              const descPart = mapping.needsDescription ? `description: '', ` : '';
              configObj = `{ ${mapping.configKey}: ${firstParam}${packagePart ? ', ' + packagePart : ''}${descPart ? descPart : ''} }`.replace(/, }$/, ' }');
            } else {
              configObj = `{ ${mapping.configKey}: ${firstParam} }`;
            }
          }

          // For delete methods with transportRequest
          if (mapping.needsTransport && params.length > 1) {
            configObj = configObj.replace(' }', `, transportRequest: ${params[params.length - 1]} }`);
          }

          // For check methods with optional version/sourceCode
          if (methodName.startsWith('check') && params.length > 1) {
            // Keep additional parameters after config object
            const additionalParams = params.slice(1).join(', ');
            const newCall = awaitPart
              ? `${awaitPart || ''}client.${methodName}(${configObj}, ${additionalParams})`
              : `client.${methodName}(${configObj}, ${additionalParams})`;
            changes.push(`${methodName}: ${match.substring(0, 50)}... -> ${newCall.substring(0, 50)}...`);
            modified = true;
            return newCall;
          }

          const newCall = awaitPart
            ? `${awaitPart || ''}client.${methodName}(${configObj})`
            : `client.${methodName}(${configObj})`;

          changes.push(`${methodName}: ${match.substring(0, 50)}... -> ${newCall.substring(0, 50)}...`);
          modified = true;
          return newCall;
        } catch (e) {
          console.warn(`  ⚠️  Could not parse ${methodName}: ${e.message}`);
          return match;
        }
        });
      }
    }
  }

  if (modified) {
    if (!DRY_RUN) {
      fs.writeFileSync(filePath, content, 'utf8');
    }
    return { modified: true, changes };
  }

  return { modified: false, changes: [] };
}

function findHandlerFiles() {
  const handlersDir = path.join(__dirname, '..', 'src', 'handlers');
  const files = [];

  function walkDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        files.push(fullPath);
      }
    }
  }

  walkDir(handlersDir);
  return files;
}

function main() {
  console.log('🔄 Updating activate/check/validate/delete methods...\n');
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No files will be modified\n');
  }

  const files = SPECIFIC_FILE
    ? [path.resolve(SPECIFIC_FILE)]
    : findHandlerFiles();

  let totalModified = 0;

  for (const file of files) {
    const relativePath = path.relative(process.cwd(), file);
    const result = updateFile(file);

    if (result.modified) {
      totalModified++;
      console.log(`✅ ${relativePath}`);
      if (result.changes.length > 0 && result.changes.length <= 5) {
        result.changes.forEach(change => console.log(`   ${change}`));
      } else if (result.changes.length > 5) {
        console.log(`   ${result.changes.length} change(s)`);
      }
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Files processed: ${files.length}`);
  console.log(`   Files modified: ${totalModified}`);

  if (DRY_RUN && totalModified > 0) {
    console.log(`\n💡 Run without --dry-run to apply changes`);
  }

  if (totalModified > 0 && !DRY_RUN) {
    console.log(`\n✨ Changes applied successfully!`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { updateFile, METHOD_MAPPINGS };

