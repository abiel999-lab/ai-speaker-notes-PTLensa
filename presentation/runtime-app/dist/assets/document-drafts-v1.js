let database;

function openDrafts() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open("notepreso-presentation-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); database = undefined; };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error("Draft storage could not open."));
  }).catch(error => { database = undefined; throw error; });
  return database;
}

export async function loadDocumentDraft(key) {
  const db = await openDrafts();
  return new Promise((resolve,reject) => {
    const request = db.transaction("drafts").objectStore("drafts").get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDocumentDraft(key, value) {
  const db = await openDrafts();
  return new Promise((resolve,reject) => {
    const transaction = db.transaction("drafts","readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || Error("Draft could not be saved."));
    transaction.objectStore("drafts").put(value,key);
  });
}

export function readSlideImage(blob, signal) {
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    const stop = () => reader.abort();
    if (signal.aborted) {reject(signal.reason);return;}
    signal.addEventListener("abort",stop,{once:true});
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.onabort = () => reject(signal.reason);
    reader.onloadend = () => signal.removeEventListener("abort",stop);
    reader.readAsDataURL(blob);
  });
}
