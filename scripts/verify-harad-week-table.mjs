import assert from 'node:assert/strict';
import { parseDayLine, parsePdfFile } from './parse-harad-week-table.mjs';
import { selectAuthoritativeDocuments } from './select-harad-documents.mjs';

const expectations = {
  'varningsmeddelande-harad-v11-2026-andringstryck-1.pdf': {
    week: 11,
    dayCount: 7,
    days: {
      Monday: {
        restrictedTime: '-',
        restrictedTimeStatus: 'explicit-none',
        dangerRange: '',
        otherActivity: '',
        note: '',
      },
      Tuesday: {
        restrictedTime: '0900-1530',
        restrictedTimeStatus: 'interval',
        dangerRange: 'NEJ',
        otherActivity: '1000-1600',
        note: '1)',
      },
      Wednesday: {
        restrictedTime: '0900-1630',
        restrictedTimeStatus: 'interval',
        dangerRange: 'JA',
        otherActivity: '',
        note: '',
      },
    },
  },
  'varningsmeddelande-harad-v12-2026.pdf': {
    week: 12,
    dayCount: 7,
    days: {
      Tuesday: {
        restrictedTime: '-',
        restrictedTimeStatus: 'explicit-none',
        dangerRange: '',
        otherActivity: '1000-1600',
        note: '1)',
      },
      Wednesday: {
        restrictedTime: '0900-1630',
        restrictedTimeStatus: 'interval',
        dangerRange: 'JA',
        otherActivity: '',
        note: '',
      },
      Thursday: {
        restrictedTime: '-',
        restrictedTimeStatus: 'explicit-none',
        dangerRange: '',
        otherActivity: '1000-1600',
        note: '1)',
      },
    },
  },
  'varningsmeddelande-harad-v13-2026.pdf': {
    week: 13,
    dayCount: 7,
    days: {
      Tuesday: {
        restrictedTime: '-',
        restrictedTimeStatus: 'explicit-none',
        dangerRange: '',
        otherActivity: '1000-1600',
        note: '1)',
      },
      Thursday: {
        restrictedTime: '0800-1800',
        restrictedTimeStatus: 'interval',
        dangerRange: 'NEJ',
        otherActivity: '1000-1600',
        note: '1)',
      },
      Sunday: {
        restrictedTime: '0830-1800',
        restrictedTimeStatus: 'interval',
        dangerRange: 'NEJ',
        otherActivity: '',
        note: '',
      },
    },
  },
  'varningsmeddelande-harad-v36-2026.pdf': {
    week: 36,
    dayCount: 7,
    blankRestrictedTimeRowCount: 0,
    days: {
      Wednesday: {
        restrictedTime: '0000-2400',
        restrictedTimeStatus: 'interval',
        dangerRange: 'NEJ',
        otherActivity: '',
        note: '',
      },
      Thursday: {
        restrictedTime: '0000-2400',
        restrictedTimeStatus: 'interval',
        dangerRange: 'NEJ',
        otherActivity: '',
        note: '',
      },
      Friday: {
        restrictedTime: '0000-2400',
        restrictedTimeStatus: 'interval',
        dangerRange: 'NEJ',
        otherActivity: '',
        note: '',
      },
      Saturday: {
        restrictedTime: '0000-1200',
        restrictedTimeStatus: 'interval',
        dangerRange: 'NEJ',
        otherActivity: '',
        note: '',
      },
    },
  },
  'varningsmeddelande-harad-v36-andringstryck1-2026.pdf': {
    week: 36,
    dayCount: 7,
    blankRestrictedTimeRowCount: 4,
    days: {
      Monday: {
        restrictedTime: '0900-2400',
        restrictedTimeStatus: 'interval',
        dangerRange: 'NEJ',
        otherActivity: '',
        note: '',
      },
      Tuesday: {
        restrictedTime: '0000-2400',
        restrictedTimeStatus: 'interval',
        dangerRange: 'NEJ',
        otherActivity: '',
        note: '',
      },
      Wednesday: {
        restrictedTime: '',
        restrictedTimeStatus: 'blank',
        dangerRange: '',
        otherActivity: '',
        note: '',
      },
      Thursday: {
        restrictedTime: '',
        restrictedTimeStatus: 'blank',
        dangerRange: '',
        otherActivity: '',
        note: '',
      },
      Friday: {
        restrictedTime: '',
        restrictedTimeStatus: 'blank',
        dangerRange: '',
        otherActivity: '',
        note: '',
      },
      Saturday: {
        restrictedTime: '',
        restrictedTimeStatus: 'blank',
        dangerRange: '',
        otherActivity: '',
        note: '',
      },
      Sunday: {
        restrictedTime: '-',
        restrictedTimeStatus: 'explicit-none',
        dangerRange: '',
        otherActivity: '',
        note: '',
      },
    },
  },
  'varningsmeddelande-harad-v37-2026.pdf': {
    week: 37,
    dayCount: 7,
    blankRestrictedTimeRowCount: 0,
    days: {
      Monday: {
        restrictedTime: '-',
        restrictedTimeStatus: 'explicit-none',
        dangerRange: '',
        otherActivity: '',
        note: '',
      },
      Tuesday: {
        restrictedTime: '0000-2400',
        restrictedTimeStatus: 'interval',
        dangerRange: 'NEJ',
        otherActivity: '',
        note: '',
      },
      Wednesday: {
        restrictedTime: '0000-2400',
        restrictedTimeStatus: 'interval',
        dangerRange: 'NEJ',
        otherActivity: '',
        note: '',
      },
    },
  },
};

function getDay(days, dayName) {
  const day = days.find((entry) => entry.dayName === dayName);
  assert.ok(day, `Expected to find day row for ${dayName}`);
  return day;
}

async function verifyFile(filename, expected) {
  const parsed = await parsePdfFile(filename);

  assert.equal(parsed.week, expected.week, `${filename}: week`);
  assert.equal(parsed.days.length, expected.dayCount, `${filename}: number of day rows`);

  if (expected.blankRestrictedTimeRowCount !== undefined) {
    assert.equal(
      parsed.blankRestrictedTimeRowCount,
      expected.blankRestrictedTimeRowCount,
      `${filename}: blank restricted-time rows`,
    );
  }

  for (const [dayName, dayExpectation] of Object.entries(expected.days)) {
    const actualDay = getDay(parsed.days, dayName);

    assert.equal(actualDay.restrictedTime, dayExpectation.restrictedTime, `${filename}: ${dayName} restrictedTime`);
    assert.equal(
      actualDay.restrictedTimeStatus,
      dayExpectation.restrictedTimeStatus,
      `${filename}: ${dayName} restrictedTimeStatus`,
    );
    assert.equal(actualDay.dangerRange, dayExpectation.dangerRange, `${filename}: ${dayName} dangerRange`);
    assert.equal(actualDay.otherActivity, dayExpectation.otherActivity, `${filename}: ${dayName} otherActivity`);
    assert.equal(actualDay.note, dayExpectation.note, `${filename}: ${dayName} note`);
  }
}

async function main() {
  assert.deepEqual(
    parseDayLine('Tisdag 18 aug \t– Reserverat för jakt'),
    {
      dayName: 'Tuesday',
      date: '18 Aug',
      sourceDateLabel: '18 aug',
      restrictedTime: '-',
      restrictedTimeStatus: 'explicit-none',
      dangerRange: '',
      otherActivity: '',
      note: '',
    },
    'typographic restricted-time placeholder',
  );

  assert.deepEqual(
    parseDayLine('Tisdag 11 aug 0900–1700 NEJ Reserverat för jakt'),
    {
      dayName: 'Tuesday',
      date: '11 Aug',
      sourceDateLabel: '11 aug',
      restrictedTime: '0900-1700',
      restrictedTimeStatus: 'interval',
      dangerRange: 'NEJ',
      otherActivity: '',
      note: '',
    },
    'typographic time separator and merged danger column',
  );

  assert.deepEqual(
    parseDayLine('Onsdag 02 sep Reserverat för jakt'),
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
    'blank restricted-time cell',
  );

  assert.throws(
    () => parseDayLine('Onsdag 02 sep JA'),
    /Could not parse restricted time/,
    'danger marker without restricted time must not be classified as blank',
  );

  const authoritativeDocuments = selectAuthoritativeDocuments({
    results: [{
      documents: [
        { title: 'varningsmeddelande-harad-v36-2026.pdf', url: '/harad/v36-2026.pdf' },
        { title: 'varningsmeddelande_harad_v36_2026-ändringstryck_1.pdf', url: '/harad/v36-andringstryck1-2026.pdf' },
        { title: 'varningsmeddelande-harad-v37-2026.pdf', url: '/harad/v37-2026.pdf' },
        { title: 'varningsmeddelande-harad-v38-2026.pdf', url: '/harad/v38-2026.pdf' },
        { title: 'varningsmeddelande-harad-v38-Andringstryck-3-2026.pdf', url: '/harad/v38-andringstryck3-2026.pdf' },
      ],
    }],
  });

  assert.deepEqual(
    authoritativeDocuments.map(({ title, year, week, revision }) => ({ title, year, week, revision })),
    [
      { title: 'varningsmeddelande_harad_v36_2026-ändringstryck_1.pdf', year: 2026, week: 36, revision: 1 },
      { title: 'varningsmeddelande-harad-v37-2026.pdf', year: 2026, week: 37, revision: 0 },
      { title: 'varningsmeddelande-harad-v38-Andringstryck-3-2026.pdf', year: 2026, week: 38, revision: 3 },
    ],
    'highest amendment revision must be authoritative per year/week range',
  );

  for (const [filename, expected] of Object.entries(expectations)) {
    await verifyFile(filename, expected);
    console.log(`Verified ${filename}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
