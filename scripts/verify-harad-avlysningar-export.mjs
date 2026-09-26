import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildItem } from './export-harad-avlysningar-json.mjs';
import { sourceLabelToIsoDate } from './harad-week-utils.mjs';

const execFileAsync = promisify(execFile);

function verifySourceDateLabels() {
  assert.equal(sourceLabelToIsoDate('01 okt', 2026), '2026-10-01');
  assert.equal(sourceLabelToIsoDate('01 Oct', 2026), '2026-10-01');
  assert.equal(sourceLabelToIsoDate('01 okt.', 2026), '2026-10-01');
  assert.equal(sourceLabelToIsoDate('01 maj', 2026), '2026-05-01');
  assert.equal(sourceLabelToIsoDate('01 May', 2026), '2026-05-01');
  assert.equal(sourceLabelToIsoDate('01 jun', 2026), '2026-06-01');
  assert.equal(sourceLabelToIsoDate('01 sep', 2026), '2026-09-01');
  assert.equal(sourceLabelToIsoDate('01 xyz', 2026), null);
}

function verifyMismatchCase() {
  const item = buildItem(
    { week: 26 },
    {
      dayName: 'Friday',
      date: '19 Jun',
      sourceDateLabel: '19 jun',
      restrictedTime: '0900-1700',
      dangerRange: 'JA',
      otherActivity: '',
      note: '',
    },
    {
      title: 'varningsmeddelande-harad-v26-2026.pdf',
      url: 'https://www.forsvarsmakten.se/globalassets/04-regler-och-tillstand/skjutfalt-och-forbud/harad/varningsmeddelande-harad-v26-2026.pdf',
      week: 26,
      year: 2026,
    },
    'varningsmeddelande-harad-v26-2026.pdf',
  );

  assert.ok(item);
  assert.equal(item.date, '2026-06-26');
  assert.equal(item.sourceDate, '2026-06-19');
  assert.equal(item.sourceDateLabel, '19 jun');
  assert.deepEqual(item.warnings, ['DATE_OUTSIDE_SOURCE_WEEK']);
  assert.equal(item.reviewRequired, true);
  assert.equal(item.calendarEligible, true);
  assert.equal(item.id, 'harad-2026-v26-2026-06-26-0900-1700');
}

function verifyNormalCase() {
  const item = buildItem(
    { week: 25 },
    {
      dayName: 'Monday',
      date: '15 Jun',
      sourceDateLabel: '15 jun',
      restrictedTime: '1000-1500',
      dangerRange: 'JA',
      otherActivity: '',
      note: '',
    },
    {
      title: 'varningsmeddelande-harad-v25-2026.pdf',
      url: 'https://www.forsvarsmakten.se/globalassets/04-regler-och-tillstand/skjutfalt-och-forbud/harad/varningsmeddelande-harad-v25-2026.pdf',
      week: 25,
      year: 2026,
    },
    'varningsmeddelande-harad-v25-2026.pdf',
  );

  assert.ok(item);
  assert.equal(item.date, '2026-06-15');
  assert.equal(item.sourceDate, '2026-06-15');
  assert.equal(item.sourceDateLabel, '15 jun');
  assert.deepEqual(item.warnings, []);
  assert.equal(item.reviewRequired, false);
  assert.equal(item.calendarEligible, true);
  assert.equal(item.id, 'harad-2026-v25-2026-06-15-1000-1500');
}

function verifyBlankRestrictedTimeCase() {
  const item = buildItem(
    { week: 36 },
    {
      dayName: 'Wednesday',
      date: '02 Sep',
      sourceDateLabel: '02 sep',
      restrictedTime: '',
      restrictedTimeStatus: 'blank',
      dangerRange: '',
      otherActivity: '',
      note: '',
    },
    { title: 'varningsmeddelande-harad-v36-andringstryck1-2026.pdf', week: 36, year: 2026 },
    'varningsmeddelande-harad-v36-andringstryck1-2026.pdf',
  );

  assert.equal(item, null);
}

function day(dayName, date, sourceDateLabel, restrictedTime = '-', dangerRange = '') {
  return {
    dayName,
    date,
    sourceDateLabel,
    restrictedTime,
    dangerRange,
    otherActivity: '',
    note: '',
  };
}

async function verifySeptemberOctoberExport() {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'harad-export-verification-'));
  const jsonDirectory = path.join(temporaryDirectory, 'parsed');
  const metadataPath = path.join(temporaryDirectory, 'metadata.json');
  const outputPath = path.join(temporaryDirectory, 'avlysningar.json');
  const parsedWeeks = [
    {
      filename: 'varningsmeddelande-harad-v39-2026.json',
      week: 39,
      days: [
        day('Monday', '21 Sep', '21 sep', '0900-1800', 'JA'),
        day('Tuesday', '22 Sep', '22 sep', '0900-1800', 'JA'),
        day('Wednesday', '23 Sep', '23 sep', '0900-1800', 'JA'),
        day('Thursday', '24 Sep', '24 sep', '0900-1800', 'JA'),
        day('Friday', '25 Sep', '25 sep'),
        day('Saturday', '26 Sep', '26 sep'),
        day('Sunday', '27 Sep', '27 sep'),
      ],
    },
    {
      filename: 'varningsmeddelande-harad-v40-2026.json',
      week: 40,
      days: [
        day('Monday', '28 Sep', '28 sep'),
        day('Tuesday', '29 Sep', '29 sep', '0900-2000', 'JA'),
        day('Wednesday', '30 Sep', '30 sep', '0900-2200', 'JA'),
        day('Thursday', '01 Oct', '01 okt', '0900-1800', 'JA'),
        day('Friday', '02 Oct', '02 okt'),
        day('Saturday', '03 Oct', '03 okt', '0830-1700', 'NEJ'),
        day('Sunday', '04 Oct', '04 okt', '0830-1700', 'NEJ'),
      ],
    },
    {
      filename: 'varningsmeddelande-harad-v41-2026.json',
      week: 41,
      days: [
        day('Monday', '05 Oct', '05 okt', '0830-1700', 'NEJ'),
        day('Tuesday', '06 Oct', '06 okt'),
        day('Wednesday', '07 Oct', '07 okt'),
        day('Thursday', '08 Oct', '08 okt'),
        day('Friday', '09 Oct', '09 okt'),
        day('Saturday', '10 Oct', '10 okt'),
        day('Sunday', '11 Oct', '11 okt'),
      ],
    },
  ];

  try {
    await mkdir(jsonDirectory);

    for (const parsedWeek of parsedWeeks) {
      await writeFile(
        path.join(jsonDirectory, parsedWeek.filename),
        `${JSON.stringify({ week: parsedWeek.week, days: parsedWeek.days })}\n`,
        'utf8',
      );
    }

    const metadata = parsedWeeks.map(({ filename, week }) => ({
      filename: filename.replace(/\.json$/, '.pdf'),
      title: filename.replace(/\.json$/, '.pdf'),
      url: `https://example.invalid/${filename.replace(/\.json$/, '.pdf')}`,
      week,
      year: 2026,
      revision: 0,
    }));
    await writeFile(metadataPath, `${JSON.stringify(metadata)}\n`, 'utf8');

    await execFileAsync(process.execPath, ['scripts/export-harad-avlysningar-json.mjs'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HARAD_JSON_DIR: jsonDirectory,
        HARAD_METADATA_PATH: metadataPath,
        HARAD_AVLYSNINGAR_JSON_PATH: outputPath,
      },
    });

    const exported = JSON.parse(await readFile(outputPath, 'utf8'));
    const documentByWeek = new Map(exported.documents.map((document) => [document.week, document]));
    const octoberFirst = exported.items.find((item) => item.date === '2026-10-01');
    const octoberNejItems = exported.items.filter((item) =>
      ['2026-10-03', '2026-10-04', '2026-10-05'].includes(item.date));

    assert.equal(exported.items.length, 10);
    assert.equal(documentByWeek.get(40).exportedItems, 5);
    assert.equal(documentByWeek.get(41).exportedItems, 1);
    assert.ok(octoberFirst);
    assert.equal(octoberFirst.start, '09:00');
    assert.equal(octoberFirst.end, '18:00');
    assert.equal(octoberFirst.dangerRange, 'JA');
    assert.equal(octoberFirst.sourceDateLabel, '01 okt');
    assert.equal(octoberFirst.calendarEligible, true);
    assert.deepEqual(octoberFirst.warnings, []);
    assert.equal(octoberNejItems.length, 3);
    assert.ok(octoberNejItems.every((item) => item.calendarEligible === false));
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

verifySourceDateLabels();
verifyMismatchCase();
verifyNormalCase();
verifyBlankRestrictedTimeCase();
await verifySeptemberOctoberExport();
console.log('Verified avlysningar export mismatch handling');
