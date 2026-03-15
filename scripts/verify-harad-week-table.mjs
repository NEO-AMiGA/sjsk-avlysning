import assert from 'node:assert/strict';
import { parsePdfFile } from './parse-harad-week-table.mjs';

const expectations = {
  'varningsmeddelande-harad-v11-2026-andringstryck-1.pdf': {
    week: 11,
    dayCount: 7,
    days: {
      Monday: {
        restrictedTime: '-',
        dangerRange: '',
        otherActivity: '',
        note: '',
      },
      Tuesday: {
        restrictedTime: '0900-1530',
        dangerRange: 'NEJ',
        otherActivity: '1000-1600',
        note: '1)',
      },
      Wednesday: {
        restrictedTime: '0900-1630',
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
        dangerRange: '',
        otherActivity: '1000-1600',
        note: '1)',
      },
      Wednesday: {
        restrictedTime: '0900-1630',
        dangerRange: 'JA',
        otherActivity: '',
        note: '',
      },
      Thursday: {
        restrictedTime: '-',
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
        dangerRange: '',
        otherActivity: '1000-1600',
        note: '1)',
      },
      Thursday: {
        restrictedTime: '0800-1800',
        dangerRange: 'NEJ',
        otherActivity: '1000-1600',
        note: '1)',
      },
      Sunday: {
        restrictedTime: '0830-1800',
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

  for (const [dayName, dayExpectation] of Object.entries(expected.days)) {
    const actualDay = getDay(parsed.days, dayName);

    assert.equal(actualDay.restrictedTime, dayExpectation.restrictedTime, `${filename}: ${dayName} restrictedTime`);
    assert.equal(actualDay.dangerRange, dayExpectation.dangerRange, `${filename}: ${dayName} dangerRange`);
    assert.equal(actualDay.otherActivity, dayExpectation.otherActivity, `${filename}: ${dayName} otherActivity`);
    assert.equal(actualDay.note, dayExpectation.note, `${filename}: ${dayName} note`);
  }
}

async function main() {
  for (const [filename, expected] of Object.entries(expectations)) {
    await verifyFile(filename, expected);
    console.log(`Verified ${filename}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
