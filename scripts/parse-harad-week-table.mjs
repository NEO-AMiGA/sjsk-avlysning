import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';

const samplesDir = path.resolve(process.env.HARAD_PDF_DIR ?? 'data/samples');
const outputDir = path.resolve(process.env.HARAD_JSON_DIR ?? 'data/debug/harad-week-table');

const dayNameMap = {
  Måndag: 'Monday',
  Tisdag: 'Tuesday',
  Onsdag: 'Wednesday',
  Torsdag: 'Thursday',
  Fredag: 'Friday',
  Lördag: 'Saturday',
  Söndag: 'Sunday',
};

const monthMap = {
  jan: 'Jan',
  feb: 'Feb',
  mar: 'Mar',
  apr: 'Apr',
  maj: 'May',
  jun: 'Jun',
  jul: 'Jul',
  aug: 'Aug',
  sep: 'Sep',
  okt: 'Oct',
  nov: 'Nov',
  dec: 'Dec',
};

const dayLinePattern =
  /^(Måndag|Tisdag|Onsdag|Torsdag|Fredag|Lördag|Söndag)\s+(\d{1,2})\s+([A-Za-zåäö]{3})\s+(.*)$/i;
const timeRangePattern = /^(\d{4}-\d{4})\s*(.*)$/;
const restrictedTimePattern = /^(-|\d{4}-\d{4})\s*(.*)$/;
const noteMarkerPattern = /\b(\d+\))/;

function sortFiles(files) {
  return [...files].sort((left, right) => left.localeCompare(right, 'sv'));
}

function normalizeDate(day, month) {
  const normalizedMonth = monthMap[month.toLowerCase()];

  if (!normalizedMonth) {
    throw new Error(`Unsupported month token: ${month}`);
  }

  return `${day.padStart(2, '0')} ${normalizedMonth}`;
}

function buildWeekMetadata(week, weekEnd = null) {
  return {
    week,
    weekEnd,
    weekLabel: weekEnd && weekEnd !== week ? `${week}-${weekEnd}` : String(week),
  };
}

function parseWeekToken(start, end = null) {
  const week = Number(start);
  const weekEnd = end ? Number(end) : null;

  if (!Number.isFinite(week)) {
    return null;
  }

  return buildWeekMetadata(week, Number.isFinite(weekEnd) ? weekEnd : null);
}

function extractWeekMetadata(filename, text) {
  // Försvarsmakten can publish one document for a week range, for example
  // v29-32, v29_32, or v29-v32. Match this before falling back to PDF text.
  const filenameMatch = filename.match(/(?:^|[^A-Za-z0-9])v(\d{1,2})(?:[-_](?:v)?(\d{1,2})(?!\d))?/i);

  if (filenameMatch) {
    return parseWeekToken(filenameMatch[1], filenameMatch[2]);
  }

  const textMatch = text.match(/VECKA\s+\d?(\d{1,2})(?:\s*[-–]\s*\d?(\d{1,2}))?/i);

  if (textMatch) {
    return parseWeekToken(textMatch[1], textMatch[2]);
  }

  throw new Error(`Could not extract week number from ${filename}`);
}

function assignNoteMarker(day, text) {
  if (day.note) {
    return;
  }

  const match = text.match(noteMarkerPattern);

  if (match) {
    day.note = match[1];
  }
}

function consumeColumnSegment(segment, day) {
  const trimmedSegment = segment.trim();

  if (!trimmedSegment) {
    return;
  }

  const dangerMatch = trimmedSegment.match(/^(JA|NEJ)\b\s*(.*)$/);

  if (!day.dangerRange && dangerMatch) {
    day.dangerRange = dangerMatch[1];
    assignNoteMarker(day, dangerMatch[2]);
    return;
  }

  const timeMatch = trimmedSegment.match(timeRangePattern);

  if (!day.otherActivity && timeMatch) {
    day.otherActivity = timeMatch[1];
    assignNoteMarker(day, timeMatch[2]);
    return;
  }

  assignNoteMarker(day, trimmedSegment);
}

function parseDayLine(line) {
  const match = line.trim().match(dayLinePattern);

  if (!match) {
    return null;
  }

  const [, swedishDayName, dayNumber, monthToken, rawColumns] = match;
  const columnSegments = rawColumns.split(/\t+/).map((segment) => segment.trim()).filter(Boolean);

  if (columnSegments.length === 0) {
    throw new Error(`Could not extract table columns from line: ${line}`);
  }

  const day = {
    dayName: dayNameMap[swedishDayName],
    date: normalizeDate(dayNumber, monthToken),
    sourceDateLabel: `${dayNumber.padStart(2, '0')} ${monthToken}`,
    restrictedTime: '',
    dangerRange: '',
    otherActivity: '',
    note: '',
  };

  // This parser assumes the weekly table keeps the same column order as the
  // current template. PDF extraction sometimes drops a tab separator, so the
  // parser first anchors on the restricted-time column and then consumes the
  // remaining content in expected left-to-right column order. It only keeps an
  // explicit note marker such as "1)" in `note`, because repeated free text on
  // the far right is not reliable enough to treat as a row-bound note.
  const firstSegmentMatch = columnSegments[0].match(restrictedTimePattern);

  if (!firstSegmentMatch) {
    throw new Error(`Could not parse restricted time from line: ${line}`);
  }

  day.restrictedTime = firstSegmentMatch[1];
  assignNoteMarker(day, firstSegmentMatch[2]);

  for (const segment of columnSegments.slice(1)) {
    consumeColumnSegment(segment, day);
  }

  return day;
}

function extractTableLines(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/\r/g, '').trimEnd())
    .filter((line) => dayLinePattern.test(line.trim()));
}

function countRawDayLines(text) {
  return text
    .split('\n')
    .filter((line) => /^(Måndag|Tisdag|Onsdag|Torsdag|Fredag|Lördag|Söndag)\b/i.test(line.trim()))
    .length;
}

async function extractText(filePath) {
  const parser = new PDFParse({ data: await readFile(filePath) });

  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

export async function parsePdfFile(filename) {
  const filePath = path.join(samplesDir, filename);
  const text = await extractText(filePath);
  const tableLines = extractTableLines(text);
  const rawDayLineCount = countRawDayLines(text);

  if (tableLines.length === 0) {
    throw new Error(`No table rows found in ${filename}`);
  }

  const weekMetadata = extractWeekMetadata(filename, text);
  const warnings = [];

  if (rawDayLineCount > tableLines.length) {
    warnings.push({
      code: 'DAY_ROWS_WITHOUT_DATES_SKIPPED',
      message: 'Some visible day rows did not include a row date in extracted PDF text and were not parsed as dated rows.',
      rawDayLineCount,
      parsedDayLineCount: tableLines.length,
    });
  }

  return {
    ...weekMetadata,
    rawDayLineCount,
    parsedDayLineCount: tableLines.length,
    warnings,
    days: tableLines.map(parseDayLine),
  };
}

async function writeOutput(filename, data) {
  const outputName = filename.replace(/\.pdf$/i, '.json');
  const outputPath = path.join(outputDir, outputName);
  const serialized = `${JSON.stringify(data, null, 2)}\n`;

  await writeFile(outputPath, serialized, 'utf8');
  return outputPath;
}

async function main() {
  const entries = await readdir(samplesDir);
  const pdfFiles = sortFiles(entries.filter((entry) => entry.toLowerCase().endsWith('.pdf')));

  if (pdfFiles.length === 0) {
    throw new Error(`No PDF files found in ${samplesDir}`);
  }

  await mkdir(outputDir, { recursive: true });

  for (const filename of pdfFiles) {
    const parsedWeek = await parsePdfFile(filename);
    const outputPath = await writeOutput(filename, parsedWeek);
    console.log(`${filename} -> ${path.relative(process.cwd(), outputPath)}`);
  }
}

const entryFilePath = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === entryFilePath) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
