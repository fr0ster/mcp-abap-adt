#!/usr/bin/env node
/**
 * Simplified script to update CrudClient API calls
 * Uses more specific patterns for better accuracy
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const SPECIFIC_FILE = process.argv.includes('--file')
  ? process.argv[process.argv.indexOf('--file') + 1]
  : null;

// Simple replacements - more reliable than complex parsing
const REPLACEMENTS = [
  // Lock methods - single parameter
  {
    pattern: /(await\s+)?client\.lockClass\s*\(\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param) => `${awaitPart || ''}client.lockClass({ className: ${param} })`
  },
  {
    pattern: /(await\s+)?client\.lockInterface\s*\(\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param) => `${awaitPart || ''}client.lockInterface({ interfaceName: ${param} })`
  },
  {
    pattern: /(await\s+)?client\.lockProgram\s*\(\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param) => `${awaitPart || ''}client.lockProgram({ programName: ${param} })`
  },
  {
    pattern: /(await\s+)?client\.lockTable\s*\(\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param) => `${awaitPart || ''}client.lockTable({ tableName: ${param} })`
  },
  {
    pattern: /(await\s+)?client\.lockStructure\s*\(\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param) => `${awaitPart || ''}client.lockStructure({ structureName: ${param} })`
  },
  {
    pattern: /(await\s+)?client\.lockView\s*\(\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param) => `${awaitPart || ''}client.lockView({ viewName: ${param} })`
  },
  {
    pattern: /(await\s+)?client\.lockDataElement\s*\(\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param) => `${awaitPart || ''}client.lockDataElement({ dataElementName: ${param} })`
  },
  {
    pattern: /(await\s+)?client\.lockFunctionGroup\s*\(\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param) => `${awaitPart || ''}client.lockFunctionGroup({ functionGroupName: ${param} })`
  },
  {
    pattern: /(await\s+)?client\.lockBehaviorDefinition\s*\(\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param) => `${awaitPart || ''}client.lockBehaviorDefinition({ name: ${param} })`
  },
  {
    pattern: /(await\s+)?client\.lockMetadataExtension\s*\(\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param) => `${awaitPart || ''}client.lockMetadataExtension({ name: ${param} })`
  },

  // Lock function module - two parameters
  {
    pattern: /(await\s+)?client\.lockFunctionModule\s*\(\s*([^,]+),\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param1, param2) => `${awaitPart || ''}client.lockFunctionModule({ functionModuleName: ${param1}, functionGroupName: ${param2} })`
  },

  // Unlock methods - two parameters (name, lockHandle)
  {
    pattern: /(await\s+)?client\.unlockClass\s*\(\s*([^,]+),\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param1, param2) => `${awaitPart || ''}client.unlockClass({ className: ${param1} }, ${param2})`
  },
  {
    pattern: /(await\s+)?client\.unlockInterface\s*\(\s*([^,]+),\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param1, param2) => `${awaitPart || ''}client.unlockInterface({ interfaceName: ${param1} }, ${param2})`
  },
  {
    pattern: /(await\s+)?client\.unlockProgram\s*\(\s*([^,]+),\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param1, param2) => `${awaitPart || ''}client.unlockProgram({ programName: ${param1} }, ${param2})`
  },
  {
    pattern: /(await\s+)?client\.unlockTable\s*\(\s*([^,]+),\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param1, param2) => `${awaitPart || ''}client.unlockTable({ tableName: ${param1} }, ${param2})`
  },
  {
    pattern: /(await\s+)?client\.unlockStructure\s*\(\s*([^,]+),\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param1, param2) => `${awaitPart || ''}client.unlockStructure({ structureName: ${param1} }, ${param2})`
  },
  {
    pattern: /(await\s+)?client\.unlockView\s*\(\s*([^,]+),\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param1, param2) => `${awaitPart || ''}client.unlockView({ viewName: ${param1} }, ${param2})`
  },
  {
    pattern: /(await\s+)?client\.unlockDataElement\s*\(\s*([^,]+),\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param1, param2) => `${awaitPart || ''}client.unlockDataElement({ dataElementName: ${param1} }, ${param2})`
  },
  {
    pattern: /(await\s+)?client\.unlockFunctionGroup\s*\(\s*([^,]+),\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param1, param2) => `${awaitPart || ''}client.unlockFunctionGroup({ functionGroupName: ${param1} }, ${param2})`
  },
  {
    pattern: /(await\s+)?client\.unlockBehaviorDefinition\s*\(\s*([^,]+),\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param1, param2) => `${awaitPart || ''}client.unlockBehaviorDefinition({ name: ${param1} }, ${param2})`
  },
  {
    pattern: /(await\s+)?client\.unlockMetadataExtension\s*\(\s*([^,]+),\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param1, param2) => `${awaitPart || ''}client.unlockMetadataExtension({ name: ${param1} }, ${param2})`
  },
  {
    pattern: /(await\s+)?client\.unlockFunctionModule\s*\(\s*([^,]+),\s*([^,]+),\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param1, param2, param3) => `${awaitPart || ''}client.unlockFunctionModule({ functionModuleName: ${param1}, functionGroupName: ${param2} }, ${param3})`
  },

  // Update methods - three parameters (name, data, lockHandle)
  {
    pattern: /(await\s+)?client\.updateClass\s*\(\s*([^,]+),\s*([^,]+),\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param1, param2, param3) => `${awaitPart || ''}client.updateClass({ className: ${param1}, sourceCode: ${param2} }, ${param3})`
  },
  {
    pattern: /(await\s+)?client\.updateInterface\s*\(\s*([^,]+),\s*([^,]+),\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param1, param2, param3) => `${awaitPart || ''}client.updateInterface({ interfaceName: ${param1}, sourceCode: ${param2} }, ${param3})`
  },
  {
    pattern: /(await\s+)?client\.updateProgram\s*\(\s*([^,]+),\s*([^,]+),\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param1, param2, param3) => `${awaitPart || ''}client.updateProgram({ programName: ${param1}, sourceCode: ${param2} }, ${param3})`
  },
  {
    pattern: /(await\s+)?client\.updateFunctionModule\s*\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param1, param2, param3, param4) => `${awaitPart || ''}client.updateFunctionModule({ functionModuleName: ${param1}, functionGroupName: ${param2}, sourceCode: ${param3} }, ${param4})`
  },
  {
    pattern: /(await\s+)?client\.updateTable\s*\(\s*([^,]+),\s*([^,]+),\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param1, param2, param3) => `${awaitPart || ''}client.updateTable({ tableName: ${param1}, ddlCode: ${param2} }, ${param3})`
  },
  {
    pattern: /(await\s+)?client\.updateStructure\s*\(\s*([^,]+),\s*([^,]+),\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param1, param2, param3) => `${awaitPart || ''}client.updateStructure({ structureName: ${param1}, ddlCode: ${param2} }, ${param3})`
  },
  {
    pattern: /(await\s+)?client\.updateView\s*\(\s*([^,]+),\s*([^,]+),\s*([^,)]+)\s*\)/g,
    replacement: (match, awaitPart, param1, param2, param3) => `${awaitPart || ''}client.updateView({ viewName: ${param1}, ddlCode: ${param2} }, ${param3})`
  },
];

function updateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  let changes = [];

  // Skip if already updated (check for object syntax)
  if (content.includes('client.lockClass({') || content.includes('client.createClass({')) {
    // Might be partially updated, continue
  }

  for (const { pattern, replacement } of REPLACEMENTS) {
    const newContent = content.replace(pattern, (match, ...args) => {
      // Skip if already using object syntax
      if (match.includes('{ className:') || match.includes('{ interfaceName:') ||
          match.includes('{ programName:') || match.includes('{ tableName:') ||
          match.includes('{ structureName:') || match.includes('{ viewName:') ||
          match.includes('{ dataElementName:') || match.includes('{ functionGroupName:') ||
          match.includes('{ functionModuleName:') || match.includes('{ name:')) {
        return match;
      }

      const newMatch = replacement(match, ...args);
      if (newMatch !== match) {
        changes.push(`${pattern.source.substring(0, 30)}...: ${match.substring(0, 50)}... -> ${newMatch.substring(0, 50)}...`);
        modified = true;
        return newMatch;
      }
      return match;
    });
    content = newContent;
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
  console.log('🔄 Updating CrudClient API calls (simple pattern matching)...\n');
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
      if (result.changes.length > 0) {
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

module.exports = { updateFile, REPLACEMENTS };

