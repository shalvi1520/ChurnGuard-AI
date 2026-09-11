// ============================================
// ChurnGuard – Dataset history (browser persistence)
// ============================================
//
// WHY THIS EXISTS, SEPARATELY FROM services/api.js
// ------------------------------------------------
// `services/api.js` is still the single place that talks to the ChurnGuard
// backend. This module talks to the *browser* instead: it remembers the
// datasets a user has connected so they never have to hunt down and re-pick
// the same export again. It makes no HTTP calls and defines no metrics — when
// a saved dataset is reused, the file is handed back to the existing
// `datasetService` upload → validate → map → predict pipeline, unchanged.
// There is exactly one ingestion path.
//
// WHAT IS STORED
// --------------
// Metadata (rows, columns, source, mapped fields, timestamps) plus, when we
// have it, the original file as a Blob. Blobs live in IndexedDB — never in
// localStorage, which is a small synchronous string store and the wrong place
// for a multi-megabyte spreadsheet.
//
// WHAT IS NOT STORED
// ------------------
// Customer records, risk scores, dashboards or model output. Those belong to
// the active dataset (backend memory + AppContext) and would be a second,
// immediately-stale copy of the truth. History is metadata + the ability to
// re-run the real pipeline.
//
// HONESTY
// -------
// The backend holds one dataset in process memory, so a saved dataset is
// genuinely re-registered and re-trained when it is reused — this module never
// pretends a previous session's model is still alive. If the browser has no
// IndexedDB, or the stored file is gone, callers get a typed failure so the UI
// can say so instead of silently doing nothing.

const DB_NAME = 'churnguard';
const DB_VERSION = 1;
const STORE_NAME = 'datasetHistory';
const USER_INDEX = 'byUser';

/** Files larger than this are remembered as metadata only. A browser database
 *  is not a file server, and quota failures are worse than an honest
 *  "reconnect the original file". */
export const MAX_STORED_FILE_BYTES = 25 * 1024 * 1024;

/** How many entries one user keeps. Oldest unused entries fall off the end. */
export const MAX_HISTORY_ENTRIES = 25;

export const HISTORY_STATUS = {
  /** The original file is stored — one click puts it back through the pipeline. */
  restorable: 'restorable',
  /** We know what it was, but not enough to replay it (CRM import, or too large). */
  metadataOnly: 'metadata-only',
};

/** Thrown when the browser cannot give us persistent storage at all. */
export class HistoryUnavailableError extends Error {
  constructor(message = 'Saved datasets are not available in this browser.') {
    super(message);
    this.name = 'HistoryUnavailableError';
  }
}

// ---------------------------------------------------------------- pure logic
//
// Everything below this line is deliberately free of IndexedDB so the record
// semantics (creation, de-duplication, user scoping, deletion, restoration)
// can be tested directly — see datasetHistory.test.js.

/** Identifies "the same dataset connected again" so a re-run updates the
 *  existing entry instead of stacking near-identical rows. */
export function historyFingerprint({ userKey, name, sourceKind, rowCount, columnCount }) {
  return [userKey || '', sourceKind || '', name || '', rowCount ?? '', columnCount ?? ''].join('|');
}

/**
 * Builds the canonical history record. This is the ONLY shape written to
 * storage — no page keeps its own variant of dataset metadata.
 */
export function buildHistoryRecord(input, now = Date.now()) {
  const {
    userKey,
    name,
    sourceKind = 'upload',
    provider = null,
    sourceDetail = null,
    rowCount = null,
    columnCount = null,
    requiredFieldCount = null,
    requiredTotal = null,
    mappedFields = [],
    file = null,
  } = input;

  const storable = file && typeof file.size === 'number' && file.size <= MAX_STORED_FILE_BYTES;
  const timestamp = new Date(now).toISOString();

  return {
    id: `DH-${now}-${Math.random().toString(36).slice(2, 8)}`,
    userKey: userKey || null,
    name: name || 'Untitled dataset',
    sourceKind,
    provider,
    sourceDetail,
    rowCount,
    columnCount,
    requiredFieldCount,
    requiredTotal,
    mappedFields: [...mappedFields],
    createdAt: timestamp,
    lastUsedAt: timestamp,
    status: storable ? HISTORY_STATUS.restorable : HISTORY_STATUS.metadataOnly,
    // Why it can't be replayed, said plainly rather than left for the user to
    // work out. Null when it can.
    unavailableReason: storable
      ? null
      : file
        ? 'This file was too large to keep a copy of in your browser.'
        : sourceKind === 'crm'
          ? 'Data pulled from a CRM is not stored locally — reconnect the source to use it again.'
          : 'No local copy of this dataset was saved.',
    fingerprint: historyFingerprint({ userKey, name, sourceKind, rowCount, columnCount }),
    file: storable
      ? { name: file.name, type: file.type || 'text/csv', size: file.size, blob: file }
      : null,
  };
}

/** Re-connecting the same dataset updates the existing entry (and its stored
 *  file) rather than creating a duplicate. */
export function mergeHistoryRecord(existing, incoming) {
  if (!existing) return incoming;
  return {
    ...existing,
    ...incoming,
    id: existing.id,
    createdAt: existing.createdAt,
    // Keep a usable stored file if the new run didn't provide one.
    file: incoming.file || existing.file,
    status: incoming.file ? incoming.status : existing.file ? existing.status : incoming.status,
    unavailableReason: incoming.file || existing.file ? null : incoming.unavailableReason,
  };
}

/** Newest use first — how anyone actually looks for a previous dataset. */
export function sortHistory(records) {
  return [...records].sort(
    (a, b) => new Date(b.lastUsedAt || 0) - new Date(a.lastUsedAt || 0)
  );
}

/** History is per signed-in user; another account's datasets are never listed. */
export function selectForUser(records, userKey) {
  if (!userKey) return [];
  return sortHistory(records.filter((r) => r.userKey === userKey));
}

/** Rebuilds the original file so it can go back through the normal upload
 *  path. Returns null when there is nothing stored to rebuild. */
export function toRestorableFile(record) {
  if (!record?.file?.blob) return null;
  const { blob, name, type } = record.file;
  if (typeof File === 'undefined') return blob;
  return new File([blob], name || record.name, { type: type || 'text/csv' });
}

export function isRestorable(record) {
  return Boolean(record?.file?.blob);
}

/** The message shown when a saved dataset cannot be put back. */
export const UNAVAILABLE_MESSAGE =
  'Saved dataset is no longer available in this browser. Please reconnect the original file.';

// ------------------------------------------------------------ IndexedDB layer
//
// A driver is just `{ getAll, put, remove }`. Keeping it behind this contract
// is what lets the store's behaviour be tested without a browser database.

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      reject(new HistoryUnavailableError());
      return;
    }
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      reject(new HistoryUnavailableError());
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex(USER_INDEX, 'userKey', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new HistoryUnavailableError('Your browser blocked ChurnGuard from saving dataset history.'));
    request.onblocked = () =>
      reject(new HistoryUnavailableError('Dataset history is locked by another ChurnGuard tab.'));
  });
}

/** Runs one request inside a transaction and resolves once the transaction
 *  itself completes — an IndexedDB request can succeed and still be rolled
 *  back, so waiting on the transaction is what makes a write trustworthy. */
function runTransaction(db, mode, work) {
  return new Promise((resolve, reject) => {
    let request;
    const tx = db.transaction(STORE_NAME, mode);
    try {
      request = work(tx.objectStore(STORE_NAME));
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve(request ? request.result : undefined);
    tx.onerror = () => reject(tx.error || new Error('Dataset history request failed.'));
    tx.onabort = () => reject(tx.error || new Error('Dataset history request was aborted.'));
  });
}

async function withDatabase(mode, work) {
  const db = await openDatabase();
  try {
    return await runTransaction(db, mode, work);
  } finally {
    db.close();
  }
}

export function createIndexedDbDriver() {
  return {
    async getAll() {
      return (await withDatabase('readonly', (store) => store.getAll())) || [];
    },
    async put(record) {
      await withDatabase('readwrite', (store) => store.put(record));
      return record;
    },
    async remove(id) {
      await withDatabase('readwrite', (store) => store.delete(id));
    },
  };
}

// ------------------------------------------------------------------- the store

/**
 * The one dataset-history API the app uses. `driver` exists so the record
 * semantics can be exercised in tests against an in-memory implementation of
 * the same three-method contract.
 */
export function createHistoryStore(driver) {
  async function all() {
    const records = await driver.getAll();
    return Array.isArray(records) ? records : [];
  }

  return {
    /** Every saved dataset for this user, newest use first. */
    async list(userKey) {
      return selectForUser(await all(), userKey);
    },

    async get(id) {
      const records = await all();
      return records.find((r) => r.id === id) || null;
    },

    /**
     * Records a dataset the user just connected. Re-connecting the same
     * dataset updates its entry instead of adding a duplicate, and the list is
     * trimmed so history can't grow without bound.
     */
    async save(input) {
      const record = buildHistoryRecord(input);
      const existing = (await all()).find(
        (r) => r.userKey === record.userKey && r.fingerprint === record.fingerprint
      );
      const merged = mergeHistoryRecord(existing, record);
      await driver.put(merged);

      const mine = selectForUser(await all(), record.userKey);
      // Drop the least recently used entries beyond the cap, oldest first, so
      // nothing is orphaned in the database.
      for (const stale of mine.slice(MAX_HISTORY_ENTRIES)) {
        await driver.remove(stale.id);
      }
      return merged;
    },

    /** Marks an entry as used now — called when a dataset is reconnected. */
    async touch(id) {
      const record = await this.get(id);
      if (!record) return null;
      const updated = { ...record, lastUsedAt: new Date().toISOString() };
      await driver.put(updated);
      return updated;
    },

    async remove(id) {
      await driver.remove(id);
    },
  };
}

/** The instance the app uses. */
export const datasetHistory = createHistoryStore(createIndexedDbDriver());

export default datasetHistory;
