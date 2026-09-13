(() => {
  const parameters = new URLSearchParams(location.search);
  const nonce = parameters.get('nonce');
  const result = parameters.get('result');
  if (window.opener && nonce && (result === 'success' || result === 'error')) {
    window.opener.postMessage({ type: 'super-rps-google-auth-complete', nonce, result }, location.origin);
  }
  window.close();
})();
