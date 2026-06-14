import assert from 'node:assert/strict';
import { buildItem } from './export-harad-avlysningar-json.mjs';

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

verifyMismatchCase();
verifyNormalCase();
console.log('Verified avlysningar export mismatch handling');
