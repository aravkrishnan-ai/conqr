module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: false,
        skipLibCheck: true,
      }
    }]
  },
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$': '<rootDir>/__tests__/__mocks__/async-storage.ts',
    '^expo-location$': '<rootDir>/__tests__/__mocks__/expo-location.ts',
    '^expo-keep-awake$': '<rootDir>/__tests__/__mocks__/expo-keep-awake.ts',
    '^react-native$': '<rootDir>/__tests__/__mocks__/react-native.ts',
  },
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
  testTimeout: 10000,
};
