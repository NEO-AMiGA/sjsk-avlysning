import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  formatIsoDateForDisplay,
  getSourceWeek,
  getSourceYear,
  isoWeekDate,
  sourceLabelToIsoDate,
} from './harad-week-utils.mjs';

const indexPath = path.resolve(process.env.HARAD_INDEX_PATH ?? 'index.html');
const jsonDir = path.resolve(process.env.HARAD_JSON_DIR ?? 'data/debug/harad-week-table');
const metadataPath = process.env.HARAD_METADATA_PATH
  ? path.resolve(process.env.HARAD_METADATA_PATH)
  : null;

const styleStartMarker = '    /* parsed-week-table:start */';
const styleEndMarker = '    /* parsed-week-table:end */';
const sectionStartMarker = '  <!-- parsed-week-table:start -->';
const sectionEndMarker = '  <!-- parsed-week-table:end -->';

const dayNameMap = {
  Monday: 'Måndag',
  Tuesday: 'Tisdag',
  Wednesday: 'Onsdag',
  Thursday: 'Torsdag',
  Friday: 'Fredag',
  Saturday: 'Lördag',
  Sunday: 'Söndag',
};

function sortByWeek(entries) {
  return [...entries].sort((left, right) => left.week - right.week);
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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

function replaceOrInsert(content, startMarker, endMarker, replacement, anchor) {
  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker);

  if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
    const afterEnd = endIndex + endMarker.length;
    return `${content.slice(0, startIndex)}${replacement}${content.slice(afterEnd)}`;
  }

  const anchorIndex = content.indexOf(anchor);

  if (anchorIndex === -1) {
    throw new Error(`Could not find anchor: ${anchor}`);
  }

  return `${content.slice(0, anchorIndex)}${replacement}\n${content.slice(anchorIndex)}`;
}

function buildStyles() {
  return [
    styleStartMarker,
    '    .tablehint{font-size:12px;color:#444;background:#fbf7d9;border-left:3px solid #d7bb4a;padding:8px 10px;margin:18px 0 10px}',
    '    .tableinfo{margin:0 0 10px}',
    '    .tableinfo-strong{font-size:14px;font-weight:700;color:#A43027;margin:0 0 4px}',
    '    .tablewrap{overflow-x:auto;margin:0 0 10px}',
    '    .tablebox{display:inline-block;min-width:max-content;max-width:100%}',
    '    .rawtitle{font-size:10px;color:#8b8b8b}',
    '    .rawblock{font-size:11px;color:#7a7a7a}',
    '    .rawblock a{color:#8a6a66}',
    '    .weektable{width:auto;min-width:0;border-collapse:collapse;font-size:13px}',
    '    .weektable th{font-size:11px;font-weight:700;color:#111;text-align:left;padding:0 11px 5px 0;border-bottom:1px solid #ddd;white-space:nowrap}',
    '    .weektable td{padding:4px 11px 4px 0;border-bottom:1px solid #eee;vertical-align:top;white-space:nowrap}',
    '    .weektable td:last-child,.weektable th:last-child{padding-right:0}',
    '    .weektable th.col-focus{background:rgba(241,218,102,0.18);border-bottom-color:#d5c15d;box-shadow:inset 0 -1px 0 rgba(164,48,39,0.18)}',
    '    .weektable tr.row-ja td{background:rgba(164,48,39,0.07)}',
    '    .weektable .risk{font-weight:700}',
    '    .weektable .risk-badge{display:inline-block;line-height:1.35}',
    '    .weektable .risk-yes{color:#fff;background:#A43027;border-radius:999px;padding:1px 8px}',
    '    .weektable .risk-no{color:#111}',
    '    .weektable .risk-empty,.weektable .empty{color:#999}',
    '    .weektable .center{text-align:center}',
    '    .weektable .time{text-align:center}',
    '    .weektable .control{white-space:normal;line-height:1.2;vertical-align:middle}',
    '    .weektable .control-flag{font-weight:700;color:#8b2d21}',
    '    .weektable .control-detail{font-size:11px;color:#7a514b}',
    '    .weektable .today-day{font-weight:600}',
    '    .weektable .today-date{font-weight:700}',
    '    .weektable .today-date .date-emphasis{display:inline-block;border-bottom:2px solid rgba(32,57,94,0.42);padding-bottom:1px}',
    '    .weektable .col-week{width:40px}',
    '    .weektable .col-time{min-width:92px}',
    '    .weektable .col-danger{min-width:80px}',
    '    .weektable .col-control{min-width:132px}',
    styleEndMarker,
  ].join('\n');
}

function formatCellValue(value) {
  return value ? escapeHtml(value) : '<span class="empty">-</span>';
}

function renderDateValue(value) {
  const [dayNumber, monthToken] = value.split(/\s+/, 2);

  if (!dayNumber || !monthToken) {
    return escapeHtml(value);
  }

  return `${escapeHtml(dayNumber)} <span class="month">${escapeHtml(monthToken.toLowerCase())}</span>`;
}

function renderIsoDateValue(value) {
  return renderDateValue(formatIsoDateForDisplay(value));
}

function renderDangerValue(value) {
  if (value === 'JA') {
    return '<span class="risk-badge risk-yes">JA</span>';
  }

  if (value === 'NEJ') {
    return '<span class="risk-badge risk-no">NEJ</span>';
  }

  return '<span class="empty">-</span>';
}

function getTodayIsoDate() {
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/Stockholm',
  }).format(new Date());
}

const todayIsoDate = getTodayIsoDate();

function isTodayDate(value) {
  return value === todayIsoDate;
}

function enrichWeek(weekEntry, metadata) {
  const year = getSourceYear(metadata, weekEntry.pdfFilename);
  const week = getSourceWeek(metadata, weekEntry.data.week, weekEntry.pdfFilename);
  const days = weekEntry.data.days.map((day) => {
    const sourceDateLabel = day.sourceDateLabel ?? day.date;

    return {
      ...day,
      sourceDateLabel,
      sourceDate: sourceLabelToIsoDate(sourceDateLabel, year),
      exportedDate: isoWeekDate(year, week, day.dayName),
    };
  });
  const hasDateMismatch = days.some((day) => day.sourceDate && day.exportedDate && day.sourceDate !== day.exportedDate);

  return {
    ...weekEntry,
    sourceWeek: week,
    sourceYear: year,
    hasDateMismatch,
    days,
  };
}

function buildControlCell(day, hasDateMismatch) {
  if (!hasDateMismatch || day.dangerRange !== 'JA') {
    return '<span class="empty">-</span>';
  }

  const title = day.sourceDateLabel ? ` title="PDF-raddatum: ${escapeHtml(day.sourceDateLabel)}"` : '';

  return `<span class="control-flag"${title}>KONTROLLERA</span><br><span class="control-detail">Datum/vecka fel i PDF</span>`;
}

function buildDayRow(week, day, hasDateMismatch) {
  const displayedWeek = day.dayName === 'Monday' ? String(week) : '';
  const rowClass = day.dangerRange === 'JA' ? ' class="row-ja"' : '';
  const isToday = isTodayDate(day.exportedDate);
  const dayCellClass = isToday ? ' class="today-day"' : '';
  const dateCellClass = isToday ? ' class="today-date"' : '';
  const dateValue = renderIsoDateValue(day.exportedDate);
  const renderedDate = isToday ? `<span class="date-emphasis">${dateValue}</span>` : dateValue;

  return [
    `          <tr${rowClass}>`,
    `            <td class="col-week">${displayedWeek}</td>`,
    `            <td${dayCellClass}>${escapeHtml(dayNameMap[day.dayName] ?? day.dayName)}</td>`,
    `            <td${dateCellClass}>${renderedDate}</td>`,
    `            <td class="col-time time">${formatCellValue(day.restrictedTime)}</td>`,
    `            <td class="center risk col-danger">${renderDangerValue(day.dangerRange)}</td>`,
    `            <td class="control col-control">${buildControlCell(day, hasDateMismatch)}</td>`,
    '          </tr>',
  ].join('\n');
}

function buildSection(weeks) {
  // The current text-extraction approach is stable enough for week/day/date,
  // restricted time, and danger range, but not visually reliable enough to
  // render "Annan verksamhet" or "Anmärkning" from the PDF template yet.
  const rows = weeks
    .flatMap((weekData) => weekData.days.map((day) => buildDayRow(weekData.sourceWeek, day, weekData.hasDateMismatch)))
    .join('\n');

  return [
    sectionStartMarker,
    '  <div class="tablehint">Nedan kalender är auto-genererad från Försvarsmaktens PDF:er. Kolumnerna &quot;Annan verksamhet&quot; och &quot;Anmärkning&quot; visas inte här, så verifiera mot PDF vid oklarheter. <strong>Original-PDF är alltid gällande.</strong> På telefon kan du behöva rotera skärmen eller scrolla i sidled för att se hela tabellen.</div>',
    '  <div class="tableinfo">',
    '    <p class="tableinfo-strong">⚠️ Det är LIVSFARLIGT att under nedan angivna klockslag beträda skjutfältet.</p>',
    '  </div>',
    '  <div class="tablewrap">',
    '    <div class="tablebox">',
    '    <table class="weektable">',
      '      <thead>',
        '        <tr>',
          '          <th class="col-week">Vecka</th>',
          '          <th>Dag</th>',
          '          <th>Datum</th>',
          '          <th class="center col-focus col-time">Avlyst tid</th>',
          '          <th class="center col-focus col-danger">Risk över<br>SJSK-banor</th>',
          '          <th class="col-control">Info</th>',
        '        </tr>',
      '      </thead>',
      '      <tbody>',
    rows,
    '      </tbody>',
    '    </table>',
    '    </div>',
  '  </div>',
    sectionEndMarker,
  ].join('\n');
}

async function loadWeeks() {
  const entries = await readdir(jsonDir);
  const jsonFiles = entries.filter((entry) => entry.toLowerCase().endsWith('.json'));

  if (jsonFiles.length === 0) {
    throw new Error(`No parsed week JSON files found in ${jsonDir}`);
  }

  const weeks = await Promise.all(
    jsonFiles.map(async (filename) => {
      const filePath = path.join(jsonDir, filename);
      const fileContent = await readFile(filePath, 'utf8');
      const data = JSON.parse(fileContent);
      return {
        week: data.week,
        pdfFilename: filename.replace(/\.json$/i, '.pdf'),
        data,
      };
    }),
  );

  return sortByWeek(weeks);
}

async function main() {
  const [indexHtml, weeks, metadataMap] = await Promise.all([
    readFile(indexPath, 'utf8'),
    loadWeeks(),
    loadMetadataMap(),
  ]);
  const enrichedWeeks = weeks.map((weekEntry) => enrichWeek(weekEntry, metadataMap.get(weekEntry.pdfFilename)));

  const withStyles = replaceOrInsert(indexHtml, styleStartMarker, styleEndMarker, buildStyles(), '  </style>');
  const withSection = replaceOrInsert(
    withStyles,
    sectionStartMarker,
    sectionEndMarker,
    buildSection(enrichedWeeks),
    '  <div class="rawtitle">',
  );

  await writeFile(indexPath, withSection, 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
