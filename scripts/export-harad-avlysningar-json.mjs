import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  getSourceWeek,
  getSourceYear,
  isoWeekDate,
  sourceLabelToIsoDate,
} from './harad-week-utils.mjs';

const jsonDir = path.resolve(process.env.HARAD_JSON_DIR ?? 'data/debug/harad-week-table');
const metadataPath = process.env.HARAD_METADATA_PATH
  ? path.resolve(process.env.HARAD_METADATA_PATH)
  : null;
const outputPath = path.resolve(process.env.HARAD_AVLYSNINGAR_JSON_PATH ?? 'avlysningar.json');

const dayNameMap = {
  Monday: 'Måndag',
  Tuesday: 'Tisdag',
  Wednesday: 'Onsdag',
  Thursday: 'Torsdag',
  Friday: 'Fredag',
  Saturday: 'Lördag',
  Sunday: 'Söndag',
};

function sortFiles(files) {
  return [...files].sort((left, right) => left.localeCompare(right, 'sv'));
}

async function loadMetadataMap() {
  if (!metadataPath) {
    return new Map();
  }

  try {
    const content = await readFile(metadataPath, 'utf8');
    const items = JSON.parse(content);
    return new Map(items.map((item) => [item.filename, item]));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return new Map();
    }

    throw error;
  }
}

async function loadParsedWeeks() {
  const entries = await readdir(jsonDir);
  const jsonFiles = sortFiles(entries.filter((entry) => entry.toLowerCase().endsWith('.json')));

  return Promise.all(
    jsonFiles.map(async (filename) => {
      const filePath = path.join(jsonDir, filename);
      const content = await readFile(filePath, 'utf8');

      return {
        filename,
        pdfFilename: filename.replace(/\.json$/i, '.pdf'),
        data: JSON.parse(content),
      };
    }),
  );
}

function normalizeClockToken(value) {
  const digits = value.replace(/[^\d]/g, '');

  if (digits.length === 3) {
    return `0${digits[0]}:${digits.slice(1, 3)}`;
  }

  if (digits.length !== 4) {
    return null;
  }

  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
}

function normalizeRestrictedTime(value) {
  const match = value.trim().match(/^(\d{1,2}(?::|\.)?\d{2})\s*-\s*(\d{1,2}(?::|\.)?\d{2})$/);

  if (!match) {
    return null;
  }

  const start = normalizeClockToken(match[1]);
  const end = normalizeClockToken(match[2]);

  if (!start || !end) {
    return null;
  }

  return {
    start,
    end,
    restrictedTime: `${start}-${end}`,
    startCompact: start.replace(':', ''),
    endCompact: end.replace(':', ''),
  };
}

function buildWarnings(sourceDate, exportedDate) {
  if (sourceDate && exportedDate && sourceDate !== exportedDate) {
    return ['DATE_OUTSIDE_SOURCE_WEEK'];
  }

  return [];
}

function getWarningCodes(warnings) {
  return warnings.map((warning) => (typeof warning === 'string' ? warning : warning.code)).filter(Boolean);
}

export function buildItem(parsedWeek, day, metadata, pdfFilename) {
  const normalizedTime = normalizeRestrictedTime(day.restrictedTime);

  if (!normalizedTime) {
    return null;
  }

  const year = getSourceYear(metadata, pdfFilename);
  const week = getSourceWeek(metadata, parsedWeek.week, pdfFilename);
  const sourceDateLabel = day.sourceDateLabel ?? day.date;
  const sourceDate = sourceLabelToIsoDate(sourceDateLabel, year);
  const exportedDate = isoWeekDate(year, week, day.dayName);

  if (!year || !week || !exportedDate || !sourceDate) {
    return null;
  }

  const warnings = buildWarnings(sourceDate, exportedDate);
  const reviewRequired = warnings.length > 0;

  return {
    id: `harad-${year}-v${week}-${exportedDate}-${normalizedTime.startCompact}-${normalizedTime.endCompact}`,
    week,
    year,
    dayName: dayNameMap[day.dayName] ?? day.dayName,
    date: exportedDate,
    start: normalizedTime.start,
    end: normalizedTime.end,
    restrictedTime: normalizedTime.restrictedTime,
    dangerRange: day.dangerRange,
    pdfTitle: metadata?.title ?? pdfFilename,
    pdfUrl: metadata?.url ?? '',
    sourceDate,
    sourceDateLabel,
    warnings,
    reviewRequired,
    calendarEligible: day.dangerRange === 'JA',
  };
}

function buildDocumentDiagnostic(parsedWeek, metadata, pdfFilename, exportedItems) {
  const warnings = getWarningCodes(parsedWeek.warnings ?? []);
  const parsedRows = parsedWeek.days.length;
  const exportedItemCount = exportedItems.length;
  const rowsWithTime = parsedWeek.days.filter((day) => normalizeRestrictedTime(day.restrictedTime)).length;
  const dangerJaItems = exportedItems.filter((item) => item.dangerRange === 'JA').length;

  if (exportedItemCount === 0) {
    warnings.push('NO_EXPORT_ITEMS');
  }

  if (parsedRows > 0 && rowsWithTime === 0) {
    warnings.push('NO_RESTRICTED_TIME_INTERVALS');
  }

  return {
    pdfTitle: metadata?.title ?? pdfFilename,
    pdfUrl: metadata?.url ?? '',
    pdfFilename,
    week: getSourceWeek(metadata, parsedWeek.week, pdfFilename),
    weekEnd: parsedWeek.weekEnd ?? null,
    weekLabel: parsedWeek.weekLabel ?? String(getSourceWeek(metadata, parsedWeek.week, pdfFilename) ?? ''),
    year: getSourceYear(metadata, pdfFilename),
    parsedRows,
    exportedItems: exportedItemCount,
    dangerJaItems,
    warnings: [...new Set(warnings)],
  };
}

function sortItems(items) {
  return [...items].sort((left, right) => {
    const leftKey = `${left.year}-${String(left.week).padStart(2, '0')}-${left.date}-${left.start}-${left.id}`;
    const rightKey = `${right.year}-${String(right.week).padStart(2, '0')}-${right.date}-${right.start}-${right.id}`;
    return leftKey.localeCompare(rightKey);
  });
}

async function main() {
  const [metadataMap, parsedWeeks] = await Promise.all([
    loadMetadataMap(),
    loadParsedWeeks(),
  ]);
  const items = [];
  const documents = [];

  for (const parsedWeek of parsedWeeks) {
    const metadata = metadataMap.get(parsedWeek.pdfFilename);
    const exportedItems = [];

    for (const day of parsedWeek.data.days) {
      const item = buildItem(parsedWeek.data, day, metadata, parsedWeek.pdfFilename);

      if (item) {
        items.push(item);
        exportedItems.push(item);
      }
    }

    documents.push(buildDocumentDiagnostic(parsedWeek.data, metadata, parsedWeek.pdfFilename, exportedItems));
  }

  const output = {
    generatedAt: new Date().toISOString(),
    source: 'forsvarsmakten',
    range: 'harad',
    documents,
    items: sortItems(items),
  };

  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(path.relative(process.cwd(), outputPath));
}

const entryFilePath = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === entryFilePath) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
