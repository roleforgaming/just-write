/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom', // Simulates a browser environment
  moduleNameMapper: {
    // Mock non-JS modules like CSS
    '\\.(css|less)$': '<rootDir>/__mocks__/styleMock.js',
    // Handle the worker bundle import if necessary
    'worker.bundle.ts': '<rootDir>/__mocks__/workerMock.js'
  },
  // Ignore the actual Obsidian module (we will mock it)
  moduleDirectories: ['node_modules', 'src'],
};