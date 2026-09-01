import { fileURLToPath } from 'node:url';
import path from 'node:path';

function extractWeekInfo(value) {
  const match = value?.match(/(?:^|[^A-Za-z0-9])v(\d{1,2})(?:[-_](?:v)?(\d{1,2})(?!\d))?/i);

  if (!match) {
    return null;
  }

  const week = Number(match[1]);
  const weekEnd = match[2] ? Number(match[2]) : null;

  return {
    week,
    weekEnd,
    weekLabel: weekEnd && weekEnd !== week ? `${week}-${weekEnd}` : String(week),
  };
}

function extractYear(value) {
  const match = value?.match(/(20\d{2})/);
  return match ? Number(match[1]) : null;
}

function extractRevision(value) {
  const match = value?.match(/(?:ändringstryck|andringstryck)[\s_-]*(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function normalizeDocument(document) {
  const sourceText = `${document.title ?? ''} ${document.url ?? ''}`;
  const weekInfo = extractWeekInfo(document.title) ?? extractWeekInfo(document.url);

  return {
    ...document,
    week: weekInfo?.week ?? 999,
    weekEnd: weekInfo?.weekEnd ?? null,
    weekLabel: weekInfo?.weekLabel ?? '999',
    year: extractYear(document.title) ?? extractYear(document.url) ?? 9999,
    revision: extractRevision(sourceText),
  };
}

export function selectAuthoritativeDocuments(payload) {
  const documents = payload?.results?.[0]?.documents;

  if (!Array.isArray(documents)) {
    throw new Error('Could not find document list in API response');
  }

  const authoritative = new Map();

  for (const document of documents.map(normalizeDocument)) {
    const key = `${document.year}:${document.week}:${document.weekEnd ?? document.week}`;
    const current = authoritative.get(key);

    if (!current || document.revision > current.revision) {
      authoritative.set(key, document);
    }
  }

  return [...authoritative.values()].sort((left, right) =>
    left.year - right.year || left.week - right.week || (left.weekEnd ?? left.week) - (right.weekEnd ?? right.week),
  );
}

async function main() {
  let input = '';

  for await (const chunk of process.stdin) {
    input += chunk;
  }

  process.stdout.write(`${JSON.stringify(selectAuthoritativeDocuments(JSON.parse(input)))}\n`);
}

const entryFilePath = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === entryFilePath) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
