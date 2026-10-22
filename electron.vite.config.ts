import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          output: resolve(__dirname, 'src/renderer/output.html'),
          stage: resolve(__dirname, 'src/renderer/stage.html'),
          stream: resolve(__dirname, 'src/renderer/stream.html')
        }
      }
    }
  }
});
