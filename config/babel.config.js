// @noflow
const getBabelConfig = ({ target, coverage, react, hmre }) => {
  const config = {
    presets: ['@babel/preset-flow'],
    plugins: ['@babel/plugin-proposal-class-properties'],
  };

  if (target === 'node') {
    config.presets.push(['@babel/preset-env', { targets: { node: 8 } }]);
  } else if (target === 'web') {
    config.presets.push(['@babel/preset-env', {
      targets: { browsers: ['last 2 versions', 'Firefox ESR', 'not ie < 11', 'not dead'] }
    }]);
    config.plugins.push(['@babel/plugin-transform-runtime', { corejs: 2 }]);
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
