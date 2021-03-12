// @noflow
const babel = require('@rollup/plugin-babel').default;
const localResolve = require('rollup-plugin-local-resolve');

const copy = require('./rollup-plugin-copy-edit');
const getBabelConfig = require('./babel.config');

const targetMap = { node: 'node', browser: 'web', es: 'es' };

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
    babel({
      exclude: 'node_modules/**', // only transpile our source code
      babelrc: false,
      babelHelpers: target === 'browser' ? 'runtime' : 'bundled',
      ...getBabelConfig({ target: targetMap[target], react: true }),
    }),
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
