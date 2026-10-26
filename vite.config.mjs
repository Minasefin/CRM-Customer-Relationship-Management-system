import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the built app loads from the local file system inside Electron.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173, strictPort: true },
});
