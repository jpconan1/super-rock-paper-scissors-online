(() => {
  const parameters = new URLSearchParams(location.search);
  const nonce = parameters.get('nonce');
  const result = parameters.get('result');
  const error = parameters.get('error');
  if (window.opener && nonce && (result === 'success' || result === 'error')) {
    window.opener.postMessage({ type: 'super-rps-google-auth-complete', nonce, result, ...(error ? { error } : {}) }, location.origin);
  }
  window.close();
})();
