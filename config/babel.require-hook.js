// @noflow
const path = require('path');
const getBabelConfig = require('./babel.config');

const coverage = !['false', '0'].includes(process.env.COVERAGE);

const babelConfig = getBabelConfig({ target: 'node', coverage });
babelConfig.plugins.push([
  require.resolve('babel-plugin-module-resolver'),
  {
    alias: {
      '@tanker/errors': path.resolve(__dirname, '../packages/errors/src/index.ts'),
      '@tanker/crypto': path.resolve(__dirname, '../packages/crypto/src/index.ts'),
    }
  }
]);

// Babelify everything except node_modules that are not our own stuff
babelConfig.ignore = [file => file.includes('node_modules') && !file.includes('@tanker')];

// Install the "require hook" which will:
//   - bind itself to node's require
//   - automatically compile on the fly all the files subsequently required by node
//     with the .es6, .es, .jsx, .mjs, and .js extensions
//
// See: https://babeljs.io/docs/en/babel-register
//
require('@babel/register')(babelConfig);
