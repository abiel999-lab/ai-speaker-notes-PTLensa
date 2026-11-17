(() => {
  'use strict';
  try {
    if (window.opener && window.opener !== window) {
      window.opener.postMessage({type:'notepreso:auth-complete'}, window.location.origin);
      window.close();
      return;
    }
  } catch (_) {}
  window.location.replace('/app');
})();
