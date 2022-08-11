const customLaunchers = {
  // Sandbox does not work in un-privileged dockers, so
  // use a custom launcher when run in a docker container
  ChromeInDocker: {
    base: 'ChromeHeadless',
    flags: ['--no-sandbox', '--headless', '--disable-gpu', '--disable-translate', '--disable-extensions'],
  },

  // All sorts of BrowserStack browsers, you can create your using:
  // https://www.browserstack.com/automate/capabilities
  ChromeWindows11: {
    base: 'BrowserStack',
    browser: 'Chrome',
    os: 'Windows',
    os_version: '11',
  },
  ChromeWindows10: {
    base: 'BrowserStack',
    browser: 'Chrome',
    os: 'Windows',
    os_version: '10',
  },
  Chrome70Windows8: {
    base: 'BrowserStack',
    browser: 'Chrome',
    browser_version: '70.0', // Oldest version not blocked for Doctolib users (see: https://github.com/doctolib/doctolib/blob/f381579/app/controllers/concerns/outdated_browsers.rb)
    os: 'Windows',
    os_version: '8.1', // Oldest Windows version still supported - https://endoflife.date/windows
  },
  ChomeOSX: {
    base: 'BrowserStack',
    browser: 'Chrome',
    os: 'OS X',
    os_version: 'Monterey',
  },
  Chrome70OSX: {
    base: 'BrowserStack',
    browser: 'Chrome',
    browser_version: '70.0', // Oldest version not blocked for Doctolib users (see: https://github.com/doctolib/doctolib/blob/f381579/app/controllers/concerns/outdated_browsers.rb)
    os: 'OS X',
    os_version: 'Catalina',
  },
  EdgeWindows11: {
    base: 'BrowserStack',
    browser: 'Edge',
    os: 'Windows',
    os_version: '11',
  },
  EdgeWindows10: {
    base: 'BrowserStack',
    browser: 'Edge',
    os: 'Windows',
    os_version: '10',
  },
  Edge88Windows8: {
    base: 'BrowserStack',
    browser: 'Edge',
    browserVersion: '88.0', // Oldest version not blocked for Doctolib users (see: https://github.com/doctolib/doctolib/blob/f381579/app/controllers/concerns/outdated_browsers.rb)
    os: 'Windows',
    os_version: '8.1', // Oldest Windows version still supported - https://endoflife.date/windows
  },
  FirefoxWindows11: {
    base: 'BrowserStack',
    browser: 'Firefox',
    os: 'Windows',
    os_version: '11',
  },
  FirefoxWindows10: {
    base: 'BrowserStack',
    browser: 'Firefox',
    os: 'Windows',
    os_version: '10',
  },
  Firefox78Windows8: {
    base: 'BrowserStack',
    browser: 'Firefox',
    browser_version: '78.0', // Oldest version not blocked for Doctolib users (see: https://github.com/doctolib/doctolib/blob/f381579/app/controllers/concerns/outdated_browsers.rb)
    os: 'Windows',
    os_version: '8.1', // Oldest Windows version still supported - https://endoflife.date/windows
  },
  FirefoxOSX: {
    base: 'BrowserStack',
    browser: 'Firefox',
    os: 'OS X',
    os_version: 'Monterey',
  },
  Firefox78OSX: {
    base: 'BrowserStack',
    browser: 'Firefox',
    browser_version: '78.0', // Oldest version not blocked for Doctolib users (see: https://github.com/doctolib/doctolib/blob/f381579/app/controllers/concerns/outdated_browsers.rb)
    os: 'OS X',
    os_version: 'Catalina', // Oldest macOS still supported - https://endoflife.date/macos
  },
  OperaOSX: {
    base: 'BrowserStack',
    browser: 'Opera',
    os: 'OS X',
    os_version: 'Monterey',
  },
  Safari15Monterey: {
    base: 'BrowserStack',
    browser: 'Safari',
    browser_version: '15.3',
    os: 'OS X',
    os_version: 'Monterey',
  },
  Safari14BigSur: {
    base: 'BrowserStack',
    browser: 'Safari',
    browser_version: '14.1',
    os: 'OS X',
    os_version: 'Big Sur',
  },
  Safari13Catalina: {
    base: 'BrowserStack',
    browser: 'Safari',
    browser_version: '13.1', // Oldest version not blocked for Doctolib patients (see: https://github.com/doctolib/doctolib/blob/f381579/app/controllers/concerns/outdated_browsers.rb)
    os: 'OS X',
    os_version: 'Catalina',
  },
  iOS15: {
    base: 'BrowserStack',
    device: 'iPhone 13',
    real_mobile: 'true',
    os: 'ios',
    os_version: '15',
  },
  iOS14: {
    base: 'BrowserStack',
    device: 'iPhone 12',
    real_mobile: 'true',
    os: 'ios',
    os_version: '14',
  },
  iOS13: {
    base: 'BrowserStack',
    device: 'iPhone XS',
    real_mobile: 'true',
    os: 'ios',
    os_version: '13', // Oldest version not blocked for Doctolib patients (see: https://github.com/doctolib/doctolib/blob/f381579/app/controllers/concerns/outdated_browsers.rb)
  },
  Android12Samsung: {
    base: 'BrowserStack',
    browser: 'samsung', // version 17.0 (as of 2022-08-18) - https://en.wikipedia.org/wiki/Samsung_Internet
    device: 'Samsung Galaxy S22',
    real_mobile: 'true',
    os: 'Android',
    os_version: '12.0',
  },
  Android12Chrome: {
    base: 'BrowserStack',
    browser: 'chrome',
    device: 'Samsung Galaxy S22',
    real_mobile: 'true',
    os: 'Android',
    os_version: '12.0',
  },
  Android10Chrome: {
    base: 'BrowserStack',
    browser: 'chrome',
    device: 'Samsung Galaxy S20',
    real_mobile: 'true',
    os: 'Android',
    os_version: '10.0',
  },
  Android8Chrome: {
    base: 'BrowserStack',
    browser: 'chrome',
    device: 'Samsung Galaxy S9',
    real_mobile: 'true',
    os: 'Android',
    os_version: '8.0',
  },
  Android6Chrome: {
    base: 'BrowserStack',
    browser: 'chrome',
    device: 'Samsung Galaxy S7',
    real_mobile: 'true',
    os: 'Android',
    os_version: '6.0',
  },
};

module.exports = { customLaunchers };
