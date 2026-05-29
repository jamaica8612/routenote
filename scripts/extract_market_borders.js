/**
 * Extract border data from Excel market map sheets.
 * Usage: node extract_market_borders.js <xlsxPath> <sheetNumber> <minRow> <maxRow> <minCol> <maxCol>
 *
 * Outputs JSON array of { row_idx, col_idx, borders: {l,r,t,b} }
 * where row_idx = Excel row - 1, col_idx = Excel col - 1 (A=1)
 *
 * Example (청과물동 sheet1, rows 5-34, cols 1-58):
 *   node extract_market_borders.js "농산물 33-2.xlsx" 1 5 34 1 58
 *
 * Example (무배추동 sheet3, rows 2-16, cols 2-20):
 *   node extract_market_borders.js "농산물 33-2.xlsx" 3 2 16 2 20
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import os from 'os';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const [,, xlsxPath, sheetNum, minRowStr, maxRowStr, minColStr, maxColStr] = process.argv;

if (!xlsxPath) {
  console.error('Usage: node extract_market_borders.js <xlsxPath> <sheetNumber> [minRow maxRow minCol maxCol]');
  process.exit(1);
}

const SHEET = parseInt(sheetNum || '1');
const MIN_ROW = parseInt(minRowStr || '1');
const MAX_ROW = parseInt(maxRowStr || '999');
const MIN_COL = parseInt(minColStr || '1');
const MAX_COL = parseInt(maxColStr || '999');

const tmpDir = path.join(os.tmpdir(), 'xlsx_borders_' + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });

try {
  // Unzip xlsx
  const zipPath = path.join(tmpDir, 'temp.zip');
  fs.copyFileSync(xlsxPath, zipPath);

  // Use PowerShell to extract on Windows, unzip on Unix
  if (process.platform === 'win32') {
    execSync(`powershell -Command "Expand-Archive '${zipPath}' -DestinationPath '${tmpDir}' -Force"`, { stdio: 'pipe' });
  } else {
    execSync(`unzip -q "${zipPath}" -d "${tmpDir}"`, { stdio: 'pipe' });
  }

  const stylesXml = fs.readFileSync(path.join(tmpDir, 'xl', 'styles.xml'), 'utf8');
  const sheetXml = fs.readFileSync(path.join(tmpDir, 'xl', 'worksheets', `sheet${SHEET}.xml`), 'utf8');

  // Parse border definitions from styles.xml
  const bordersMatch = stylesXml.match(/<borders count="\d+">([\s\S]*?)<\/borders>/);
  const bordersSection = bordersMatch ? bordersMatch[1] : '';
  const borderDefs = [];
  const borderItems = bordersSection.match(/<border[^>]*>[\s\S]*?<\/border>/g) || [];

  for (const b of borderItems) {
    const hasBorder = (tag) => {
      const m = b.match(new RegExp(`<${tag}(?:\\s+style="([^"]+)")?`));
      if (!m) return false;
      return m[1] && m[1] !== 'none' ? true : false;
    };
    borderDefs.push({
      l: hasBorder('left') ? 1 : 0,
      r: hasBorder('right') ? 1 : 0,
      t: hasBorder('top') ? 1 : 0,
      b: hasBorder('bottom') ? 1 : 0,
    });
  }

  // Parse cell format indices from styles.xml (xf table)
  const cellXfsMatch = stylesXml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/);
  const xfSection = cellXfsMatch ? cellXfsMatch[1] : '';
  const xfItems = xfSection.match(/<xf[^/]*(?:\/>|>[\s\S]*?<\/xf>)/g) || [];
  const xfBorderIdx = xfItems.map((xf) => {
    const m = xf.match(/borderId="(\d+)"/);
    return m ? parseInt(m[1]) : 0;
  });

  // Parse column letter to 1-based index
  function colLetterToIdx(col) {
    let result = 0;
    for (const ch of col.toUpperCase()) {
      result = result * 26 + (ch.charCodeAt(0) - 64);
    }
    return result;
  }

  // Extract cells from sheet
  const cellRegex = /<c r="([A-Z]+)(\d+)"[^>]*s="(\d+)"[^>]*(?:\/|>[\s\S]*?<\/c>)/g;
  const results = [];
  let m;

  while ((m = cellRegex.exec(sheetXml)) !== null) {
    const colLetter = m[1];
    const rowNum = parseInt(m[2]);
    const styleIdx = parseInt(m[3]);

    const colNum = colLetterToIdx(colLetter);
    if (rowNum < MIN_ROW || rowNum > MAX_ROW) continue;
    if (colNum < MIN_COL || colNum > MAX_COL) continue;

    const borderIdx = xfBorderIdx[styleIdx] || 0;
    const borders = borderDefs[borderIdx] || { l: 0, r: 0, t: 0, b: 0 };

    if (borders.l || borders.r || borders.t || borders.b) {
      results.push({
        row_idx: rowNum - 1,
        col_idx: colNum - 1,
        borders,
      });
    }
  }

  console.log(JSON.stringify(results, null, 2));
  process.stderr.write(`Extracted ${results.length} cells with borders from sheet${SHEET}\n`);

} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
