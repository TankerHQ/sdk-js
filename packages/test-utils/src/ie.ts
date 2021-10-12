const isIE = () => typeof navigator !== 'undefined' && !!navigator.userAgent.match(/Trident\/7\./);
const isBrowser = () => typeof navigator !== 'undefined';

export { isIE, isBrowser };
