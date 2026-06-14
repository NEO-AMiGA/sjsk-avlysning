import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const jsonDir = path.resolve(process.env.HARAD_JSON_DIR ?? 'data/debug/harad-week-table');
const metadataPath = process.env.HARAD_METADATA_PATH
  ? path.resolve(process.env.HARAD_METADATA_PATH)
  : null;
const outputPath = path.resolve(process.env.HARAD_AVLYSNINGAR_JSON_PATH ?? 'avlysningar.json');

const monthMap = {
  Jan: '01',
  Feb: '02',
  Mar: '03',
  Apr: '04',
  May: '05',
  Jun: '06',
  Jul: '07',
  Aug: '08',
  Sep: '09',
  Oct: '10',
  Nov: '11',
  Dec: '12',
};

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

function extractYearFromText(value) {
  const match = value?.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function extractWeekFromText(value) {
  const match = value?.match(/\bv(\d{1,2})\b/i);
  return match ? Number(match[1]) : null;
}

function normalizeMetadataNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number === 999 || number === 9999) {
    return null;
  }

  return number;
}

function getSourceYear(parsedWeek, metadata, pdfFilename) {
  return (
    normalizeMetadataNumber(metadata?.year) ??
    extractYearFromText(metadata?.title) ??
    extractYearFromText(metadata?.url) ??
    extractYearFromText(pdfFilename) ??
    null
  );
}

function getSourceWeek(parsedWeek, metadata, pdfFilename) {
  return (
    normalizeMetadataNumber(metadata?.week) ??
    extractWeekFromText(metadata?.title) ??
    extractWeekFromText(metadata?.url) ??
    parsedWeek.week ??
    extractWeekFromText(pdfFilename) ??
    null
  );
}

function toIsoDate(value, year) {
  const match = value.match(/^(\d{2})\s+([A-Z][a-z]{2})$/);

  if (!match || !year) {
    return null;
  }

  const [, day, monthToken] = match;
  const month = monthMap[monthToken];

  if (!month) {
    return null;
  }

  return `${year}-${month}-${day}`;
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

function buildItem(parsedWeek, day, metadata, pdfFilename) {
  const normalizedTime = normalizeRestrictedTime(day.restrictedTime);

  if (!normalizedTime) {
    return null;
  }

  const year = getSourceYear(parsedWeek, metadata, pdfFilename);
  const week = getSourceWeek(parsedWeek, metadata, pdfFilename);
  const isoDate = toIsoDate(day.date, year);

  if (!year || !week || !isoDate) {
    return null;
  }

  return {
    id: `harad-${year}-v${week}-${isoDate}-${normalizedTime.startCompact}-${normalizedTime.endCompact}`,
    week,
    year,
    dayName: dayNameMap[day.dayName] ?? day.dayName,
    date: isoDate,
    start: normalizedTime.start,
    end: normalizedTime.end,
    restrictedTime: normalizedTime.restrictedTime,
    dangerRange: day.dangerRange,
    pdfTitle: metadata?.title ?? pdfFilename,
    pdfUrl: metadata?.url ?? '',
  };
}

function sortItems(items) {
  return [...items].sort((left, right) => {
    const leftKey = `${left.date}-${left.start}-${left.id}`;
    const rightKey = `${right.date}-${right.start}-${right.id}`;
    return leftKey.localeCompare(rightKey);
  });
}

async function main() {
  const [metadataMap, parsedWeeks] = await Promise.all([
    loadMetadataMap(),
    loadParsedWeeks(),
  ]);
  const dedupedItems = new Map();

  for (const parsedWeek of parsedWeeks) {
    const metadata = metadataMap.get(parsedWeek.pdfFilename);

    for (const day of parsedWeek.data.days) {
      const item = buildItem(parsedWeek.data, day, metadata, parsedWeek.pdfFilename);

      if (item) {
        dedupedItems.set(item.id, item);
      }
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    source: 'forsvarsmakten',
    range: 'harad',
    items: sortItems([...dedupedItems.values()]),
  };

  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(path.relative(process.cwd(), outputPath));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
