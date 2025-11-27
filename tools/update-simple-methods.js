#!/usr/bin/env node
/**
 * Simple script to update activate/check/validate/delete methods
 * Uses very simple regex patterns
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

// Simple replacements
const REPLACEMENTS = [
  // Activate methods
  { pattern: /await client\.activateClass\(([^,)]+)\)/g, replacement: 'await client.activateClass({ className: $1 })' },
  { pattern: /await client\.activateInterface\(([^,)]+)\)/g, replacement: 'await client.activateInterface({ interfaceName: $1 })' },
  { pattern: /await client\.activateProgram\(([^,)]+)\)/g, replacement: 'await client.activateProgram({ programName: $1 })' },
  { pattern: /await client\.activateTable\(([^,)]+)\)/g, replacement: 'await client.activateTable({ tableName: $1 })' },
  { pattern: /await client\.activateStructure\(([^,)]+)\)/g, replacement: 'await client.activateStructure({ structureName: $1 })' },
  { pattern: /await client\.activateView\(([^,)]+)\)/g, replacement: 'await client.activateView({ viewName: $1 })' },
  { pattern: /await client\.activateDataElement\(([^,)]+)\)/g, replacement: 'await client.activateDataElement({ dataElementName: $1 })' },
  { pattern: /await client\.activateFunctionModule\(([^,)]+),\s*([^,)]+)\)/g, replacement: 'await client.activateFunctionModule({ functionModuleName: $1, functionGroupName: $2 })' },
  { pattern: /await client\.activateFunctionGroup\(([^,)]+)\)/g, replacement: 'await client.activateFunctionGroup({ functionGroupName: $1 })' },
  { pattern: /await client\.activateDomain\(([^,)]+)\)/g, replacement: 'await client.activateDomain({ domainName: $1 })' },
  { pattern: /await client\.activateBehaviorDefinition\(([^,)]+)\)/g, replacement: 'await client.activateBehaviorDefinition({ name: $1 })' },
  { pattern: /await client\.activateMetadataExtension\(([^,)]+)\)/g, replacement: 'await client.activateMetadataExtension({ name: $1 })' },
  
  // Check methods
  { pattern: /await client\.checkClass\(([^,)]+)\)/g, replacement: 'await client.checkClass({ className: $1 })' },
  { pattern: /await client\.checkInterface\(([^,)]+)\)/g, replacement: 'await client.checkInterface({ interfaceName: $1 })' },
  { pattern: /await client\.checkProgram\(([^,)]+)\)/g, replacement: 'await client.checkProgram({ programName: $1 })' },
  { pattern: /await client\.checkTable\(([^,)]+)\)/g, replacement: 'await client.checkTable({ tableName: $1 })' },
  { pattern: /await client\.checkStructure\(([^,)]+)\)/g, replacement: 'await client.checkStructure({ structureName: $1 })' },
  { pattern: /await client\.checkView\(([^,)]+)\)/g, replacement: 'await client.checkView({ viewName: $1 })' },
  { pattern: /await client\.checkDataElement\(([^,)]+)\)/g, replacement: 'await client.checkDataElement({ dataElementName: $1 })' },
  { pattern: /await client\.checkFunctionModule\(([^,)]+),\s*([^,)]+)\)/g, replacement: 'await client.checkFunctionModule({ functionModuleName: $1, functionGroupName: $2 })' },
  { pattern: /await client\.checkFunctionGroup\(([^,)]+)\)/g, replacement: 'await client.checkFunctionGroup({ functionGroupName: $1 })' },
  { pattern: /await client\.checkDomain\(([^,)]+)\)/g, replacement: 'await client.checkDomain({ domainName: $1 })' },
  { pattern: /await client\.checkBehaviorDefinition\(([^,)]+)\)/g, replacement: 'await client.checkBehaviorDefinition({ name: $1 })' },
  { pattern: /await client\.checkMetadataExtension\(([^,)]+)\)/g, replacement: 'await client.checkMetadataExtension({ name: $1 })' },
  { pattern: /await client\.checkPackage\(([^,)]+),\s*([^,)]+)\)/g, replacement: 'await client.checkPackage({ packageName: $1, superPackage: $2 })' },
  
  // Validate methods
  { pattern: /await client\.validateClass\(([^,)]+)\)/g, replacement: 'await client.validateClass({ className: $1, packageName: \'\', description: \'\' })' },
  { pattern: /await client\.validateInterface\(([^,)]+)\)/g, replacement: 'await client.validateInterface({ interfaceName: $1, packageName: \'\', description: \'\' })' },
  { pattern: /await client\.validateProgram\(([^,)]+)\)/g, replacement: 'await client.validateProgram({ programName: $1, packageName: \'\', description: \'\' })' },
  { pattern: /await client\.validateTable\(([^,)]+)\)/g, replacement: 'await client.validateTable({ tableName: $1, packageName: \'\', description: \'\' })' },
  { pattern: /await client\.validateStructure\(([^,)]+)\)/g, replacement: 'await client.validateStructure({ structureName: $1, packageName: \'\', description: \'\' })' },
  { pattern: /await client\.validateView\(([^,)]+)\)/g, replacement: 'await client.validateView({ viewName: $1, packageName: \'\', description: \'\' })' },
  { pattern: /await client\.validateDataElement\(([^,)]+)\)/g, replacement: 'await client.validateDataElement({ dataElementName: $1, packageName: \'\', description: \'\' })' },
  { pattern: /await client\.validateFunctionModule\(([^,)]+),\s*([^,)]+)\)/g, replacement: 'await client.validateFunctionModule({ functionModuleName: $1, functionGroupName: $2, packageName: \'\', description: \'\' })' },
  { pattern: /await client\.validateFunctionGroup\(([^,)]+)\)/g, replacement: 'await client.validateFunctionGroup({ functionGroupName: $1, description: \'\' })' },
  { pattern: /await client\.validateDomain\(([^,)]+)\)/g, replacement: 'await client.validateDomain({ domainName: $1, packageName: \'\', description: \'\' })' },
  { pattern: /await client\.validateBehaviorDefinition\(([^,)]+)\)/g, replacement: 'await client.validateBehaviorDefinition({ name: $1 })' },
  { pattern: /await client\.validateMetadataExtension\(([^,)]+)\)/g, replacement: 'await client.validateMetadataExtension({ name: $1 })' },
  { pattern: /await client\.validatePackage\(([^,)]+),\s*([^,)]+)\)/g, replacement: 'await client.validatePackage({ packageName: $1, superPackage: $2, description: \'\' })' },
  
  // Delete methods
  { pattern: /await client\.deleteClass\(([^,)]+),\s*([^,)]+)\)/g, replacement: 'await client.deleteClass({ className: $1, transportRequest: $2 })' },
  { pattern: /await client\.deleteInterface\(([^,)]+),\s*([^,)]+)\)/g, replacement: 'await client.deleteInterface({ interfaceName: $1, transportRequest: $2 })' },
  { pattern: /await client\.deleteProgram\(([^,)]+),\s*([^,)]+)\)/g, replacement: 'await client.deleteProgram({ programName: $1, transportRequest: $2 })' },
  { pattern: /await client\.deleteTable\(([^,)]+),\s*([^,)]+)\)/g, replacement: 'await client.deleteTable({ tableName: $1, transportRequest: $2 })' },
  { pattern: /await client\.deleteStructure\(([^,)]+),\s*([^,)]+)\)/g, replacement: 'await client.deleteStructure({ structureName: $1, transportRequest: $2 })' },
  { pattern: /await client\.deleteView\(([^,)]+),\s*([^,)]+)\)/g, replacement: 'await client.deleteView({ viewName: $1, transportRequest: $2 })' },
  { pattern: /await client\.deleteDataElement\(([^,)]+),\s*([^,)]+)\)/g, replacement: 'await client.deleteDataElement({ dataElementName: $1, transportRequest: $2 })' },
  { pattern: /await client\.deleteFunctionModule\(([^,)]+),\s*([^,)]+),\s*([^,)]+)\)/g, replacement: 'await client.deleteFunctionModule({ functionModuleName: $1, functionGroupName: $2, transportRequest: $3 })' },
  { pattern: /await client\.deleteFunctionGroup\(([^,)]+),\s*([^,)]+)\)/g, replacement: 'await client.deleteFunctionGroup({ functionGroupName: $1, transportRequest: $2 })' },
  { pattern: /await client\.deleteDomain\(([^,)]+),\s*([^,)]+)\)/g, replacement: 'await client.deleteDomain({ domainName: $1, transportRequest: $2 })' },
  { pattern: /await client\.deleteBehaviorDefinition\(([^,)]+),\s*([^,)]+)\)/g, replacement: 'await client.deleteBehaviorDefinition({ name: $1, transportRequest: $2 })' },
  { pattern: /await client\.deleteMetadataExtension\(([^,)]+),\s*([^,)]+)\)/g, replacement: 'await client.deleteMetadataExtension({ name: $1, transportRequest: $2 })' },
  { pattern: /await client\.deletePackage\(([^,)]+),\s*([^,)]+)\)/g, replacement: 'await client.deletePackage({ packageName: $1, transportRequest: $2 })' },
];

function updateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  for (const { pattern, replacement } of REPLACEMENTS) {
    const newContent = content.replace(pattern, (match) => {
      // Skip if already using object syntax
      if (match.includes('{ className:') || match.includes('{ interfaceName:') || 
          match.includes('{ programName:') || match.includes('{ tableName:') ||
          match.includes('{ structureName:') || match.includes('{ viewName:') ||
          match.includes('{ dataElementName:') || match.includes('{ functionGroupName:') ||
          match.includes('{ functionModuleName:') || match.includes('{ name:') ||
          match.includes('{ domainName:') || match.includes('{ packageName:')) {
        return match;
      }
      modified = true;
      return match.replace(pattern, replacement);
    });
    content = newContent;
  }

  if (modified) {
    if (!DRY_RUN) {
      fs.writeFileSync(filePath, content, 'utf8');
    }
    return { modified: true };
  }

  return { modified: false };
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
  console.log('🔄 Updating simple methods (activate/check/validate/delete)...\n');
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No files will be modified\n');
  }

  const files = findHandlerFiles();
  let totalModified = 0;

  for (const file of files) {
    const relativePath = path.relative(process.cwd(), file);
    const result = updateFile(file);

    if (result.modified) {
      totalModified++;
      console.log(`✅ ${relativePath}`);
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

