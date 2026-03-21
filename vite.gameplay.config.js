const path = require('path');
const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');

module.exports = defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: path.resolve(__dirname, 'public', 'ui'),
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsDir: '',
    rollupOptions: {
      input: path.resolve(__dirname, 'src', 'gameplay-ui', 'main.jsx'),
      output: {
        entryFileNames: 'gameplay-ui.js',
        chunkFileNames: 'gameplay-ui-[name].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css') {
            return 'gameplay-ui.css';
          }
          return '[name][extname]';
        }
      }
    }
  }
});
