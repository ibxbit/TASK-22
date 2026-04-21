module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/src/tests/**/*.test.js',
    '**/unit_tests/**/*.test.js',
    '**/API_tests/**/*.test.js',
  ],
  setupFiles: ['<rootDir>/jest.setup.js'],
  testTimeout: 20000,
  verbose: true,
  forceExit: true,
};
