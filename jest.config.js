module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json',
    }],
  },
  testMatch: [
    '**/src/__tests__/**/*.test.[tj]s',
    '**/src/__tests__/**/*.integration.test.[tj]s',
    '**/src/lib/servers/v2/__tests__/**/*.test.[tj]s',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/mcp-abap-connection/',
    '/mcp-abap-adt-clients/',
  ],
  setupFiles: ['<rootDir>/jest.setup.js'],
  testTimeout: 900000, // 5 minutes - allows for long-running integration tests
  forceExit: true,
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Force sequential execution for integration tests (single worker, no parallelism)
  // Integration tests MUST run sequentially to avoid conflicts with shared SAP objects
  maxWorkers: 1,
  maxConcurrency: 1, // Only run 1 test suite at a time
};
