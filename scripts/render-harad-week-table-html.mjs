import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const indexPath = path.resolve(process.env.HARAD_INDEX_PATH ?? 'index.html');
const jsonDir = path.resolve(process.env.HARAD_JSON_DIR ?? 'data/debug/harad-week-table');

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
    '    .weektable .col-week{width:40px}',
    '    .weektable .col-time{min-width:92px}',
    '    .weektable .col-danger{min-width:80px}',
    styleEndMarker,
  ].join('\n');
}

function formatCellValue(value) {
  return value ? escapeHtml(value) : '<span class="empty">-</span>';
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
function buildDayRow(week, day) {
  const displayedWeek = day.dayName === 'Monday' ? String(week) : '';
  const rowClass = day.dangerRange === 'JA' ? ' class="row-ja"' : '';

  return [
    `          <tr${rowClass}>`,
    `            <td class="col-week">${displayedWeek}</td>`,
    `            <td>${escapeHtml(dayNameMap[day.dayName] ?? day.dayName)}</td>`,
    `            <td>${escapeHtml(day.date)}</td>`,
    `            <td class="col-time time">${formatCellValue(day.restrictedTime)}</td>`,
    `            <td class="center risk col-danger">${renderDangerValue(day.dangerRange)}</td>`,
    '          </tr>',
  ].join('\n');
}

function buildSection(weeks) {
  // The current text-extraction approach is stable enough for week/day/date,
  // restricted time, and danger range, but not visually reliable enough to
  // render "Annan verksamhet" or "Anmärkning" from the PDF template yet.
  const rows = weeks
    .flatMap((weekData) => weekData.days.map((day) => buildDayRow(weekData.week, day)))
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
          '          <th class="center col-focus col-time">Förbudstid</th>',
          '          <th class="center col-focus col-danger">Risk över<br>SJSK-banor</th>',
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
      return JSON.parse(fileContent);
    }),
  );

  return sortByWeek(weeks);
}

async function main() {
  const [indexHtml, weeks] = await Promise.all([
    readFile(indexPath, 'utf8'),
    loadWeeks(),
  ]);

  const withStyles = replaceOrInsert(indexHtml, styleStartMarker, styleEndMarker, buildStyles(), '  </style>');
  const withSection = replaceOrInsert(
    withStyles,
    sectionStartMarker,
    sectionEndMarker,
    buildSection(weeks),
    '  <div class="rawtitle">',
  );

  await writeFile(indexPath, withSection, 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
