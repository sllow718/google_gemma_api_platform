import type { Config } from 'jest'

const isIntegration = process.env.INTEGRATION === 'true'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: isIntegration
    ? ['<rootDir>/tests/sheets.integration.test.ts']
    : ['<rootDir>/tests/!(sheets.integration).test.ts'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  collectCoverageFrom: ['lib/**/*.ts', 'app/api/**/*.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { strict: true } }],
  },
}

export default config
