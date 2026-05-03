// vite.config.ts
import { defineConfig } from "file:///C:/Users/HP/Documents/people/ckb-privacy-mixer/node_modules/.pnpm/vite@4.5.14_@types+node@20.19.39/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/HP/Documents/people/ckb-privacy-mixer/node_modules/.pnpm/@vitejs+plugin-react@4.7.0_vite@4.5.14_@types+node@20.19.39_/node_modules/@vitejs/plugin-react/dist/index.js";
import { nodePolyfills } from "file:///C:/Users/HP/Documents/people/ckb-privacy-mixer/node_modules/.pnpm/vite-plugin-node-polyfills@_81559d17427d57be3e2573af9d2d716b/node_modules/vite-plugin-node-polyfills/dist/index.js";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ["crypto", "stream", "util", "path", "os", "buffer"],
      globals: { Buffer: true, global: true, process: true }
    })
  ]
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxIUFxcXFxEb2N1bWVudHNcXFxccGVvcGxlXFxcXGNrYi1wcml2YWN5LW1peGVyXFxcXGZyb250ZW5kXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxIUFxcXFxEb2N1bWVudHNcXFxccGVvcGxlXFxcXGNrYi1wcml2YWN5LW1peGVyXFxcXGZyb250ZW5kXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy9IUC9Eb2N1bWVudHMvcGVvcGxlL2NrYi1wcml2YWN5LW1peGVyL2Zyb250ZW5kL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSdcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCdcbmltcG9ydCB7IG5vZGVQb2x5ZmlsbHMgfSBmcm9tICd2aXRlLXBsdWdpbi1ub2RlLXBvbHlmaWxscydcblxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtcbiAgICByZWFjdCgpLFxuICAgIG5vZGVQb2x5ZmlsbHMoe1xuICAgICAgaW5jbHVkZTogWydjcnlwdG8nLCAnc3RyZWFtJywgJ3V0aWwnLCAncGF0aCcsICdvcycsICdidWZmZXInXSxcbiAgICAgIGdsb2JhbHM6IHsgQnVmZmVyOiB0cnVlLCBnbG9iYWw6IHRydWUsIHByb2Nlc3M6IHRydWUgfSxcbiAgICB9KVxuICBdLFxufSlcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBcVcsU0FBUyxvQkFBb0I7QUFDbFksT0FBTyxXQUFXO0FBQ2xCLFNBQVMscUJBQXFCO0FBRzlCLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLGNBQWM7QUFBQSxNQUNaLFNBQVMsQ0FBQyxVQUFVLFVBQVUsUUFBUSxRQUFRLE1BQU0sUUFBUTtBQUFBLE1BQzVELFNBQVMsRUFBRSxRQUFRLE1BQU0sUUFBUSxNQUFNLFNBQVMsS0FBSztBQUFBLElBQ3ZELENBQUM7QUFBQSxFQUNIO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
