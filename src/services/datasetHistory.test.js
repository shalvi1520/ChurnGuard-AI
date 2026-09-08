import { describe, it, expect, beforeEach } from 'vitest';
import {
  HISTORY_STATUS,
  MAX_HISTORY_ENTRIES,
  MAX_STORED_FILE_BYTES,
  buildHistoryRecord,
  createHistoryStore,
  historyFingerprint,
  isRestorable,
  selectForUser,
  toRestorableFile,
} from './datasetHistory';

// The store is written against a three-method driver contract precisely so its
// behaviour can be tested without a browser database. This is that contract,
// in memory; the IndexedDB implementation lives in datasetHistory.js.
function createMemoryDriver(seed = []) {
  let records = seed.map((r) => ({ ...r }));
  return {
    async getAll() {
      return records.map((r) => ({ ...r }));
    },
    async put(record) {
      records = [...records.filter((r) => r.id !== record.id), { ...record }];
      return record;
    },
    async remove(id) {
      records = records.filter((r) => r.id !== id);
    },
    count: () => records.length,
  };
}

function csvFile(name = 'customers_2026.csv', contents = 'id,churn\nA1,Yes\n') {
  return new File([contents], name, { type: 'text/csv' });
}

const BASE = {
  userKey: 'ana@example.com',
  name: 'customers_2026.csv',
  sourceKind: 'upload',
  rowCount: 7043,
  columnCount: 21,
  requiredFieldCount: 5,
  requiredTotal: 5,
  mappedFields: ['customer_id', 'tenure', 'monthly_charges', 'contract_type', 'churn'],
};

describe('dataset history — record model', () => {
  it('records the dataset facts and keeps the file when one is given', () => {
    const record = buildHistoryRecord({ ...BASE, file: csvFile() });

    expect(record.userKey).toBe('ana@example.com');
    expect(record.rowCount).toBe(7043);
    expect(record.columnCount).toBe(21);
    expect(record.mappedFields).toHaveLength(5);
    expect(record.status).toBe(HISTORY_STATUS.restorable);
    expect(record.file.name).toBe('customers_2026.csv');
    expect(record.createdAt).toBe(record.lastUsedAt);
  });

  it('never stores customer data — only metadata and the original file', () => {
    const record = buildHistoryRecord({ ...BASE, file: csvFile() });
    expect(record).not.toHaveProperty('customers');
    expect(record).not.toHaveProperty('rows');
    expect(record).not.toHaveProperty('trainingMetrics');
  });

  it('marks a CRM import as metadata-only and says why', () => {
    const record = buildHistoryRecord({
      ...BASE,
      name: 'HubSpot contacts',
      sourceKind: 'crm',
      provider: 'hubspot',
      file: null,
    });

    expect(record.status).toBe(HISTORY_STATUS.metadataOnly);
    expect(isRestorable(record)).toBe(false);
    expect(record.unavailableReason).toMatch(/CRM/i);
  });

  it('refuses to keep a file larger than the storage cap', () => {
    const huge = { name: 'huge.csv', type: 'text/csv', size: MAX_STORED_FILE_BYTES + 1 };
    const record = buildHistoryRecord({ ...BASE, file: huge });

    expect(record.status).toBe(HISTORY_STATUS.metadataOnly);
    expect(record.file).toBeNull();
    expect(record.unavailableReason).toMatch(/too large/i);
  });

  it('treats the same dataset connected again as the same entry', () => {
    const a = historyFingerprint(BASE);
    const b = historyFingerprint({ ...BASE, requiredFieldCount: 4 });
    const c = historyFingerprint({ ...BASE, rowCount: 12 });

    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('dataset history — restoration', () => {
  it('rebuilds a file that can go back through the upload pipeline', () => {
    const record = buildHistoryRecord({ ...BASE, file: csvFile('telco.csv') });
    const file = toRestorableFile(record);

    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('telco.csv');
    expect(file.type).toBe('text/csv');
  });

  it('returns nothing when there is no saved copy to restore', () => {
    const record = buildHistoryRecord({ ...BASE, sourceKind: 'crm', file: null });
    expect(toRestorableFile(record)).toBeNull();
  });
});

describe('dataset history — user scoping', () => {
  it('only ever lists the signed-in user’s datasets', () => {
    const records = [
      buildHistoryRecord({ ...BASE, file: csvFile() }),
      buildHistoryRecord({ ...BASE, userKey: 'someone.else@example.com', file: csvFile() }),
    ];

    expect(selectForUser(records, 'ana@example.com')).toHaveLength(1);
    expect(selectForUser(records, 'someone.else@example.com')).toHaveLength(1);
    expect(selectForUser(records, null)).toHaveLength(0);
  });

  it('orders by most recently used', () => {
    const older = { ...buildHistoryRecord(BASE), lastUsedAt: '2026-01-01T00:00:00.000Z' };
    const newer = { ...buildHistoryRecord({ ...BASE, name: 'b.csv' }), lastUsedAt: '2026-06-01T00:00:00.000Z' };

    expect(selectForUser([older, newer], BASE.userKey).map((r) => r.name)).toEqual([
      'b.csv',
      'customers_2026.csv',
    ]);
  });
});

describe('dataset history — store', () => {
  let driver;
  let store;

  beforeEach(() => {
    driver = createMemoryDriver();
    store = createHistoryStore(driver);
  });

  it('saves a dataset and reads it back for that user', async () => {
    const saved = await store.save({ ...BASE, file: csvFile() });
    const mine = await store.list('ana@example.com');

    expect(mine).toHaveLength(1);
    expect(mine[0].id).toBe(saved.id);
    expect(mine[0].name).toBe('customers_2026.csv');
    expect(await store.list('other@example.com')).toHaveLength(0);
  });

  it('updates the existing entry when the same dataset is connected again', async () => {
    const first = await store.save({ ...BASE, file: csvFile() });
    const second = await store.save({ ...BASE, file: csvFile() });

    expect(second.id).toBe(first.id);
    expect(second.createdAt).toBe(first.createdAt);
    expect(await store.list('ana@example.com')).toHaveLength(1);
  });

  it('keeps an earlier saved file when a later run has none', async () => {
    await store.save({ ...BASE, file: csvFile() });
    const merged = await store.save({ ...BASE, file: null });

    expect(merged.file).not.toBeNull();
    expect(merged.status).toBe(HISTORY_STATUS.restorable);
  });

  it('marks an entry as used without creating a second one', async () => {
    const saved = await store.save({ ...BASE, file: csvFile() });
    const touched = await store.touch(saved.id);

    expect(touched.id).toBe(saved.id);
    expect(new Date(touched.lastUsedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(saved.lastUsedAt).getTime()
    );
    expect(await store.list('ana@example.com')).toHaveLength(1);
  });

  it('deletes an entry and leaves the others alone', async () => {
    const a = await store.save({ ...BASE, name: 'a.csv', file: csvFile('a.csv') });
    await store.save({ ...BASE, name: 'b.csv', file: csvFile('b.csv') });

    await store.remove(a.id);
    const remaining = await store.list('ana@example.com');

    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe('b.csv');
    expect(await store.get(a.id)).toBeNull();
  });

  it('trims the oldest entries so history cannot grow without bound', async () => {
    for (let i = 0; i < MAX_HISTORY_ENTRIES + 3; i += 1) {
      // Distinct names so each one is genuinely a different dataset, and an
      // increasing lastUsedAt so "oldest" is unambiguous.
      const saved = await store.save({ ...BASE, name: `dataset-${i}.csv`, file: csvFile(`dataset-${i}.csv`) });
      await driver.put({ ...saved, lastUsedAt: new Date(2026, 0, 1, 0, i).toISOString() });
    }

    const mine = await store.list('ana@example.com');
    expect(mine).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(mine.some((r) => r.name === 'dataset-0.csv')).toBe(false);
  });
});
