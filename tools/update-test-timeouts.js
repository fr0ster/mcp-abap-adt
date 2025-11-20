#!/usr/bin/env node
/**
 * Update all integration tests to use getTimeout() from test-helper
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Mapping of test file patterns to operation types
const OPERATION_MAP = {
  'create.test.ts': 'create',
  'read.test.ts': 'read',
  'update.test.ts': 'update',
  'check.test.ts': 'check',
  'lock.test.ts': 'lock',
  'unlock.test.ts': 'unlock',
  'activate.test.ts': 'activate',
  'delete.test.ts': 'delete'
};

function updateTestFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Determine operation type from filename
  const filename = path.basename(filePath);
  const operationType = OPERATION_MAP[filename];
  
  if (!operationType) {
    console.log(`⚠️  Unknown test type: ${filename}, skipping`);
    return false;
  }

  // Check if getTimeout is already imported
  const hasGetTimeout = content.includes('getTimeout');
  
  if (!hasGetTimeout) {
    // Add getTimeout to imports
    content = content.replace(
      /const \{ ([^}]+) \} = require\('..\/..\/..\/..\/tests\/test-helper'\);/,
      (match, imports) => {
        const importList = imports.split(',').map(s => s.trim());
        if (!importList.includes('getTimeout')) {
          importList.push('getTimeout');
        }
        return `const { ${importList.join(', ')} } = require('../../../../tests/test-helper');`;
      }
    );
    modified = true;
  }

  // Replace hardcoded timeouts with getTimeout()
  const timeoutPattern = /}, \d+000\);/g;
  const matches = content.match(timeoutPattern);
  
  if (matches) {
    content = content.replace(timeoutPattern, `}, getTimeout('${operationType}'));`);
    modified = true;
    console.log(`✓ Updated ${matches.length} timeout(s) in ${path.relative(process.cwd(), filePath)}`);
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }

  return false;
}

// Find all integration test files
const testFiles = glob.sync(
  'packages/adt-clients/src/__tests__/integration/*/{create,read,update,check,lock,unlock,activate,delete}.test.ts',
  { cwd: path.resolve(__dirname, '..') }
);

console.log(`Found ${testFiles.length} test files\n`);

let updatedCount = 0;
testFiles.forEach(file => {
  const fullPath = path.resolve(__dirname, '..', file);
  if (updateTestFile(fullPath)) {
    updatedCount++;
  }
});

console.log(`\n✅ Updated ${updatedCount}/${testFiles.length} files`);
