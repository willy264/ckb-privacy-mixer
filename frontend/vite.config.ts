import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
  publicDir: '../circuits',
  envPrefix: ['VITE_', 'CKB_', 'MIXER_', 'NULLIFIER_', 'ZK_', 'STEALTH_', 'CT_'],
  plugins: [
    react(),
    nodePolyfills({
      include: ['crypto', 'stream', 'util', 'path', 'os', 'buffer'],
      globals: { Buffer: true, global: true, process: true },
    })
  ],
})
