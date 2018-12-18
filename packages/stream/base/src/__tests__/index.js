// @flow

// require all modules ending in ".spec.js" or ".spec.web.js" from the
// current directory and all subdirectories
const testsContext = (require: any).context('.', true, /\.spec(\.web)?\.js$/);
testsContext.keys().forEach(testsContext);
