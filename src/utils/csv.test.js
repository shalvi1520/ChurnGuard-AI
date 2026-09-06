import { describe, it, expect } from 'vitest';
import { parseCsv, profileDataset, countChurnLabels } from './csv';
import { suggestMappings } from '../mock/datasetSchema';
import { buildDemoDatasetCsv, DEMO_DATASET_ROWS } from '../mock/demoDataset';

describe('parseCsv', () => {
  it('reads a header row and data rows', () => {
    const { columns, rows } = parseCsv('a,b\n1,2\n3,4');
    expect(columns).toEqual(['a', 'b']);
    expect(rows).toEqual([['1', '2'], ['3', '4']]);
  });

  it('handles quoted fields containing separators and newlines', () => {
    const { rows } = parseCsv('name,note\n"Acme, Inc.","line one\nline two"');
    expect(rows[0]).toEqual(['Acme, Inc.', 'line one\nline two']);
  });

  it('unescapes doubled quotes', () => {
    const { rows } = parseCsv('a\n"say ""hi"""');
    expect(rows[0]).toEqual(['say "hi"']);
  });

  it('detects a semicolon separator', () => {
    const { columns, rows } = parseCsv('a;b\n1;2');
    expect(columns).toEqual(['a', 'b']);
    expect(rows).toEqual([['1', '2']]);
  });

  it('strips a UTF-8 BOM from the first header', () => {
    expect(parseCsv('﻿id,name\n1,x').columns).toEqual(['id', 'name']);
  });

  it('ignores trailing blank lines and CRLF endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n\r\n').rows).toEqual([['1', '2']]);
  });

  it('returns nothing for empty input', () => {
    expect(parseCsv('')).toEqual({ columns: [], rows: [], delimiter: ',' });
    expect(parseCsv('   \n  ').rows).toEqual([]);
  });
});

describe('profileDataset', () => {
  const parsed = parseCsv(
    ['id,tenure,plan', 'A1,10,Basic', 'A2,,Basic', 'A3,30,Pro', 'A3,30,Pro'].join('\n')
  );
  const profile = profileDataset(parsed);

  it('counts rows and columns', () => {
    expect(profile.rowCount).toBe(4);
    expect(profile.columnCount).toBe(3);
  });

  it('counts missing values per column and overall', () => {
    expect(profile.columns.find((c) => c.name === 'tenure').missing).toBe(1);
    expect(profile.missingCells).toBe(1);
    expect(profile.missingPercent).toBeCloseTo((1 / 12) * 100, 5);
  });

  it('counts exact duplicate rows', () => {
    expect(profile.duplicateRows).toBe(1);
  });

  it('infers column types', () => {
    const byName = Object.fromEntries(profile.columns.map((c) => [c.name, c.type]));
    expect(byName.tenure).toBe('numeric');
    expect(byName.plan).toBe('categorical');
  });

  it('previews at most five rows as objects', () => {
    expect(profile.preview[0]).toEqual({ id: 'A1', tenure: '10', plan: 'Basic' });
    expect(profile.preview.length).toBeLessThanOrEqual(5);
  });

  it('flags fully empty columns', () => {
    const empty = profileDataset(parseCsv('a,b\n1,\n2,'));
    expect(empty.emptyColumns).toEqual(['b']);
  });
});

describe('countChurnLabels', () => {
  it('counts recognisable positive labels', () => {
    const rows = [['Yes'], ['no'], ['TRUE'], ['0'], ['1']];
    expect(countChurnLabels(rows, 0)).toBe(3);
  });

  it('returns null when there is no churn column', () => {
    expect(countChurnLabels([['x']], -1)).toBeNull();
  });
});

describe('suggestMappings', () => {
  it('matches Telco-style column names onto ChurnGuard fields', () => {
    const suggestions = suggestMappings(['customerID', 'tenure', 'MonthlyCharges', 'Contract', 'Churn']);
    expect(suggestions).toMatchObject({
      customer_id: 'customerID',
      tenure: 'tenure',
      monthly_charges: 'MonthlyCharges',
      contract_type: 'Contract',
      churn: 'Churn',
    });
  });

  it('leaves fields unmapped when nothing matches', () => {
    expect(suggestMappings(['foo', 'bar'])).toEqual({});
  });

  it('never assigns one column to two fields', () => {
    const suggestions = suggestMappings(['plan', 'contract']);
    expect(new Set(Object.values(suggestions)).size).toBe(Object.values(suggestions).length);
  });
});

describe('demo dataset', () => {
  const profile = profileDataset(parseCsv(buildDemoDatasetCsv()));

  it('is a real CSV whose stats can be measured', () => {
    // 300 generated rows plus the two deliberate duplicates.
    expect(profile.rowCount).toBe(DEMO_DATASET_ROWS + 2);
    expect(profile.duplicateRows).toBe(2);
    expect(profile.missingCells).toBeGreaterThan(0);
  });

  it('maps cleanly onto every required ChurnGuard field', () => {
    const suggestions = suggestMappings(profile.columns.map((c) => c.name));
    expect(Object.keys(suggestions)).toEqual(
      expect.arrayContaining(['customer_id', 'tenure', 'monthly_charges', 'contract_type', 'churn'])
    );
  });

  it('is deterministic', () => {
    expect(buildDemoDatasetCsv()).toBe(buildDemoDatasetCsv());
  });
});
