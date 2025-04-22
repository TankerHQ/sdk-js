const customLaunchers = {
  // Sandbox does not work in un-privileged dockers, so
  // use a custom launcher when run in a docker container
  ChromeInDocker: {
    base: 'ChromeHeadless',
    flags: ['--no-sandbox', '--headless', '--disable-gpu', '--disable-translate', '--disable-extensions'],
  },
};

module.exports = { customLaunchers };
