import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
    plugins: [
        nodePolyfills({
            include: ['buffer', 'crypto', 'os', 'path', 'stream', 'util'],
            globals: { Buffer: true, global: true, process: true },
        }),
    ],
});
