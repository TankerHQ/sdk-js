// @noflow
const path = require('path');
const baseConfig = require('../../../config/rollup.config');

module.exports = baseConfig({
  input: path.resolve(__dirname, '..', 'src', 'index.js'),
  outputs: [
    { target: 'es', path: path.resolve(__dirname, '..', 'dist', 'es.js') },
    { target: 'node', path: path.resolve(__dirname, '..', 'dist', 'index.js') },
  ],
  copies: [
    {
      src: path.resolve(__dirname, '..', 'package.json'),
      dest: path.resolve(__dirname, '..', 'dist', 'package.json'),
      edit: (string) => string.replace(/"src\/([^"]+)"/g, (_, p1) => `"${p1}"`),
    },
    {
      src: path.resolve(__dirname, '..', 'README.md'),
      dest: path.resolve(__dirname, '..', 'dist', 'README.md'),
    },
    {
      src: path.resolve(__dirname, '..', 'LICENSE'),
      dest: path.resolve(__dirname, '..', 'dist', 'LICENSE'),
    },
  ],
});
