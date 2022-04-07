const path = require('path');
const webpack = require('webpack');

const webResolve = {
  fallback: {
    // libsodium does not use fs nor path in browsers.
    // These packages are referenced in node environment only
    fs: false,
    path: false,
    // libsodium uses node's crypto as a fallback if it doesn't find any other secure
    // random number generator. In our case `window.crypto` is always available
    crypto: false,

    // Node.js polyfills were removed from default behavior in Webpack 5
    // But buffer and process.nextTick are used in `readable-stream` see the README:
    // - https://github.com/nodejs/readable-stream#usage-in-browsers
    buffer: require.resolve('buffer/'),
    process: require.resolve('process/browser'),
  },
};

const getLoaders = (env) => {
  const tsLoaderCompilerOptions = {
    target: 'es2019',
    declaration: false,
    declarationDir: undefined,
    importHelpers: true,
    downlevelIteration: true,
    rootDir: path.resolve(__dirname, '..'),
  };

  return [
    {
      test: /\.ts$/,
      loader: 'ts-loader',
      options: {
        configFile: env.tsconfig || path.resolve(__dirname, 'tsconfig.tests.json'),
        compilerOptions: tsLoaderCompilerOptions,
      },
      exclude: /node_modules/,
    },
    {
      test: /\.js$/,
      loader: 'ts-loader',
      options: {
        configFile: path.resolve(__dirname, 'tsconfig.base.json'),
        compilerOptions: {
          ...tsLoaderCompilerOptions,
          allowJs: true,
        },
      },
      include: [
        // they use esm imports
        /node_modules(\\|\/)((?!core-js).).*(\\|\/)es(\\|\/)/,
        // they use arrow functions
        /node_modules(\\|\/)chai-as-promised/,
        // they use arrow functions
        /node_modules(\\|\/)chai-exclude/,
        // they use object destructuring
        /node_modules(\\|\/)parse5/,
      ],
    },
  ];
};

const makeBaseConfig = ({ mode, target, hmre, devtool, plugins, tsconfig }) => {
  const base = {
    target,
    mode,
    devtool: devtool || (mode === 'development' ? 'source-map' : false),

    context: path.resolve(__dirname, '..'),

    output: {
      filename: mode === 'development' ? 'bundle.js' : 'bundle-[chunkhash].js',
      publicPath: '/',
      // the default function (md4) is not supported by OpenSSL by default starting in Node 17
      hashFunction: 'xxhash64',
    },

    module: {
      rules: [
        ...getLoaders({ target, hmre, tsconfig }),
        {
          test: /\.(eot|ttf|woff|woff2|svg|png|jpg)$/,
          type: 'asset',
          parser: {
            dataUrlCondition: {
              maxSize: 25000,
            },
          },
        },
      ],
    },

    plugins: [
      // Always expose NODE_ENV to webpack, in order to use `process.env.NODE_ENV`
      // inside your code for any environment checks; Terser will automatically
      // drop any unreachable code.
      new webpack.EnvironmentPlugin({ NODE_ENV: mode }),
      ...(plugins || []),
    ],

    node: undefined,
    devServer: undefined,
  };

  if (target === 'web') {
    base.target = ['web', 'es2019'];
    base.resolve = webResolve;
    base.plugins.push(
      // Node.js Polyfills were removed in Webpack 5
      new webpack.ProvidePlugin({
        process: 'process/browser',
      }),
    );
  }

  const extensions = ['.ts', '.js'];

  base.resolve = {
    ...base.resolve,
    alias: {
      '@tanker/errors': path.resolve(__dirname, '../packages/errors/src/index.ts'),
      '@tanker/crypto': path.resolve(__dirname, '../packages/crypto/src/index.ts'),
      '@tanker/test-utils': path.resolve(__dirname, '../packages/test-utils/src/index.ts'),
      '@tanker/global-this': path.resolve(__dirname, '../packages/global-this/src/index.ts'),
      '@tanker/file-ponyfill': path.resolve(__dirname, '../packages/file-ponyfill/src/index.ts'),
      '@tanker/file-reader': path.resolve(__dirname, '../packages/file-reader/src/index.ts'),
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
      '@tanker/client-browser': path.resolve(__dirname, '../packages/client-browser/src/index.ts'),
      '@tanker/functional-tests': path.resolve(__dirname, '../packages/functional-tests/src/index.ts'),
    },
    extensions,
  };

  return base;
};

module.exports = { makeBaseConfig };
