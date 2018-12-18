// @noflow
const path = require('path');
const baseConfig = require('../../../config/rollup.config');

const flatten = (arr) => arr.reduce((acc, val) => acc.concat(val), []);

const packages = [
  'base',
  'browser',
  'node',
];

module.exports = flatten(packages.map(pack => {
  const packageRoot = path.join(__dirname, '..', pack);

  const outputs = {
    base: [
      { target: 'browser', path: path.resolve(packageRoot, 'dist', 'browser.js') },
      { target: 'node', path: path.resolve(packageRoot, 'dist', 'index.js') },
      { target: 'es', path: path.resolve(packageRoot, 'dist', 'es.js') },
    ],
    browser: [
      { target: 'browser', path: path.resolve(packageRoot, 'dist', 'index.js') },
      { target: 'es', path: path.resolve(packageRoot, 'dist', 'es.js') },
    ],
    node: [
      { target: 'node', path: path.resolve(packageRoot, 'dist', 'index.js') },
      { target: 'es', path: path.resolve(packageRoot, 'dist', 'es.js') },
    ]
  }[pack];

  return baseConfig({
    input: path.resolve(packageRoot, 'src', 'index.js'),
    outputs,
    copies: [
      {
        src: path.resolve(packageRoot, 'package.json'),
        dest: path.resolve(packageRoot, 'dist', 'package.json'),
        edit: (string) => string.replace(/"src\/([^"]+)"/g, (_, p1) => `"${p1}"`),
      },
      {
        src: path.resolve(packageRoot, 'README.md'),
        dest: path.resolve(packageRoot, 'dist', 'README.md'),
      },
      {
        src: path.resolve(packageRoot, 'LICENSE'),
        dest: path.resolve(packageRoot, 'dist', 'LICENSE'),
      },
    ],
  });
}));
