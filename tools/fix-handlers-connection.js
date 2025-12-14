#!/usr/bin/env node

/**
 * Script to replace getConfig() + createAbapConnection() with getManagedConnection() in all handlers
 */

const fs = require('fs');
const path = require('path');

const HANDLERS_DIR = path.join(__dirname, '../src/handlers');

function findTsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      findTsFiles(filePath, fileList);
    } else if (file.endsWith('.ts')) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

function fixHandler(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Pattern 1: Simple pattern with const connection = createAbapConnection(...)
  // Match multiline pattern with flexible whitespace
  const pattern1 = /const\s+config\s*=\s*getConfig\(\);\s*\n\s*const\s+connectionLogger\s*=\s*\{[\s\S]*?\};\s*\n\s*const\s+connection\s*=\s*createAbapConnection\(config,\s*connectionLogger\);\s*\n\s*await\s+connection\.connect\(\);/g;
  if (pattern1.test(content)) {
    content = content.replace(pattern1, '// Get connection from session context (set by ProtocolHandler)\n    // Connection is managed and cached per session, with proper token refresh via AuthBroker\n    const connection = getManagedConnection();');
    modified = true;
  }

  // Pattern 1a: Also handle cases where there's leftover code after partial replacement
  const pattern1a = /const\s+config\s*=\s*getConfig\(\);\s*\n\s*const\s+connectionLogger\s*=\s*\{[\s\S]*?\};\s*\n\s*const\s*\/\/ Get connection from session context[\s\S]*?connection\s*=\s*getManagedConnection\(\);/g;
  if (pattern1a.test(content)) {
    content = content.replace(pattern1a, '// Get connection from session context (set by ProtocolHandler)\n    // Connection is managed and cached per session, with proper token refresh via AuthBroker\n    const connection = getManagedConnection();');
    modified = true;
  }

  // Pattern 1b: Remove leftover getConfig() and connectionLogger if getManagedConnection() is already present
  if (content.includes('getManagedConnection()') && (content.includes('const config = getConfig()') || content.includes('const connectionLogger ='))) {
    // Remove lines with getConfig() and connectionLogger that appear before getManagedConnection
    content = content.replace(/const\s+config\s*=\s*getConfig\(\);\s*\n/g, '');
    content = content.replace(/const\s+connectionLogger\s*=\s*\{[\s\S]*?\};\s*\n/g, '');
    modified = true;
  }

  // Pattern 2: With try-catch and let connection
  const pattern2 = /let\s+connection[^;]*;\s*\n\s*try\s*\{\s*\n\s*const\s+config\s*=\s*getConfig\(\);\s*\n\s*const\s+connectionLogger\s*=\s*\{[^}]+\};\s*\n\s*connection\s*=\s*createAbapConnection\(config,\s*connectionLogger\);\s*\n\s*await\s+connection\.connect\(\);/g;
  if (pattern2.test(content)) {
    content = content.replace(pattern2, (match) => {
      // Extract the variable declaration
      const letMatch = match.match(/let\s+connection[^;]*;/);
      if (letMatch) {
        return `${letMatch[0]}\n    // Get connection from session context (set by ProtocolHandler)\n    // Connection is managed and cached per session, with proper token refresh via AuthBroker\n    connection = getManagedConnection();`;
      }
      return match;
    });
    modified = true;
  }

  // Pattern 3: connection = createAbapConnection(...) without const/let (already declared)
  const pattern3 = /connection\s*=\s*createAbapConnection\([^)]+\);\s*\n\s*await\s+connection\.connect\(\);/g;
  if (pattern3.test(content) && !content.includes('getManagedConnection()')) {
    content = content.replace(pattern3, '// Get connection from session context (set by ProtocolHandler)\n    // Connection is managed and cached per session, with proper token refresh via AuthBroker\n    connection = getManagedConnection();');
    modified = true;
  }

  // Remove getConfig() and createAbapConnection() imports
  if (content.includes('getConfig') || content.includes('createAbapConnection')) {
    // Remove import lines
    content = content.replace(/import\s+.*getConfig.*from[^\n]+\n/g, '');
    content = content.replace(/import\s+.*createAbapConnection.*from[^\n]+\n/g, '');

    // Remove from multi-import
    content = content.replace(/,\s*getConfig\s*/g, '');
    content = content.replace(/,\s*createAbapConnection\s*/g, '');
    content = content.replace(/getConfig\s*,/g, '');
    content = content.replace(/createAbapConnection\s*,/g, '');

    modified = true;
  }

  // Add getManagedConnection import if getManagedConnection() is used but not imported
  if (content.includes('getManagedConnection()') && !content.includes('import') || !content.match(/import\s+.*getManagedConnection/)) {
    // Find the last import statement
    const importMatch = content.match(/(import\s+.*from\s+['"][^'"]+['"];?\s*\n)/g);
    if (importMatch && importMatch.length > 0) {
      const lastImport = importMatch[importMatch.length - 1];
      const lastImportIndex = content.lastIndexOf(lastImport);
      const insertIndex = lastImportIndex + lastImport.length;

      // Determine relative path (assume handlers are in src/handlers/**/)
      const relativePath = path.relative(path.dirname(filePath), path.join(__dirname, '../src/lib/utils.js'));
      let importPath = relativePath.replace(/\\/g, '/');
      // Ensure .js extension for ES modules
      if (!importPath.endsWith('.js')) {
        importPath += '.js';
      }

      content = content.slice(0, insertIndex) +
                `import { getManagedConnection } from '${importPath}';\n` +
                content.slice(insertIndex);
      modified = true;
    } else {
      // No imports found, add at the beginning after any comments/header
      const firstImportMatch = content.match(/^(\/\*\*[\s\S]*?\*\/\s*\n)?/);
      const insertIndex = firstImportMatch ? firstImportMatch[0].length : 0;

      const relativePath = path.relative(path.dirname(filePath), path.join(__dirname, '../src/lib/utils.js'));
      let importPath = relativePath.replace(/\\/g, '/');
      if (!importPath.endsWith('.js')) {
        importPath += '.js';
      }

      content = content.slice(0, insertIndex) +
                `import { getManagedConnection } from '${importPath}';\n` +
                content.slice(insertIndex);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed: ${filePath}`);
    return true;
  }

  return false;
}

function main() {
  const files = findTsFiles(HANDLERS_DIR);
  let fixed = 0;

  for (const file of files) {
    if (fixHandler(file)) {
      fixed++;
    }
  }

  console.log(`\nFixed ${fixed} handler files`);
}

main();
