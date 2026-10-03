/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  roots: ["<rootDir>/src", "<rootDir>/test"],
  testRegex: "\\.(spec|e2e-spec)\\.ts$",
  setupFiles: ["<rootDir>/test/setup-env.ts"],
  transform: { "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json" }] },
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.spec.ts", "!src/main.ts"],
  coverageDirectory: "coverage",
  testEnvironment: "node",
};
