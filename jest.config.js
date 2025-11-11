module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/?(*.)+(test).[tj]s'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  testTimeout: 10000, // Increase test timeout to 10 seconds
  forceExit: true, // Force Jest to exit after tests complete
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
