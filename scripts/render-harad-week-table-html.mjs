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
const avlysningarPath = path.resolve(process.env.HARAD_AVLYSNINGAR_JSON_PATH ?? 'avlysningar.json');

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

async function loadAvlysningarDocuments() {
  try {
    const content = await readFile(avlysningarPath, 'utf8');
    const payload = JSON.parse(content);

    return Array.isArray(payload.documents) ? payload.documents : [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
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
    '    .docstatus{font-size:12px;color:#555;margin:0 0 14px}',
    '    .docstatus-title{font-weight:700;color:#333;margin:0 0 4px}',
    '    .docstatus-list{list-style:none;padding:0;margin:0}',
    '    .docstatus-item{margin:0 0 5px}',
    '    .docstatus-week{font-weight:700;color:#111}',
    '    .docstatus a{color:#A43027;text-decoration:underline}',
    '    .docstatus-warnings{display:block;color:#7a514b;font-size:11px;margin-top:1px}',
    '    .tablewrap{overflow-x:auto;margin:0 0 10px}',
    '    .tablebox{display:inline-block;min-width:max-content;max-width:100%}',
    '    .rawtitle{font-size:10px;color:#8b8b8b}',
    '    .rawblock{font-size:11px;color:#7a7a7a}',
    '    .rawblock a{color:#8a6a66}',
    '    .weektable{width:auto;min-width:0;border-collapse:collapse;font-size:13px}',
    '    .weektable th{font-size:11px;font-weight:700;color:#111;text-align:left;padding:0 11px 5px 0;border-bottom:1px solid #ddd;white-space:nowrap}',
    '    .weektable td{padding:4px 11px 4px 0;border-bottom:1px solid #eee;vertical-align:middle;white-space:nowrap}',
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

function getWarningCodes(warnings) {
  return warnings.map((warning) => (typeof warning === 'string' ? warning : warning.code)).filter(Boolean);
}

function isRestrictedTime(value) {
  return /^\d{1,2}(?::|\.)?\d{2}\s*-\s*\d{1,2}(?::|\.)?\d{2}$/.test(value?.trim() ?? '');
}

function buildFallbackDocumentDiagnostic(weekEntry) {
  const exportedItems = weekEntry.days.filter((day) => isRestrictedTime(day.restrictedTime));
  const warnings = getWarningCodes(weekEntry.data.warnings ?? []);

  if (exportedItems.length === 0) {
    warnings.push('NO_EXPORT_ITEMS');
  }

  if (weekEntry.days.length > 0 && exportedItems.length === 0) {
    warnings.push('NO_RESTRICTED_TIME_INTERVALS');
  }

  return {
    pdfTitle: weekEntry.pdfTitle,
    pdfUrl: weekEntry.pdfUrl,
    pdfFilename: weekEntry.pdfFilename,
    week: weekEntry.sourceWeek,
    weekEnd: weekEntry.sourceWeekEnd,
    weekLabel: weekEntry.sourceWeekLabel,
    year: weekEntry.sourceYear,
    parsedRows: weekEntry.days.length,
    exportedItems: exportedItems.length,
    dangerJaItems: exportedItems.filter((day) => day.dangerRange === 'JA').length,
    warnings: [...new Set(warnings)],
  };
}

function getWarningText(code) {
  const warningTextMap = {
    DAY_ROWS_WITHOUT_DATES_SKIPPED: 'Vissa dagrader saknade datum i PDF-texten och hoppades över.',
    NO_EXPORT_ITEMS: 'Inga exporterbara kalenderposter hittades.',
    NO_RESTRICTED_TIME_INTERVALS: 'Inga parsebara tidsintervall hittades.',
  };

  return warningTextMap[code] ?? code;
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
  const weekLabel = metadata?.weekLabel ?? weekEntry.data.weekLabel ?? String(week);
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
    pdfTitle: metadata?.title ?? weekEntry.pdfFilename,
    pdfUrl: metadata?.url ?? '',
    sourceWeek: week,
    sourceWeekEnd: metadata?.weekEnd ?? weekEntry.data.weekEnd ?? null,
    sourceWeekLabel: weekLabel,
    sourceYear: year,
    hasDateMismatch,
    days,
  };
}

function buildControlCell(day, hasDateMismatch, pdfUrl) {
  if (!hasDateMismatch || day.dangerRange !== 'JA') {
    return '<span class="empty">-</span>';
  }

  const title = day.sourceDateLabel ? ` title="PDF-raddatum: ${escapeHtml(day.sourceDateLabel)}"` : '';
  const detail = pdfUrl
    ? `<a href="${escapeHtml(pdfUrl)}" target="_blank" rel="noopener noreferrer" class="control-detail"${title}>Datum/vecka fel i PDF</a>`
    : `<span class="control-detail"${title}>Datum/vecka fel i PDF</span>`;

  return `<span class="control-flag">KONTROLLERA</span><br>${detail}`;
}

function buildDayRow(weekLabel, day, hasDateMismatch, pdfUrl) {
  const displayedWeek = day.dayName === 'Monday' ? String(weekLabel) : '';
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
    `            <td class="control col-control">${buildControlCell(day, hasDateMismatch, pdfUrl)}</td>`,
    '          </tr>',
  ].join('\n');
}

function buildDocumentStatus(weeks, documents) {
  const documentMap = new Map(documents.map((document) => [document.pdfFilename, document]));
  const items = weeks.map((weekData) => {
    const document = documentMap.get(weekData.pdfFilename) ?? buildFallbackDocumentDiagnostic(weekData);
    const weekLabel = document.weekLabel ?? String(document.week ?? weekData.sourceWeekLabel);
    const count = Number(document.exportedItems ?? 0);
    const countText = count === 0
      ? 'Inga kalenderförda avlysningar hittades i denna PDF.'
      : `${count} kalenderförd${count === 1 ? '' : 'a'} avlysning${count === 1 ? '' : 'ar'}`;
    const link = document.pdfUrl
      ? ` <a href="${escapeHtml(document.pdfUrl)}" target="_blank" rel="noopener noreferrer">PDF</a>`
      : '';
    const warnings = (document.warnings ?? []).map(getWarningText);
    const warningHtml = warnings.length > 0
      ? `<span class="docstatus-warnings">${warnings.map(escapeHtml).join(' ')}</span>`
      : '';

    return `      <li class="docstatus-item"><span class="docstatus-week">Vecka ${escapeHtml(weekLabel)}:</span> ${escapeHtml(countText)}${link}${warningHtml}</li>`;
  });

  return [
    '  <div class="docstatus">',
    '    <div class="docstatus-title">PDF-status</div>',
    '    <ul class="docstatus-list">',
    ...items,
    '    </ul>',
    '  </div>',
  ].join('\n');
}

function buildSection(weeks, documents) {
  // The current text-extraction approach is stable enough for week/day/date,
  // restricted time, and danger range, but not visually reliable enough to
  // render "Annan verksamhet" or "Anmärkning" from the PDF template yet.
  const rows = weeks
    .flatMap((weekData) => weekData.days.map((day) => buildDayRow(weekData.sourceWeekLabel, day, weekData.hasDateMismatch, weekData.pdfUrl)))
    .join('\n');

  return [
    sectionStartMarker,
    '  <div class="tablehint">Nedan kalender är auto-genererad från Försvarsmaktens PDF:er. Kolumnerna &quot;Annan verksamhet&quot; och &quot;Anmärkning&quot; visas inte här, så verifiera mot PDF vid oklarheter. <strong>Original-PDF är alltid gällande.</strong> På telefon kan du behöva rotera skärmen eller scrolla i sidled för att se hela tabellen.</div>',
    '  <div class="tableinfo">',
    '    <p class="tableinfo-strong">⚠️ Det är LIVSFARLIGT att under nedan angivna klockslag beträda skjutfältet.</p>',
    '  </div>',
    buildDocumentStatus(weeks, documents),
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
  const [indexHtml, weeks, metadataMap, documents] = await Promise.all([
    readFile(indexPath, 'utf8'),
    loadWeeks(),
    loadMetadataMap(),
    loadAvlysningarDocuments(),
  ]);
  const enrichedWeeks = weeks.map((weekEntry) => enrichWeek(weekEntry, metadataMap.get(weekEntry.pdfFilename)));

  const withStyles = replaceOrInsert(indexHtml, styleStartMarker, styleEndMarker, buildStyles(), '  </style>');
  const withSection = replaceOrInsert(
    withStyles,
    sectionStartMarker,
    sectionEndMarker,
    buildSection(enrichedWeeks, documents),
    '  <div class="rawtitle">',
  );

  await writeFile(indexPath, withSection, 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
