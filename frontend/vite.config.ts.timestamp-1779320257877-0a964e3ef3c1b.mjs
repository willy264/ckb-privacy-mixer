// vite.config.ts
import { defineConfig } from "file:///C:/Users/HP/Documents/people/ckb-privacy-mixer/node_modules/.pnpm/vite@4.5.14_@types+node@20.19.39/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/HP/Documents/people/ckb-privacy-mixer/node_modules/.pnpm/@vitejs+plugin-react@4.7.0_vite@4.5.14_@types+node@20.19.39_/node_modules/@vitejs/plugin-react/dist/index.js";
import { nodePolyfills } from "file:///C:/Users/HP/Documents/people/ckb-privacy-mixer/node_modules/.pnpm/vite-plugin-node-polyfills@_81559d17427d57be3e2573af9d2d716b/node_modules/vite-plugin-node-polyfills/dist/index.js";
import path from "path";
import { fileURLToPath } from "url";
var __vite_injected_original_import_meta_url = "file:///C:/Users/HP/Documents/people/ckb-privacy-mixer/frontend/vite.config.ts";
var __dirname = path.dirname(fileURLToPath(__vite_injected_original_import_meta_url));
var vite_config_default = defineConfig({
  publicDir: "public",
  envDir: "../",
  envPrefix: ["VITE_", "CKB_", "MIXER_", "NULLIFIER_", "ZK_", "STEALTH_", "CT_"],
  plugins: [
    react(),
    nodePolyfills({
      include: ["crypto", "stream", "util", "path", "os"],
      globals: { global: true, process: true }
    })
  ]
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxIUFxcXFxEb2N1bWVudHNcXFxccGVvcGxlXFxcXGNrYi1wcml2YWN5LW1peGVyXFxcXGZyb250ZW5kXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxIUFxcXFxEb2N1bWVudHNcXFxccGVvcGxlXFxcXGNrYi1wcml2YWN5LW1peGVyXFxcXGZyb250ZW5kXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy9IUC9Eb2N1bWVudHMvcGVvcGxlL2NrYi1wcml2YWN5LW1peGVyL2Zyb250ZW5kL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSdcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCdcbmltcG9ydCB7IG5vZGVQb2x5ZmlsbHMgfSBmcm9tICd2aXRlLXBsdWdpbi1ub2RlLXBvbHlmaWxscydcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnXG5pbXBvcnQgeyBmaWxlVVJMVG9QYXRoIH0gZnJvbSAndXJsJ1xuXG5jb25zdCBfX2Rpcm5hbWUgPSBwYXRoLmRpcm5hbWUoZmlsZVVSTFRvUGF0aChpbXBvcnQubWV0YS51cmwpKVxuXG4vLyBodHRwczovL3ZpdGVqcy5kZXYvY29uZmlnL1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcHVibGljRGlyOiAncHVibGljJyxcbiAgZW52RGlyOiAnLi4vJyxcbiAgZW52UHJlZml4OiBbJ1ZJVEVfJywgJ0NLQl8nLCAnTUlYRVJfJywgJ05VTExJRklFUl8nLCAnWktfJywgJ1NURUFMVEhfJywgJ0NUXyddLFxuICBwbHVnaW5zOiBbXG4gICAgcmVhY3QoKSxcbiAgICBub2RlUG9seWZpbGxzKHtcbiAgICAgIGluY2x1ZGU6IFsnY3J5cHRvJywgJ3N0cmVhbScsICd1dGlsJywgJ3BhdGgnLCAnb3MnXSxcbiAgICAgIGdsb2JhbHM6IHsgZ2xvYmFsOiB0cnVlLCBwcm9jZXNzOiB0cnVlIH0sXG4gICAgfSlcbiAgXVxufSlcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBcVcsU0FBUyxvQkFBb0I7QUFDbFksT0FBTyxXQUFXO0FBQ2xCLFNBQVMscUJBQXFCO0FBQzlCLE9BQU8sVUFBVTtBQUNqQixTQUFTLHFCQUFxQjtBQUpxTSxJQUFNLDJDQUEyQztBQU1wUixJQUFNLFlBQVksS0FBSyxRQUFRLGNBQWMsd0NBQWUsQ0FBQztBQUc3RCxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixXQUFXO0FBQUEsRUFDWCxRQUFRO0FBQUEsRUFDUixXQUFXLENBQUMsU0FBUyxRQUFRLFVBQVUsY0FBYyxPQUFPLFlBQVksS0FBSztBQUFBLEVBQzdFLFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLGNBQWM7QUFBQSxNQUNaLFNBQVMsQ0FBQyxVQUFVLFVBQVUsUUFBUSxRQUFRLElBQUk7QUFBQSxNQUNsRCxTQUFTLEVBQUUsUUFBUSxNQUFNLFNBQVMsS0FBSztBQUFBLElBQ3pDLENBQUM7QUFBQSxFQUNIO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
