const isIE = () => typeof navigator !== 'undefined' && !!navigator.userAgent.match(/Trident\/7\./);

export { isIE };
