/* ══════════════════════════════════════════════════════════
   LinkShelf v3 — db.js
   IndexedDB engine. No auth, single-user, local-first.
   Stores: links, categories (with parent support).
   ══════════════════════════════════════════════════════════ */

const DB_NAME    = 'linkshelf_v3';
const DB_VERSION = 1;
let   db         = null;

/* ── Open / upgrade ────────────────────────────────────── */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const d = e.target.result;

      /* links store */
      if (!d.objectStoreNames.contains('links')) {
        const ls = d.createObjectStore('links', { keyPath: 'id' });
        ls.createIndex('cat',       'cat',       { unique: false });
        ls.createIndex('saved',     'saved',     { unique: false });
        ls.createIndex('clicks',    'clicks',    { unique: false });
        ls.createIndex('lastVisit', 'lastVisit', { unique: false });
      }

      /* categories store — supports parent for subfolders */
      if (!d.objectStoreNames.contains('categories')) {
        const cs = d.createObjectStore('categories', { keyPath: 'id' });
        cs.createIndex('parent', 'parent', { unique: false });
      }

      /* settings store — key/value */
      if (!d.objectStoreNames.contains('settings')) {
        d.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror   = e => reject(e.target.error);
  });
}

/* ── Generic helpers ───────────────────────────────────── */
function _store(name, mode = 'readonly') {
  return db.transaction([name], mode).objectStore(name);
}
function idbGet(store, key) {
  return new Promise((res, rej) => { const r = _store(store).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
function idbPut(store, obj) {
  return new Promise((res, rej) => { const r = _store(store, 'readwrite').put(obj); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
function idbDelete(store, key) {
  return new Promise((res, rej) => { const r = _store(store, 'readwrite').delete(key); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
}
function idbGetAll(store) {
  return new Promise((res, rej) => { const r = _store(store).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
function idbGetByIndex(store, indexName, value) {
  return new Promise((res, rej) => {
    const idx = _store(store).index(indexName);
    const r   = idx.getAll(value);
    r.onsuccess = () => res(r.result);
    r.onerror   = () => rej(r.error);
  });
}
function idbClear(store) {
  return new Promise((res, rej) => { const r = _store(store, 'readwrite').clear(); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
}

/* ── Link helpers ──────────────────────────────────────── */
async function dbGetLinks() {
  return idbGetAll('links');
}
async function dbPutLink(linkObj) {
  return idbPut('links', linkObj);
}
async function dbDeleteLink(id) {
  return idbDelete('links', id);
}
async function dbDeleteAllLinks() {
  return idbClear('links');
}
async function dbIncrementClick(id) {
  const link = await idbGet('links', id);
  if (!link) return;
  link.clicks    = (link.clicks || 0) + 1;
  link.lastVisit = Date.now();
  await idbPut('links', link);
  return link;
}

/* ── Category helpers ──────────────────────────────────── */
async function dbGetCategories() {
  return idbGetAll('categories');
}
async function dbPutCategory(catObj) {
  return idbPut('categories', catObj);
}
async function dbDeleteCategory(id) {
  return idbDelete('categories', id);
}
async function dbDeleteAllCategories() {
  return idbClear('categories');
}

/* ── Settings helpers ──────────────────────────────────── */
async function dbGetSetting(key, defaultVal = null) {
  const r = await idbGet('settings', key);
  return r ? r.value : defaultVal;
}
async function dbSetSetting(key, value) {
  return idbPut('settings', { key, value });
}
