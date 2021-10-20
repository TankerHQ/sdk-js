const getBabelConfig = ({ target, coverage, react, hmre, modules }) => {
  // Presets and plugins will be applied in the following order:
  //   1. plugins from first to last
  //   2. presets from last to first
  // See: https://babeljs.io/docs/en/plugins/#plugin-ordering
  const config = {
    presets: [],
    plugins: [
      '@babel/plugin-proposal-class-properties',
    ],
  };

  if (target === 'node') {
    config.presets.push(['@babel/preset-env', {
      targets: { node: 10 },
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
  }

  if (react) {
    config.presets.push('@babel/preset-react');

    if (hmre)
      config.plugins.push('react-hot-loader/babel');
  }

  if (coverage)
    config.plugins.push('istanbul');

  config.presets.push('@babel/preset-typescript');

  return config;
};

module.exports = getBabelConfig;
