// @noflow
// Inspired by: https://github.com/meuter/rollup-plugin-copy but:
//   - adding an edit function to modify content of the file,
//   - using an array of copy configs instead of a map of src/dest file paths,
//   - using the colorette package which is faster than colors,
//   - fixing bugs (global var, not returning the promise...)
const fse = require('fs-extra');
const path = require('path');
const { green, red } = require('colorette');

const name = 'rollup-plugin-copy-edit';

const cross = '\u2718';
const tick = '\u2714';

const success = (src, dest, mode) => {
  console.log(`(${name}) '${green(src)}' -> '${green(dest)}' (${green(tick)})`); // eslint-disable-line no-console
  if (mode) {
    console.log(`(${name}) mode set to ${green(mode)} on '${green(dest)}' (${green(tick)})`); // eslint-disable-line no-console
  }
};

const fatal = (src, dest, err) => {
  console.error(`(${name}) '${red(src)}' -> '${red(dest)}' (${red(cross)})`);
  console.error(`\n    ${err}\n`);
  process.exit(err.errno);
};

const copyFile = async ({ src, dest, edit, mode }) => {
  try {
    const destFolder = path.dirname(dest);
    await fse.mkdirp(destFolder);

    let content = await fse.readFile(src, { encoding: 'utf8' });
    if (edit) { content = edit(content); }
    await fse.writeFile(dest, content);
    if (mode) {
      await fse.chmod(dest, mode);
    }

    success(src, dest, mode);
  } catch (err) {
    fatal(src, dest, err);
  }
};

module.exports = (configs) => ({
  name,
  generateBundle: () => Promise.all(configs.map(copyFile))
});
