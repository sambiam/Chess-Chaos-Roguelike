import { defineConfig } from 'vite';
export default defineConfig({
  root: './',
  server: {
    // port: 5173, // default, can change as needed
    open: true, // automatically open browser on dev start
    proxy: {
      '/api': 'http://localhost:3000' // Means requests to /api/… will be forwarded
    }
  },
  build: {
    outDir: 'dist'
  }
});
