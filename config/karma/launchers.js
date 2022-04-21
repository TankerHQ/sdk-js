const customLaunchers = {
  // Sandbox does not work in un-privileged dockers, so
  // use a custom launcher when run in a docker container
  ChromeInDocker: {
    base: 'ChromeHeadless',
    flags: ['--no-sandbox', '--headless', '--disable-gpu', '--disable-translate', '--disable-extensions'],
  },

  // All sorts of BrowserStack browsers, you can create your using:
  // https://www.browserstack.com/automate/capabilities
  ChromeWindows10: {
    base: 'BrowserStack',
    browser: 'Chrome',
    os: 'Windows',
    os_version: '10',
  },
  Chrome70Windows7: {
    base: 'BrowserStack',
    browser: 'Chrome',
    browser_version: '70.0',
    os: 'Windows',
    os_version: '7',
  },
  ChomeOSX: {
    base: 'BrowserStack',
    browser: 'Chrome',
    os: 'OS X',
    os_version: 'Mojave',
  },
  EdgeWindows10: {
    base: 'BrowserStack',
    browser: 'Edge',
    os: 'Windows',
    os_version: '10',
  },
  Edge18Windows10: {
    base: 'BrowserStack',
    browser: 'Edge',
    browserVersion: '18.0',
    os: 'Windows',
    os_version: '10',
  },
  FirefoxWindows10: {
    base: 'BrowserStack',
    browser: 'Firefox',
    os: 'Windows',
    os_version: '10',
  },
  Firefox64Windows8: {
    base: 'BrowserStack',
    browser: 'Firefox',
    browser_version: '64.0',
    os: 'Windows',
    os_version: '8.1',
  },
  FirefoxOSX: {
    base: 'BrowserStack',
    browser: 'Firefox',
    os: 'OS X',
    os_version: 'Mojave',
  },
  Safari12Mojave: {
    base: 'BrowserStack',
    browser: 'Safari',
    browser_version: '12.0',
    os: 'OS X',
    os_version: 'Mojave',
  },
  Safari10Sierra: {
    base: 'BrowserStack',
    browser: 'Safari',
    browser_version: '10.0',
    os: 'OS X',
    os_version: 'Sierra',
  },
  iOS12: {
    base: 'BrowserStack',
    device: 'iPhone XS',
    real_mobile: 'true',
    os: 'ios',
    os_version: '12.1',
  },
  iOS10: {
    base: 'BrowserStack',
    device: 'iPhone 7',
    real_mobile: 'true',
    os: 'ios',
    os_version: '10.0',
  },
  Android10: {
    base: 'BrowserStack',
    device: 'Samsung Galaxy S20',
    real_mobile: 'true',
    os: 'Android',
    os_version: '10.0',
  },
  Android8: {
    base: 'BrowserStack',
    device: 'Samsung Galaxy S9',
    real_mobile: 'true',
    os: 'Android',
    os_version: '8.0',
  },
  Android6: {
    base: 'BrowserStack',
    device: 'Samsung Galaxy S7',
    real_mobile: 'true',
    os: 'Android',
    os_version: '6.0',
  },
};

module.exports = { customLaunchers };
