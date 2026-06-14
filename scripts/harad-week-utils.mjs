const monthNumberMap = {
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

const swedishMonthLabelMap = {
  '01': 'jan',
  '02': 'feb',
  '03': 'mar',
  '04': 'apr',
  '05': 'maj',
  '06': 'jun',
  '07': 'jul',
  '08': 'aug',
  '09': 'sep',
  '10': 'okt',
  '11': 'nov',
  '12': 'dec',
};

const isoWeekdayOffsetMap = {
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
  Sunday: 6,
};

export function extractYearFromText(value) {
  const match = value?.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

export function extractWeekFromText(value) {
  const match = value?.match(/\bv(\d{1,2})\b/i);
  return match ? Number(match[1]) : null;
}

export function normalizeMetadataNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number === 999 || number === 9999) {
    return null;
  }

  return number;
}

export function getSourceYear(metadata, fallbackText) {
  return (
    normalizeMetadataNumber(metadata?.year) ??
    extractYearFromText(metadata?.title) ??
    extractYearFromText(metadata?.url) ??
    extractYearFromText(fallbackText) ??
    null
  );
}

export function getSourceWeek(metadata, fallbackWeek, fallbackText) {
  return (
    normalizeMetadataNumber(metadata?.week) ??
    extractWeekFromText(metadata?.title) ??
    extractWeekFromText(metadata?.url) ??
    fallbackWeek ??
    extractWeekFromText(fallbackText) ??
    null
  );
}

export function sourceLabelToIsoDate(value, year) {
  const match = value?.match(/^(\d{2})\s+([A-Za-z]{3})$/);

  if (!match || !year) {
    return null;
  }

  const [, day, monthToken] = match;
  const normalizedMonthToken = `${monthToken.slice(0, 1).toUpperCase()}${monthToken.slice(1).toLowerCase()}`;
  const month = monthNumberMap[normalizedMonthToken];

  if (!month) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

export function isoWeekDate(year, week, dayName) {
  const offset = isoWeekdayOffsetMap[dayName];

  if (!year || !week || offset === undefined) {
    return null;
  }

  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4IsoWeekday = jan4.getUTCDay() || 7;
  const mondayOfWeekOne = new Date(Date.UTC(year, 0, 4 - (jan4IsoWeekday - 1)));
  const targetDate = new Date(mondayOfWeekOne);

  targetDate.setUTCDate(mondayOfWeekOne.getUTCDate() + ((week - 1) * 7) + offset);

  return targetDate.toISOString().slice(0, 10);
}

export function formatIsoDateForDisplay(value) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return value ?? '';
  }

  const [, , month, day] = match;
  const monthLabel = swedishMonthLabelMap[month];

  if (!monthLabel) {
    return value;
  }

  return `${day} ${monthLabel}`;
}
