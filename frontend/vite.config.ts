import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  publicDir: 'public',
  envDir: '../',
  envPrefix: ['VITE_', 'CKB_', 'MIXER_', 'NULLIFIER_', 'ZK_', 'STEALTH_', 'CT_'],
  plugins: [
    react(),
    nodePolyfills({
      include: ['crypto', 'stream', 'util', 'path', 'os'],
      globals: { global: true, process: true },
    })
  ]
})
