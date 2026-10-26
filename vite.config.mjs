import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Content Security Policy for the built app: only the app's own files can run or load.
// No outside scripts, no outside connections, no plugins, no frames. Photos and logos are
// stored as data: images, so those are allowed for images only.
// (Left off in dev because the live-reload server injects its own scripts.)
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
].join('; ');

const csp = {
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
};

// base './' so the built app loads from the local file system inside Electron.
export default defineConfig({
  plugins: [react(), csp],
  base: './',
  server: { port: 5173, strictPort: true, host: 'localhost' },
  build: { sourcemap: false, assetsInlineLimit: 0 }, // no inlined data: fonts or scripts, so the CSP can stay strict
});
