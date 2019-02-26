// @noflow
module.exports = require('@babel/register')({
  ignore: [file => file.includes('node_modules') && !file.includes('@tanker')],
  presets: [
    '@babel/preset-flow',
    ['@babel/preset-env', { targets: { node: 8 } }]
  ],
  plugins: [
    '@babel/plugin-syntax-dynamic-import',
    '@babel/plugin-proposal-object-rest-spread',
    '@babel/plugin-proposal-class-properties',
  ],
});
