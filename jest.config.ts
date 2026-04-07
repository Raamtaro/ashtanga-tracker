import type { Config } from "jest";

const config: Config = {
    preset: "ts-jest/presets/default-esm",
    testEnvironment: "node",
    roots: ["<rootDir>/src"],
    testMatch: ["**/*.test.ts"],
    moduleFileExtensions: ["ts", "js", "json"],
    extensionsToTreatAsEsm: [".ts"],
    transform: {
        "^.+\\.ts$": ["ts-jest", { useESM: true, tsconfig: "tsconfig.jest.json" }],
    },
    moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1",
    },
    collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts"],
    coveragePathIgnorePatterns: ["/node_modules/", "/dist/"],
    clearMocks: true,
    watchman: false,
};

export default config;
