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
      '@tanker/test-utils': path.resolve(__dirname, '../packages/test-utils/src/index.ts'),
      '@tanker/global-this': path.resolve(__dirname, '../packages/global-this/src/index.ts'),
      '@tanker/types': path.resolve(__dirname, '../packages/types/src/index.ts'),
      '@tanker/http-utils': path.resolve(__dirname, '../packages/http-utils/src/index.ts'),
      '@tanker/fake-authentication': path.resolve(__dirname, '../packages/fake-authentication/src/index.ts'),
      '@tanker/stream-base': path.resolve(__dirname, '../packages/stream/base/src/index.ts'),
      '@tanker/stream-cloud-storage': path.resolve(__dirname, '../packages/stream/cloud-storage/src/index.ts'),
      '@tanker/datastore-base': path.resolve(__dirname, '../packages/datastore/base/src/index.ts'),
      '@tanker/datastore-dexie-base': path.resolve(__dirname, '../packages/datastore/dexie-base/src/index.ts'),
      '@tanker/datastore-dexie-browser': path.resolve(__dirname, '../packages/datastore/dexie-browser/src/index.ts'),
      '@tanker/datastore-dexie-memory': path.resolve(__dirname, '../packages/datastore/dexie-memory/src/index.ts'),
      '@tanker/datastore-pouchdb-base': path.resolve(__dirname, '../packages/datastore/pouchdb-base/src/index.ts'),
      '@tanker/datastore-pouchdb-memory': path.resolve(__dirname, '../packages/datastore/pouchdb-memory/src/index.ts'),
      '@tanker/datastore-pouchdb-node': path.resolve(__dirname, '../packages/datastore/pouchdb-node/src/index.ts'),
      '@tanker/core': path.resolve(__dirname, '../packages/core/src/index.ts'),
      '@tanker/client-node': path.resolve(__dirname, '../packages/client-node/src/index.ts'),
      '@tanker/client-browser': path.resolve(__dirname, '../packages/client-browser/src/index.ts'),
    }
  }
]);

// Babelify everything except node_modules that are not our own stuff
babelConfig.ignore = [file => file.includes('node_modules') && !file.includes('@tanker')];

// Automatically compile on the fly all the files subsequently required
// by node with the .es6, .es, .jsx, .mjs, .js and .ts extensions
babelConfig.extensions = ['.cjs', '.es', '.es6', '.js', '.jsx', '.mjs', '.ts', '.tsx'];

// Install the "require hook" which will:
//   - bind itself to node's require
//
// See: https://babeljs.io/docs/en/babel-register
//
require('@babel/register')(babelConfig);
