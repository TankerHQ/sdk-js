const babel = require('rollup-plugin-babel');
const flow = require('rollup-plugin-flow');
const localResolve = require('rollup-plugin-local-resolve');
const { terser } = require('rollup-plugin-terser');

const copy = require('./rollup-plugin-copy-edit');
const getBabelConfig = require('./babel.config');

const babelPresets = {
  node: getBabelConfig({ target: 'node' }),
  browser: getBabelConfig({ target: 'web' }),
  es: getBabelConfig({ target: 'es' }),
};

const buildFormats = {
  node: 'cjs',
  browser: 'cjs',
  es: 'es',
};

const makeConfig = ({ input, output, target, copies }) => ({
  input,
  output: {
    file: output,
    format: buildFormats[target],
    exports: 'named',
  },
  plugins: [
    localResolve(),
    flow(),
    babel({
      exclude: 'node_modules/**', // only transpile our source code
      babelrc: false,
      runtimeHelpers: true,
      ...babelPresets[target],
    }),
    terser(),
    copy(copies)
  ],
});

module.exports = ({ input, outputs, copies }) => (
  outputs.map(({ path, target }, index) => (
    makeConfig({
      input,
      output: path,
      target,
      // Steps below only need to be run once:
      copies: index === 0 ? copies : []
    })
  ))
);
