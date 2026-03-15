import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';

const samplesDir = path.resolve('data/samples');

function sortByWeek(files) {
  return [...files].sort((left, right) => left.localeCompare(right, 'sv'));
}

function printExcerpt(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20)
    .join('\n');
}

async function extractFromFile(filename) {
  const filePath = path.join(samplesDir, filename);
  const buffer = await readFile(filePath);
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  const text = result.text.trim();

  console.log(`===== ${filename} =====`);
  console.log(`pages=${result.total} chars=${text.length}`);
  console.log(printExcerpt(text));
  console.log('');

  await parser.destroy();
}

async function main() {
  const entries = await readdir(samplesDir);
  const pdfFiles = sortByWeek(entries.filter((entry) => entry.toLowerCase().endsWith('.pdf')));

  if (pdfFiles.length === 0) {
    throw new Error(`No PDF files found in ${samplesDir}`);
  }

  for (const filename of pdfFiles) {
    await extractFromFile(filename);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
