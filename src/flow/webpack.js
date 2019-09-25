// @flow

// Use definition from: https://github.com/facebook/flow/blob/v0.108.0/lib/core.js#L882
// and extend to add Webpack's require.context() method
declare var require: {
  (id: string): any,
  resolve: (id: string) => string,
  cache: any,
  main: typeof module,
  /* addition start */
  context: (directory: string, useSubdirectories: bool, regExp: RegExp) => {
    (id: string): any,
    +keys: () => Array<string>
  },
  /* addition end */
  ...
}
