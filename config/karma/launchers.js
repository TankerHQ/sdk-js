
const customLaunchers = {

  // Sandbox does not work in un-privileged dockers, so
  // use a custom launcher when run in a docker container
  ChromiumInDocker: {
    base: 'ChromiumHeadless',
    flags: ['--no-sandbox', '--headless', '--disable-gpu', '--disable-translate', '--disable-extensions'],
  },

  // All sorts of BrowserStack browsers, you can create your using:
  // https://www.browserstack.com/automate/capabilities
  ChromeWindows: {
    base: 'BrowserStack',
    browser: 'Chrome',
    os: 'Windows',
    os_version: '10',
  },
  Chrome70Windows: {
    base: 'BrowserStack',
    browser: 'Chrome',
    browser_version: '70.0',
    os: 'Windows',
    os_version: '10',
  },
  ChromeWindows7: {
    base: 'BrowserStack',
    browser: 'Chrome',
    os: 'Windows',
    os_version: '7',
  },
  ChromeOsx: {
    base: 'BrowserStack',
    browser: 'Chrome',
    os: 'OS X',
    os_version: 'Mojave',
  },
  EdgeWindows: {
    base: 'BrowserStack',
    browser: 'Edge',
    os: 'Windows',
    os_version: '10',
  },
  IeWindows: {
    base: 'BrowserStack',
    browser: 'IE',
    browser_version: '11.0',
    os: 'Windows',
    os_version: '7',
  },
  FirefoxWindows: {
    base: 'BrowserStack',
    browser: 'Firefox',
    os: 'Windows',
    os_version: '10',
  },
  Firefox64Windows: {
    base: 'BrowserStack',
    browser: 'Firefox',
    browser_version: '64.0',
    os: 'Windows',
    os_version: '8.1',
  },
  FirefoxWindows7: {
    base: 'BrowserStack',
    browser: 'Firefox',
    os: 'Windows',
    os_version: '7',
  },
  FirefoxOsx: {
    base: 'BrowserStack',
    browser: 'Firefox',
    os: 'OS X',
    os_version: 'Mojave',
  },
  SafariMojave: {
    base: 'BrowserStack',
    browser: 'Safari',
    browser_version: '12.0',
    os: 'OS X',
    os_version: 'Mojave',
  },
  SafariHighSierra: {
    base: 'BrowserStack',
    browser: 'Safari',
    browser_version: '11.1',
    os: 'OS X',
    os_version: 'High Sierra',
  },
  SafariSierra: {
    base: 'BrowserStack',
    browser: 'Safari',
    browser_version: '10.0',
    os: 'OS X',
    os_version: 'Sierra',
  },
  SafariElCapitan: {
    base: 'BrowserStack',
    browser: 'Safari',
    browser_version: '9.1',
    os: 'OS X',
    os_version: 'El Capitan',
  },
  iPhone8: {
    base: 'BrowserStack',
    device: 'iPhone 8',
    real_mobile: 'true',
    os: 'ios',
    os_version: '11.0',
  },
  Android7: {
    base: 'BrowserStack',
    device: 'Samsung Galaxy S8',
    real_mobile: 'true',
    os: 'Android',
    os_version: '7.0',
  },
  Android5: {
    base: 'BrowserStack',
    device: 'Samsung Galaxy S6',
    real_mobile: 'true',
    os: 'Android',
    os_version: '5.0',
  },
}

module.exports = { customLaunchers };
