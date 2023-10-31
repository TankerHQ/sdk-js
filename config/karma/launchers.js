const customLaunchers = {
  // Sandbox does not work in un-privileged dockers, so
  // use a custom launcher when run in a docker container
  ChromeInDocker: {
    base: 'ChromeHeadless',
    flags: ['--no-sandbox', '--headless', '--disable-gpu', '--disable-translate', '--disable-extensions'],
  },

  // All sorts of BrowserStack browsers, you can create your using:
  // https://www.browserstack.com/automate/capabilities
  ChromeWindows: {
    base: 'BrowserStack',
    browser: 'Chrome',
    os: 'Windows',
    os_version: '11',
  },
  Chrome80Windows: {
    base: 'BrowserStack',
    browser: 'Chrome',
    os: 'Windows',
    os_version: '11',
    browser_version: '80.0', // Oldest version not blocked for Doctolib users (see: https://github.com/doctolib/doctolib/blob/ed8c215/app/controllers/concerns/outdated_browsers.rb)
  },
  Edge88: {
    base: 'BrowserStack',
    browser: 'Edge',
    os: 'Windows',
    os_version: '11',
    browserVersion: '88.0', // Oldest version not blocked for Doctolib users (see: https://github.com/doctolib/doctolib/blob/ed8c215/app/controllers/concerns/outdated_browsers.rb)
  },
  Firefox78: {
    base: 'BrowserStack',
    browser: 'Firefox',
    os: 'Windows',
    os_version: '11',
    browser_version: '78.0', // Oldest version not blocked for Doctolib users (see: https://github.com/doctolib/doctolib/blob/ed8c215/app/controllers/concerns/outdated_browsers.rb)
  },
  Opera70: {
    base: 'BrowserStack',
    browser: 'Opera',
    os: 'Windows',
    os_version: '11',
    browser_version: '70.0', // Oldest version not blocked for Doctolib users (see: https://github.com/doctolib/doctolib/blob/ed8c215/app/controllers/concerns/outdated_browsers.rb)
  },
  Safari17: {
    base: 'BrowserStack',
    browser: 'Safari',
    os: 'OS X',
    os_version: 'Sonoma',
  },
  Safari14: {
    base: 'BrowserStack',
    browser: 'Safari',
    os: 'OS X',
    os_version: 'Big Sur', // == Safari '14.1' Oldest version not blocked for Doctolib users (see: https://github.com/doctolib/doctolib/blob/ed8c215/app/controllers/concerns/outdated_browsers.rb)
  },
  iOS: {
    base: 'BrowserStack',
    device: 'iPhone 15',
    real_mobile: 'true',
    os: 'ios',
    os_version: '17',
  },
  AndroidChrome: {
    base: 'BrowserStack',
    browser: 'chrome',
    device: 'Samsung Galaxy S23',
    real_mobile: 'true',
    os: 'Android',
    os_version: '13.0',
  },
  Android11Samsung: {
    base: 'BrowserStack',
    browser: 'samsung',
    device: 'Samsung Galaxy S21',
    real_mobile: 'true',
    os: 'Android',
    os_version: '11.0', // Oldest version not blocked for Doctolib users (see: https://github.com/doctolib/doctolib/blob/ed8c215/app/controllers/concerns/outdated_browsers.rb)
  },
  Android6Chrome: {
    base: 'BrowserStack',
    browser: 'chrome',
    device: 'Samsung Galaxy S7',
    real_mobile: 'true',
    os: 'Android',
    os_version: '6.0', // Oldest version not blocked for Doctolib users (see. https://play.google.com/store/apps/details?id=fr.doctolib.www)
  },
};

module.exports = { customLaunchers };
