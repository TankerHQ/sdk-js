const getBabelConfig = ({ target, coverage }) => {
  const config = {
    presets: ['@babel/preset-flow'],
    plugins: [
      ['@babel/plugin-transform-runtime', { corejs: 2 }],
      '@babel/plugin-proposal-object-rest-spread',
      '@babel/plugin-proposal-class-properties',
    ],
  };

  if (target === 'node')
    config.presets.push(['@babel/preset-env', { targets: { node: 8 } }]);
  else if (target === 'web')
    config.presets.push(['@babel/preset-env', { targets: { browsers: ['last 2 versions', 'ie >= 11'] } }]);

  if (coverage)
    config.plugins.push('istanbul');

  return config;
};

module.exports = getBabelConfig;
