// @noflow
const getBabelConfig = ({ target, coverage, react, hmre, modules }) => {
  const config = {
    presets: ['@babel/preset-flow'],
    plugins: ['@babel/plugin-proposal-class-properties'],
  };

  if (target === 'node') {
    config.presets.push(['@babel/preset-env', {
      targets: { node: 8 },
      modules: modules || 'auto',
    }]);
  } else if (target === 'web') {
    // Note: @babel/preset-env with useBuiltIns set (e.g. "usage") is mutually exclusive with
    //       @babel/plugin-transform-runtime, which is more suitable for libraries for now.
    // See: https://github.com/babel/babel/issues/10271#issuecomment-528379505
    //      https://github.com/babel/babel/issues/10008#issue-446717469
    config.presets.push(['@babel/preset-env', {
      targets: { browsers: ['last 2 versions', 'Firefox ESR', 'not ie < 11', 'not dead'] },
      modules: modules || 'auto',
    }]);
    // Injects "pure" ponyfills (but packages will depend on @babel/runtime-corejs3)
    // See: https://babeljs.io/docs/en/babel-plugin-transform-runtime#technical-details
    config.plugins.push(['@babel/plugin-transform-runtime', {
      corejs: 3,
      version: '^7.6.0', // Keep this in sync with @babel/runtime-corejs3 version
    }]);
  }

  if (react) {
    config.presets.push('@babel/preset-react');

    if (hmre)
      config.plugins.push('react-hot-loader/babel');
  }

  if (coverage)
    config.plugins.push('istanbul');

  return config;
};

module.exports = getBabelConfig;
