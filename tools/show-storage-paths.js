#!/usr/bin/env node

/**
 * Show storage paths for service keys and sessions
 * Helps understand where mcp-abap-adt stores service keys and sessions
 */

const path = require('path');
const os = require('os');

function getPlatformPaths(customPath, subfolder) {
  const paths = [];
  const isWindows = process.platform === 'win32';

  // Priority 1: Custom path
  if (customPath) {
    if (Array.isArray(customPath)) {
      paths.push(...customPath.map(p => {
        const resolved = path.resolve(p);
        return subfolder ? path.join(resolved, subfolder) : resolved;
      }));
    } else {
      const resolved = path.resolve(customPath);
      paths.push(subfolder ? path.join(resolved, subfolder) : resolved);
    }
  }

  // Priority 2: AUTH_BROKER_PATH environment variable
  const envPath = process.env.AUTH_BROKER_PATH;
  if (envPath) {
    const envPaths = envPath.split(/[:;]/).map(p => p.trim()).filter(p => p.length > 0);
    paths.push(...envPaths.map(p => {
      const resolved = path.resolve(p);
      return subfolder ? path.join(resolved, subfolder) : resolved;
    }));
  }

  // Priority 3: Platform-specific standard paths
  if (paths.length === 0) {
    const homeDir = os.homedir();

    if (isWindows) {
      const basePath = path.join(homeDir, 'Documents', 'mcp-abap-adt');
      if (subfolder) {
        paths.push(path.join(basePath, subfolder));
      } else {
        paths.push(basePath);
      }
    } else {
      const basePath = path.join(homeDir, '.config', 'mcp-abap-adt');
      if (subfolder) {
        paths.push(path.join(basePath, subfolder));
      } else {
        paths.push(basePath);
      }
    }
  }

  // Priority 4: Current working directory (always added as fallback)
  paths.push(process.cwd());

  return paths;
}

function main() {
  const customPath = process.argv[2]; // Optional custom path from command line

  console.error('\n📂 MCP ABAP ADT Storage Paths\n');
  console.error('Platform:', process.platform);
  console.error('Home directory:', os.homedir());
  console.error('Current directory:', process.cwd());
  console.error('AUTH_BROKER_PATH:', process.env.AUTH_BROKER_PATH || '(not set)');
  if (customPath) {
    console.error('Custom path:', customPath);
  }
  console.error('');

  console.error('🔑 Service Keys paths (searched in order):');
  const serviceKeysPaths = getPlatformPaths(customPath, 'service-keys');
  serviceKeysPaths.forEach((p, i) => {
    console.error(`  ${i + 1}. ${p}`);
  });
  console.error('');

  console.error('💾 Sessions paths (searched in order):');
  const sessionsPaths = getPlatformPaths(customPath, 'sessions');
  sessionsPaths.forEach((p, i) => {
    console.error(`  ${i + 1}. ${p}`);
  });
  console.error('');

  console.error('📝 Usage:');
  console.error('  Default (platform-specific):');
  console.error('    node tools/show-storage-paths.js');
  console.error('');
  console.error('  With custom path:');
  console.error('    node tools/show-storage-paths.js /path/to/custom/location');
  console.error('');
  console.error('  With AUTH_BROKER_PATH environment variable:');
  console.error('    AUTH_BROKER_PATH=/path1:/path2 node tools/show-storage-paths.js');
  console.error('');
  console.error('  With --auth-broker-path argument:');
  console.error('    mcp-abap-adt-v2 --auth-broker-path=/path/to/custom --mcp=TRIAL');
  console.error('');

  console.error('💡 Platform-specific defaults:');
  const homeDir = os.homedir();
  if (process.platform === 'win32') {
    console.error('  Windows:');
    console.error(`    Service Keys: ${path.join(homeDir, 'Documents', 'mcp-abap-adt', 'service-keys')}`);
    console.error(`    Sessions:     ${path.join(homeDir, 'Documents', 'mcp-abap-adt', 'sessions')}`);
  } else {
    console.error('  Unix/Linux/macOS:');
    console.error(`    Service Keys: ${path.join(homeDir, '.config', 'mcp-abap-adt', 'service-keys')}`);
    console.error(`    Sessions:     ${path.join(homeDir, '.config', 'mcp-abap-adt', 'sessions')}`);
  }
  console.error('');
}

main();
