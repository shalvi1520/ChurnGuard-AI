import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { readTabularFile, getFileExtension, isSupportedFile, SUPPORTED_EXTENSIONS } from './spreadsheet';
import { profileDataset } from './csv';
import { suggestMappings } from '../mock/datasetSchema';

/** Builds a real workbook in memory and wraps it as a File, like an upload. */
function workbookFile(sheets, filename) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  const buffer = XLSX.write(wb, { type: 'array', bookType: filename.endsWith('.xls') ? 'biff8' : 'xlsx' });
  return new File([buffer], filename, { type: 'application/octet-stream' });
}

const CUSTOMER_ROWS = [
  ['customerID', 'tenure', 'MonthlyCharges', 'Contract', 'Churn'],
  ['A-1', 12, 45.5, 'Month-to-month', 'Yes'],
  ['A-2', 30, 80.25, 'One year', 'No'],
  ['A-3', 5, 20, 'Month-to-month', 'Yes'],
];

describe('file type detection', () => {
  it('recognises the formats the UI advertises', () => {
    expect(SUPPORTED_EXTENSIONS).toEqual(['.csv', '.xlsx', '.xls']);
    expect(isSupportedFile('customers.csv')).toBe(true);
    expect(isSupportedFile('Customers.XLSX')).toBe(true);
    expect(isSupportedFile('legacy.xls')).toBe(true);
  });

  it('rejects formats the parser cannot handle', () => {
    expect(isSupportedFile('report.pdf')).toBe(false);
    expect(isSupportedFile('data.json')).toBe(false);
    expect(isSupportedFile('noextension')).toBe(false);
  });

  it('reads the extension case-insensitively', () => {
    expect(getFileExtension('A.Xlsx')).toBe('.xlsx');
    expect(getFileExtension('none')).toBe('');
  });
});

describe('readTabularFile', () => {
  it('reads a CSV into headers and rows', async () => {
    const file = new File(['a,b\n1,2\n3,4'], 'x.csv', { type: 'text/csv' });
    const result = await readTabularFile(file);
    expect(result.columns).toEqual(['a', 'b']);
    expect(result.rows).toEqual([['1', '2'], ['3', '4']]);
    expect(result.sheetName).toBeNull();
  });

  it('reads an .xlsx workbook into the same shape as a CSV', async () => {
    const result = await readTabularFile(workbookFile({ Sheet1: CUSTOMER_ROWS }, 'customers.xlsx'));
    expect(result.columns).toEqual(['customerID', 'tenure', 'MonthlyCharges', 'Contract', 'Churn']);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toEqual(['A-1', '12', '45.5', 'Month-to-month', 'Yes']);
    expect(result.sheetName).toBe('Sheet1');
  });

  it('reads a legacy .xls workbook', async () => {
    const result = await readTabularFile(workbookFile({ Data: CUSTOMER_ROWS }, 'legacy.xls'));
    expect(result.columns[0]).toBe('customerID');
    expect(result.rows).toHaveLength(3);
    expect(result.sheetName).toBe('Data');
  });

  it('skips leading empty sheets and reports which one it used', async () => {
    const file = workbookFile({ Notes: [[]], Customers: CUSTOMER_ROWS }, 'multi.xlsx');
    const result = await readTabularFile(file);
    expect(result.sheetName).toBe('Customers');
    expect(result.sheetCount).toBe(2);
    expect(result.rows).toHaveLength(3);
  });

  it('returns headers with no rows when a sheet has only a header', async () => {
    const result = await readTabularFile(workbookFile({ Only: [['a', 'b']] }, 'headers.xlsx'));
    expect(result.columns).toEqual(['a', 'b']);
    expect(result.rows).toEqual([]);
  });

  it('names an unlabelled column in the middle rather than dropping it', async () => {
    // A blank header between two named ones is common in hand-edited exports.
    const result = await readTabularFile(workbookFile({ S: [['id', '', 'name'], ['1', '2', 'x']] }, 'gap.xlsx'));
    expect(result.columns).toEqual(['id', 'Column 2', 'name']);
    expect(result.rows[0]).toEqual(['1', '2', 'x']);
  });

  it('ignores a trailing blank header column', async () => {
    const result = await readTabularFile(workbookFile({ S: [['id', ''], ['1', '']] }, 'trailing.xlsx'));
    expect(result.columns).toEqual(['id']);
  });

  it('throws for a format it cannot parse', async () => {
    await expect(readTabularFile(new File(['x'], 'report.pdf'))).rejects.toThrow(/Unsupported file type/);
  });
});

describe('one ingestion pipeline for every format', () => {
  it('profiles and auto-maps a spreadsheet exactly like a CSV', async () => {
    const csv = await readTabularFile(
      new File([CUSTOMER_ROWS.map((r) => r.join(',')).join('\n')], 'c.csv', { type: 'text/csv' })
    );
    const xlsx = await readTabularFile(workbookFile({ S: CUSTOMER_ROWS }, 'c.xlsx'));

    const csvProfile = profileDataset(csv);
    const xlsxProfile = profileDataset(xlsx);

    expect(xlsxProfile.rowCount).toBe(csvProfile.rowCount);
    expect(xlsxProfile.columnCount).toBe(csvProfile.columnCount);
    expect(xlsxProfile.columns.map((c) => c.name)).toEqual(csvProfile.columns.map((c) => c.name));
    expect(xlsxProfile.columns.map((c) => c.type)).toEqual(csvProfile.columns.map((c) => c.type));

    const mapping = suggestMappings(xlsxProfile.columns.map((c) => c.name));
    expect(mapping).toMatchObject({
      customer_id: 'customerID',
      tenure: 'tenure',
      monthly_charges: 'MonthlyCharges',
      contract_type: 'Contract',
      churn: 'Churn',
    });
  });
});
