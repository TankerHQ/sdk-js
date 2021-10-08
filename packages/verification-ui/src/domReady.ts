export default ((): Promise<void> => new Promise(resolve => {
  // See: https://developer.mozilla.org/en-US/docs/Web/API/Document/readyState#Values
  if (document.readyState !== 'loading') {
    resolve();
    return;
  }

  const completed = () => {
    document.removeEventListener('DOMContentLoaded', completed);
    window.removeEventListener('load', completed);
    resolve();
  };

  // The document has finished loading. We can now access the DOM elements.
  // But sub-resources such as images, stylesheets and frames are still loading.
  document.addEventListener('DOMContentLoaded', completed);

  // The page is fully loaded. Works everywhere.
  window.addEventListener('load', completed);
}));
