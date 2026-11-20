(() => {
  'use strict';
  function request(url, options, progress) {
    const {signal, headers, body, method='POST', timeout=0} = options;
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(new DOMException('Upload canceled.', 'AbortError')); return; }
      const xhr = new XMLHttpRequest();
      let phase = 'upload';
      const abort = () => xhr.abort();
      const fail = (message, name='Error') => {
        const error = new Error(message);
        error.name = name;
        error.phase = phase;
        reject(error);
      };
      xhr.open(method, url);
      xhr.responseType = 'blob';
      xhr.timeout = timeout;
      new Headers(headers).forEach((value,key) => xhr.setRequestHeader(key,value));
      xhr.upload.addEventListener('progress', event => {
        if (phase === 'upload') progress({phase, percent:event.lengthComputable ? Math.min(99,Math.floor(100*event.loaded/event.total)) : null});
      });
      xhr.upload.addEventListener('load', () => { phase='analysis'; progress({phase}); });
      xhr.addEventListener('load', () => {
        const responseHeaders = new Headers();
        for (const row of xhr.getAllResponseHeaders().trim().split(/[\r\n]+/)) {
          const colon = row.indexOf(':');
          if (colon > 0) responseHeaders.append(row.slice(0,colon),row.slice(colon+1).trim());
        }
        const empty = [204,205,304].includes(xhr.status);
        resolve(new Response(empty ? null : xhr.response,{status:xhr.status,headers:responseHeaders}));
      });
      xhr.addEventListener('error', () => fail(phase==='upload'
        ? 'The connection was interrupted during upload. Retry on a stable connection.'
        : 'The server response was interrupted after upload. Check for a saved result before retrying.'));
      xhr.addEventListener('timeout', () => fail(phase==='upload'
        ? 'The upload timed out before the file finished sending.'
        : 'The server took too long after upload. Check for a saved result before retrying.'));
      xhr.addEventListener('abort', () => fail('Upload canceled.','AbortError'));
      xhr.addEventListener('loadend', () => signal?.removeEventListener('abort',abort), {once:true});
      signal?.addEventListener('abort',abort,{once:true});
      progress({phase,percent:0});
      xhr.send(body);
    });
  }
  function describe(progress, analysis='Upload complete. Analyzing the file on the server…') {
    if (progress.phase !== 'upload') return analysis;
    return progress.percent == null ? 'Uploading the file…' : 'Uploading the file… ' + progress.percent + '%';
  }
  function indicator(anchor) {
    const element = document.createElement('progress');
    element.max = 100;
    element.style.width = '100%';
    element.style.accentColor = '#087e8e';
    element.setAttribute('aria-label','File upload and server processing');
    element.hidden = true;
    anchor.after(element);
    return {
      update(progress) {
        element.hidden = false;
        if (progress.percent != null) element.value = progress.percent;
        else element.removeAttribute('value');
      },
      hide() { element.hidden = true; },
      remove() { element.remove(); },
    };
  }
  window.NotePresoUpload = {request, describe, indicator};
})();
