module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/__tests__/**/*.test.[tj]s'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/mcp-abap-connection/',
    '/mcp-abap-adt-clients/',
  ],
  setupFiles: ['<rootDir>/jest.setup.js'],
  testTimeout: 5000,
  forceExit: true,
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
