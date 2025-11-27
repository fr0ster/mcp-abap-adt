#!/usr/bin/env node
/**
 * Script to update CrudClient API calls from positional parameters to config objects
 *
 * Usage: node tools/update-crudclient-api.js [--dry-run] [--file <path>]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DRY_RUN = process.argv.includes('--dry-run');
const SPECIFIC_FILE = process.argv.includes('--file')
  ? process.argv[process.argv.indexOf('--file') + 1]
  : null;

// Mapping of old method signatures to new config object structure
const METHOD_MAPPINGS = {
  // Create methods
  createClass: {
    params: ['className', 'description', 'packageName', 'transportRequest', 'options'],
    config: (args) => {
      const [className, description, packageName, transportRequest, options] = args;
      const config = {
        className,
        description,
        packageName,
        transportRequest,
        ...(options || {})
      };
      return `{ ${Object.entries(config).filter(([_, v]) => v !== undefined).map(([k, v]) => {
        if (typeof v === 'string') return `${k}: ${v}`;
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          return `${k}: ${JSON.stringify(v).replace(/"/g, '')}`;
        }
        return `${k}: ${v}`;
      }).join(', ')} }`;
    }
  },
  createInterface: {
    params: ['interfaceName', 'description', 'packageName', 'transportRequest', 'options'],
    config: (args) => {
      const [interfaceName, description, packageName, transportRequest, options] = args;
      return `{ interfaceName: ${interfaceName}, description: ${description}, packageName: ${packageName}, transportRequest: ${transportRequest}${options ? `, ...${options}` : ''} }`;
    }
  },
  createProgram: {
    params: ['programName', 'description', 'packageName', 'transportRequest', 'options'],
    config: (args) => {
      const [programName, description, packageName, transportRequest, options] = args;
      return `{ programName: ${programName}, description: ${description}, packageName: ${packageName}, transportRequest: ${transportRequest}${options ? `, ...${options}` : ''} }`;
    }
  },
  createFunctionModule: {
    params: ['functionModuleName', 'functionGroupName', 'description', 'packageName', 'sourceCode', 'transportRequest'],
    config: (args) => {
      const [functionModuleName, functionGroupName, description, packageName, sourceCode, transportRequest] = args;
      return `{ functionModuleName: ${functionModuleName}, functionGroupName: ${functionGroupName}, description: ${description}, packageName: ${packageName}, sourceCode: ${sourceCode}, transportRequest: ${transportRequest} }`;
    }
  },
  createFunctionGroup: {
    params: ['functionGroupName', 'description', 'packageName', 'transportRequest'],
    config: (args) => {
      const [functionGroupName, description, packageName, transportRequest] = args;
      return `{ functionGroupName: ${functionGroupName}, description: ${description}, packageName: ${packageName}, transportRequest: ${transportRequest} }`;
    }
  },
  createTable: {
    params: ['tableName', 'description', 'packageName', 'ddlCode', 'transportRequest'],
    config: (args) => {
      const [tableName, description, packageName, ddlCode, transportRequest] = args;
      return `{ tableName: ${tableName}, description: ${description}, packageName: ${packageName}, ddlCode: ${ddlCode}, transportRequest: ${transportRequest} }`;
    }
  },
  createStructure: {
    params: ['structureName', 'description', 'packageName', 'ddlCode', 'transportRequest'],
    config: (args) => {
      const [structureName, description, packageName, ddlCode, transportRequest] = args;
      return `{ structureName: ${structureName}, description: ${description}, packageName: ${packageName}, ddlCode: ${ddlCode}, transportRequest: ${transportRequest} }`;
    }
  },
  createView: {
    params: ['viewName', 'description', 'packageName', 'ddlCode', 'transportRequest'],
    config: (args) => {
      const [viewName, description, packageName, ddlCode, transportRequest] = args;
      return `{ viewName: ${viewName}, description: ${description}, packageName: ${packageName}, ddlCode: ${ddlCode}, transportRequest: ${transportRequest} }`;
    }
  },
  createDataElement: {
    params: ['dataElementName', 'description', 'packageName', 'typeKind', 'transportRequest'],
    config: (args) => {
      const [dataElementName, description, packageName, typeKind, transportRequest] = args;
      return `{ dataElementName: ${dataElementName}, description: ${description}, packageName: ${packageName}, typeKind: ${typeKind}, transportRequest: ${transportRequest} }`;
    }
  },

  // Lock methods (all take single name parameter)
  lockClass: { params: ['className'], config: (args) => `{ className: ${args[0]} }` },
  lockInterface: { params: ['interfaceName'], config: (args) => `{ interfaceName: ${args[0]} }` },
  lockProgram: { params: ['programName'], config: (args) => `{ programName: ${args[0]} }` },
  lockTable: { params: ['tableName'], config: (args) => `{ tableName: ${args[0]} }` },
  lockStructure: { params: ['structureName'], config: (args) => `{ structureName: ${args[0]} }` },
  lockView: { params: ['viewName'], config: (args) => `{ viewName: ${args[0]} }` },
  lockDataElement: { params: ['dataElementName'], config: (args) => `{ dataElementName: ${args[0]} }` },
  lockFunctionModule: { params: ['functionModuleName', 'functionGroupName'], config: (args) => `{ functionModuleName: ${args[0]}, functionGroupName: ${args[1]} }` },
  lockFunctionGroup: { params: ['functionGroupName'], config: (args) => `{ functionGroupName: ${args[0]} }` },
  lockBehaviorDefinition: { params: ['name'], config: (args) => `{ name: ${args[0]} }` },
  lockMetadataExtension: { params: ['name'], config: (args) => `{ name: ${args[0]} }` },

  // Unlock methods (take name and optional lockHandle)
  unlockClass: { params: ['className', 'lockHandle'], config: (args) => `{ className: ${args[0]} }` },
  unlockInterface: { params: ['interfaceName', 'lockHandle'], config: (args) => `{ interfaceName: ${args[0]} }` },
  unlockProgram: { params: ['programName', 'lockHandle'], config: (args) => `{ programName: ${args[0]} }` },
  unlockTable: { params: ['tableName', 'lockHandle'], config: (args) => `{ tableName: ${args[0]} }` },
  unlockStructure: { params: ['structureName', 'lockHandle'], config: (args) => `{ structureName: ${args[0]} }` },
  unlockView: { params: ['viewName', 'lockHandle'], config: (args) => `{ viewName: ${args[0]} }` },
  unlockDataElement: { params: ['dataElementName', 'lockHandle'], config: (args) => `{ dataElementName: ${args[0]} }` },
  unlockFunctionModule: { params: ['functionModuleName', 'functionGroupName', 'lockHandle'], config: (args) => `{ functionModuleName: ${args[0]}, functionGroupName: ${args[1]} }` },
  unlockFunctionGroup: { params: ['functionGroupName', 'lockHandle'], config: (args) => `{ functionGroupName: ${args[0]} }` },
  unlockBehaviorDefinition: { params: ['name', 'lockHandle'], config: (args) => `{ name: ${args[0]} }` },
  unlockMetadataExtension: { params: ['name', 'lockHandle'], config: (args) => `{ name: ${args[0]} }` },

  // Update methods (take name, data, optional lockHandle)
  updateClass: { params: ['className', 'sourceCode', 'lockHandle'], config: (args) => `{ className: ${args[0]}, sourceCode: ${args[1]} }` },
  updateInterface: { params: ['interfaceName', 'sourceCode', 'lockHandle'], config: (args) => `{ interfaceName: ${args[0]}, sourceCode: ${args[1]} }` },
  updateProgram: { params: ['programName', 'sourceCode', 'lockHandle'], config: (args) => `{ programName: ${args[0]}, sourceCode: ${args[1]} }` },
  updateFunctionModule: { params: ['functionModuleName', 'functionGroupName', 'sourceCode', 'lockHandle'], config: (args) => `{ functionModuleName: ${args[0]}, functionGroupName: ${args[1]}, sourceCode: ${args[2]} }` },
  updateTable: { params: ['tableName', 'ddlCode', 'lockHandle'], config: (args) => `{ tableName: ${args[0]}, ddlCode: ${args[1]} }` },
  updateStructure: { params: ['structureName', 'ddlCode', 'lockHandle'], config: (args) => `{ structureName: ${args[0]}, ddlCode: ${args[1]} }` },
  updateView: { params: ['viewName', 'ddlCode', 'lockHandle'], config: (args) => `{ viewName: ${args[0]}, ddlCode: ${args[1]} }` },
  updateDataElement: { params: ['dataElementName', 'properties', 'lockHandle'], config: (args) => {
    // For dataElement, properties is an object, need to spread it
    return `{ dataElementName: ${args[0]}, packageName: ${args[1]}.package_name || ${args[1]}.packageName, description: ${args[1]}.description || '' }`;
  }},
};

// Simple regex-based replacement (more reliable than AST parsing for this use case)
function updateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  let changes = [];

  // Pattern to match: await client.methodName(param1, param2, ...)
  // or: client.methodName(param1, param2, ...)
  // This regex handles multiline calls by matching until balanced parentheses
  for (const [methodName, mapping] of Object.entries(METHOD_MAPPINGS)) {
    // Match method calls - need to handle multiline
    const methodPattern = new RegExp(
      `(await\\s+)?client\\.${methodName}\\s*\\(`,
      'g'
    );

    let match;
    const replacements = [];

    // Find all matches and process them
    while ((match = methodPattern.exec(content)) !== null) {
      const startPos = match.index;
      const prefix = match[1] || ''; // 'await ' or ''

      // Find the matching closing parenthesis
      let pos = match.index + match[0].length;
      let depth = 1;
      let inString = false;
      let stringChar = '';
      let paramsEnd = pos;

      while (pos < content.length && depth > 0) {
        const char = content[pos];
        const prevChar = pos > 0 ? content[pos - 1] : '';

        if (!inString && (char === '"' || char === "'" || char === '`')) {
          inString = true;
          stringChar = char;
        } else if (inString && char === stringChar && prevChar !== '\\') {
          inString = false;
        } else if (!inString) {
          if (char === '(') depth++;
          else if (char === ')') depth--;
        }
        pos++;
      }

      if (depth === 0) {
        paramsEnd = pos;
        const paramsStr = content.substring(match.index + match[0].length, paramsEnd - 1);

        // Skip if already using object syntax
        if (paramsStr.trim().startsWith('{')) {
          continue;
        }

        // Parse parameters
        const params = parseParams(paramsStr);

        // Check if we have parameters
        if (params.length === 0) {
          continue;
        }

        try {
          // Extract lockHandle if it's the last parameter for unlock/update methods
          let lockHandle = null;
          const originalParams = [...params];

          if (methodName.startsWith('unlock') || methodName.startsWith('update')) {
            // For unlock/update, last param might be lockHandle
            if (params.length >= mapping.params.length) {
              lockHandle = params[params.length - 1];
              params.pop();
            }
          }

          // Build config object string
          let configObj;
          if (typeof mapping.config === 'function') {
            configObj = mapping.config(params);
          } else {
            // Simple case: just wrap first param
            const paramName = mapping.params[0];
            configObj = `{ ${paramName}: ${params[0]} }`;
          }

          // Handle special cases for create methods with options object
          if (methodName.startsWith('create') && params.length > 3) {
            // Last param might be an options object
            const lastParam = params[params.length - 1];
            if (lastParam && lastParam.trim().startsWith('{')) {
              // Merge options into config
              const options = lastParam;
              params.pop();
              // Rebuild config with options
              if (methodName === 'createClass' || methodName === 'createInterface' || methodName === 'createProgram') {
                const [name, desc, pkg, transport] = params;
                const nameKey = methodName === 'createClass' ? 'className' :
                               methodName === 'createInterface' ? 'interfaceName' : 'programName';
                configObj = `{ ${nameKey}: ${name}, description: ${desc}, packageName: ${pkg}, transportRequest: ${transport}, ...${options} }`;
              }
            }
          }

          // Build new call
          const fullMatch = content.substring(startPos, paramsEnd);
          const newCall = lockHandle
            ? `${prefix}client.${methodName}(${configObj}, ${lockHandle})`
            : `${prefix}client.${methodName}(${configObj})`;

          replacements.push({
            start: startPos,
            end: paramsEnd,
            old: fullMatch,
            new: newCall
          });

          changes.push(`${methodName}: ${fullMatch.substring(0, 60)}... -> ${newCall.substring(0, 60)}...`);
        } catch (e) {
          console.warn(`  ⚠️  Could not parse parameters for ${methodName} at line ${content.substring(0, match.index).split('\n').length}: ${e.message}`);
          continue;
        }
      }
    }

    // Apply replacements in reverse order to maintain positions
    replacements.reverse().forEach(replacement => {
      content = content.substring(0, replacement.start) +
                replacement.new +
                content.substring(replacement.end);
      modified = true;
    });
  }

  if (modified) {
    if (!DRY_RUN) {
      fs.writeFileSync(filePath, content, 'utf8');
    }
    return { modified: true, changes };
  }

  return { modified: false, changes: [] };
}

// Simple parameter parser (handles basic cases)
function parseParams(paramsStr) {
  const params = [];
  let current = '';
  let depth = 0;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < paramsStr.length; i++) {
    const char = paramsStr[i];
    const nextChar = paramsStr[i + 1];

    if (!inString && (char === '"' || char === "'")) {
      inString = true;
      stringChar = char;
      current += char;
    } else if (inString && char === stringChar && paramsStr[i - 1] !== '\\') {
      inString = false;
      current += char;
    } else if (!inString && char === '(') {
      depth++;
      current += char;
    } else if (!inString && char === ')') {
      depth--;
      current += char;
    } else if (!inString && char === ',' && depth === 0) {
      params.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    params.push(current.trim());
  }

  return params;
}

// Find all handler files
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

// Main
function main() {
  console.log('🔄 Updating CrudClient API calls...\n');
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No files will be modified\n');
  }

  const files = SPECIFIC_FILE
    ? [path.resolve(SPECIFIC_FILE)]
    : findHandlerFiles();

  let totalModified = 0;
  const allChanges = [];

  for (const file of files) {
    const relativePath = path.relative(process.cwd(), file);
    const result = updateFile(file);

    if (result.modified) {
      totalModified++;
      console.log(`✅ ${relativePath}`);
      result.changes.forEach(change => {
        console.log(`   ${change}`);
        allChanges.push(`${relativePath}: ${change}`);
      });
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Files processed: ${files.length}`);
  console.log(`   Files modified: ${totalModified}`);

  if (DRY_RUN && totalModified > 0) {
    console.log(`\n💡 Run without --dry-run to apply changes`);
  }

  if (allChanges.length > 0 && !DRY_RUN) {
    console.log(`\n✨ Changes applied successfully!`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { updateFile, METHOD_MAPPINGS };

