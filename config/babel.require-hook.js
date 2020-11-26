// @noflow
const getBabelConfig = require('./babel.config');

// Install the "require hook" which will:
//   - bind itself to node's require
//   - automatically compile on the fly all the files subsequently required by node
//     with the .es6, .es, .jsx, .mjs, and .js extensions
//
// See: https://babeljs.io/docs/en/babel-register
//
require('@babel/register')({
  // Babelify everything except node_modules that are not our own stuff
  ignore: [file => file.includes('node_modules') && !file.includes('@tanker')],
  ...getBabelConfig({ target: 'node', coverage: true }),
});
