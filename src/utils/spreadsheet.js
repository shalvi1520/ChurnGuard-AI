// ============================================
// ChurnGuard – Tabular file reader (CSV / XLSX / XLS)
// ============================================
//
// One entry point for dataset ingestion. Whatever the user uploads, this
// returns the same `{ columns, rows, sheetName }` shape, so validation,
// profiling, mapping and prediction downstream have a single code path.
//
// Called from the mock branch of `datasetService` in `services/api.js` —
// components never read files directly.

import { parseCsv } from './csv';

/** Extensions this module can genuinely parse. Nothing else may be advertised. */
export const SUPPORTED_EXTENSIONS = ['.csv', '.xlsx', '.xls'];

export function getFileExtension(name) {
  const match = /\.[a-z0-9]+$/i.exec(String(name || '').trim());
  return match ? match[0].toLowerCase() : '';
}

export function isSupportedFile(name) {
  return SUPPORTED_EXTENSIONS.includes(getFileExtension(name));
}

async function readAsText(file) {
  if (typeof file?.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

async function readAsArrayBuffer(file) {
  if (typeof file?.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/** Trailing empty cells are common in spreadsheet exports; trim them off. */
function trimTrailingEmpty(cells) {
  let end = cells.length;
  while (end > 0 && String(cells[end - 1] ?? '').trim() === '') end--;
  return cells.slice(0, end);
}

async function readWorkbook(file) {
  // Loaded on demand: the spreadsheet parser is a large chunk and CSV uploads
  // (and every other page in the app) should never pay for it.
  const XLSX = await import('xlsx');
  const buffer = await readAsArrayBuffer(file);

  // `cellDates` keeps real dates readable; `raw: false` below then hands us the
  // formatted strings the user sees in Excel rather than serial numbers.
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

  // A workbook can hold several sheets. Use the first one that actually has a
  // header row plus data, and tell the caller which it was.
  for (const sheetName of workbook.SheetNames) {
    const grid = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    });
    const [header = [], ...body] = grid;
    const columns = trimTrailingEmpty(header).map((name, i) => String(name).trim() || `Column ${i + 1}`);
    if (columns.length === 0) continue;

    const rows = body
      .map((row) => columns.map((_, i) => String(row[i] ?? '')))
      .filter((row) => row.some((cell) => cell.trim() !== ''));

    if (rows.length > 0) {
      return { columns, rows, sheetName, sheetCount: workbook.SheetNames.length };
    }
  }

  // Nothing usable — fall back to the first sheet's headers so the caller can
  // report "headers but no rows" rather than a generic failure.
  const first = workbook.SheetNames[0];
  const grid = first
    ? XLSX.utils.sheet_to_json(workbook.Sheets[first], { header: 1, raw: false, defval: '' })
    : [];
  const columns = trimTrailingEmpty(grid[0] || []).map((n, i) => String(n).trim() || `Column ${i + 1}`);
  return { columns, rows: [], sheetName: first || null, sheetCount: workbook.SheetNames.length };
}

/**
 * Reads any supported dataset file into `{ columns, rows, sheetName }`.
 * `sheetName` is null for CSV. Throws a plain Error when the format is not one
 * we can parse — callers turn that into user-facing copy.
 */
export async function readTabularFile(file) {
  const extension = getFileExtension(file?.name);

  if (extension === '.csv') {
    const parsed = parseCsv(await readAsText(file));
    return { columns: parsed.columns, rows: parsed.rows, sheetName: null, sheetCount: 1 };
  }

  if (extension === '.xlsx' || extension === '.xls') {
    return readWorkbook(file);
  }

  throw new Error(`Unsupported file type: ${extension || 'unknown'}`);
}
