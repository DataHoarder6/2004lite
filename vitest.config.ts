import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    resolve: {
        // match package.json "imports" (#api/*, #/*) for host/api/plugin tests
        alias: {
            '#api': path.resolve(__dirname, 'api'),
            '#': path.resolve(__dirname, 'src')
        }
    },
    test: {
        include: ['tests/unit/**/*.test.ts'],
        environment: 'node'
    }
});
