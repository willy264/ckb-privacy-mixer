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
  server: {
    proxy: {
      // Proxy RPC requests to testnet.ckb.dev to bypass browser CORS policies
      '/rpc': {
        target: 'https://testnet.ckb.dev',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rpc/, '')
      }
    }
  },
  plugins: [
    react(),
    nodePolyfills({
      include: ['crypto', 'stream', 'util', 'path', 'os'],
      globals: { global: true, process: true },
    })
  ]
})
