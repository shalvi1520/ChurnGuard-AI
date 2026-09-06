// ============================================
// ChurnGuard – CSV parsing & dataset profiling
// ============================================
//
// The data-setup flow reports real numbers (rows, columns, missing values,
// duplicates) computed from the file the user actually picked, rather than
// hardcoded statistics. These helpers do that work in the browser; they are
// consumed by the mock branch of `datasetService` in `services/api.js`.
//
// Pure functions, no React/DOM dependencies.

const DELIMITER_CANDIDATES = [',', ';', '\t', '|'];
const PREVIEW_ROW_COUNT = 5;

/** Values that count as "missing" once trimmed. */
const MISSING_TOKENS = new Set(['', 'na', 'n/a', 'null', 'none', 'nan', '-', '?']);

export function isMissingValue(value) {
  return MISSING_TOKENS.has(String(value ?? '').trim().toLowerCase());
}

/** Reads the first physical line, ignoring newlines inside quoted fields. */
function firstLine(text) {
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === '\n' || ch === '\r')) return text.slice(0, i);
  }
  return text;
}

/** Picks whichever candidate separator occurs most often in the header line. */
function detectDelimiter(headerLine) {
  let best = ',';
  let bestCount = 0;
  for (const candidate of DELIMITER_CANDIDATES) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < headerLine.length; i++) {
      const ch = headerLine[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes && ch === candidate) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}

/**
 * Parses delimited text (RFC 4180-style quoting) into a header + row matrix.
 * Returns `{ columns: string[], rows: string[][], delimiter }`.
 */
export function parseCsv(text) {
  if (typeof text !== 'string') return { columns: [], rows: [], delimiter: ',' };

  // Strip a UTF-8 BOM so the first header doesn't get an invisible prefix.
  const source = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).trim();
  if (!source) return { columns: [], rows: [], delimiter: ',' };

  const delimiter = detectDelimiter(firstLine(source));
  const records = [];
  let record = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      record.push(field);
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      record.push(field);
      field = '';
      records.push(record);
      record = [];
    } else {
      field += ch;
    }
  }
  record.push(field);
  records.push(record);

  const [header = [], ...body] = records;
  const columns = header.map((name, i) => name.trim() || `Column ${i + 1}`);

  // Drop rows that are entirely blank (trailing newlines, stray separators).
  const rows = body.filter((row) => row.some((cell) => cell.trim() !== ''));

  return { columns, rows, delimiter };
}

function inferColumnType(values, uniqueCount, rowCount) {
  if (values.length === 0) return 'empty';

  const numericCount = values.reduce(
    (acc, v) => (Number.isFinite(Number(v.replace(/[$,%\s]/g, ''))) ? acc + 1 : acc),
    0
  );
  if (numericCount / values.length >= 0.9) return 'numeric';

  // Every value distinct across a non-trivial file → almost certainly an ID.
  if (rowCount > 4 && uniqueCount === rowCount) return 'identifier';

  if (uniqueCount <= Math.max(2, Math.round(rowCount * 0.05))) return 'categorical';
  return 'text';
}

/**
 * Computes per-column and dataset-level statistics from a parsed CSV.
 * Everything returned here is derived from the file — nothing is assumed.
 */
export function profileDataset({ columns = [], rows = [] }) {
  const rowCount = rows.length;
  const columnCount = columns.length;

  const columnStats = columns.map((name, index) => {
    const values = [];
    let missing = 0;
    const seen = new Set();

    for (let r = 0; r < rowCount; r++) {
      const raw = rows[r][index];
      if (isMissingValue(raw)) {
        missing++;
        continue;
      }
      const value = String(raw).trim();
      values.push(value);
      seen.add(value);
    }

    return {
      name,
      type: inferColumnType(values, seen.size, rowCount),
      missing,
      missingPercent: rowCount ? (missing / rowCount) * 100 : 0,
      unique: seen.size,
      sample: values[0] ?? '',
    };
  });

  const totalCells = rowCount * columnCount;
  const missingCells = columnStats.reduce((acc, c) => acc + c.missing, 0);

  const seenRows = new Set();
  let duplicateRows = 0;
  for (let r = 0; r < rowCount; r++) {
    const key = rows[r].join('');
    if (seenRows.has(key)) duplicateRows++;
    else seenRows.add(key);
  }

  const preview = rows.slice(0, PREVIEW_ROW_COUNT).map((row) =>
    Object.fromEntries(columns.map((name, i) => [name, row[i] ?? '']))
  );

  return {
    rowCount,
    columnCount,
    columns: columnStats,
    missingCells,
    missingPercent: totalCells ? (missingCells / totalCells) * 100 : 0,
    duplicateRows,
    emptyColumns: columnStats.filter((c) => c.type === 'empty').map((c) => c.name),
    preview,
  };
}

/** Counts how many rows carry a recognisable "already churned" label. */
export function countChurnLabels(rows, columnIndex) {
  if (columnIndex < 0) return null;
  const positives = new Set(['yes', 'y', 'true', '1', 'churn', 'churned']);
  let count = 0;
  for (const row of rows) {
    if (positives.has(String(row[columnIndex] ?? '').trim().toLowerCase())) count++;
  }
  return count;
}
