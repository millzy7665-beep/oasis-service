const fs = require('fs');
const os = require('os');
const path = require('path');
const ExcelJS = require('exceljs');

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join(' ').trim().toLowerCase();
    if (typeof value.text === 'string') return value.text.trim().toLowerCase();
    if (value.result !== undefined && value.result !== null) return String(value.result).trim().toLowerCase();
    if (value.formula) return String(value.formula).trim().toLowerCase();
  }
  return String(value).replace(/\s+/g, ' ').trim().toLowerCase();
}

function findCellByLabels(worksheet, labels) {
  const maxRows = Math.min(Math.max(worksheet.rowCount || 0, 40), 120);
  const maxCols = Math.min(Math.max(worksheet.columnCount || 0, 8), 12);
  for (let row = 1; row <= maxRows; row++) {
    for (let col = 1; col <= maxCols; col++) {
      const cell = worksheet.getCell(row, col);
      const text = normalizeText(cell.value);
      if (text && labels.some(label => text.includes(label))) return cell;
    }
  }
  return null;
}

function writeValueBesideLabel(worksheet, labels, value, fallbackAddress = '') {
  const cell = findCellByLabels(worksheet, labels);
  if (cell) {
    const rightCell = worksheet.getCell(cell.row, cell.col + 1);
    const belowCell = worksheet.getCell(cell.row + 1, cell.col);
    const target = normalizeText(rightCell.value) ? belowCell : rightCell;
    target.value = value;
    return true;
  }
  if (fallbackAddress) {
    worksheet.getCell(fallbackAddress).value = value;
    return true;
  }
  return false;
}

function findTableLayout(worksheet) {
  const maxRows = Math.min(Math.max(worksheet.rowCount || 0, 20), 120);
  for (let row = 1; row <= maxRows; row++) {
    const cells = [];
    worksheet.getRow(row).eachCell({ includeEmpty: false }, cell => {
      cells.push({ col: cell.col, text: normalizeText(cell.value) });
    });
    if (!cells.length) continue;
    const findCol = keys => cells.find(entry => keys.some(key => entry.text.includes(key)))?.col || 0;
    const descriptionCol = findCol(['description', 'item', 'equipment', 'product', 'service']);
    const qtyCol = findCol(['qty', 'quantity']);
    const priceCol = findCol(['unit price', 'price', 'rate']);
    const totalCol = findCol(['amount', 'line total', 'total']);
    if (descriptionCol && (qtyCol || priceCol || totalCol)) {
      return { row, descriptionCol, qtyCol, priceCol, totalCol };
    }
  }
  return null;
}

function populateTemplateWorkbook(workbook, estimate) {
  let hits = 0;
  workbook.eachSheet(worksheet => {
    hits += writeValueBesideLabel(worksheet, ['estimate #', 'quote #', 'quote no', 'estimate no'], estimate.estimateNumber, 'F3') ? 1 : 0;
    hits += writeValueBesideLabel(worksheet, ['date'], estimate.date, 'G3') ? 1 : 0;
    hits += writeValueBesideLabel(worksheet, ['client', 'customer', 'bill to'], estimate.clientName, 'B5') ? 1 : 0;
    hits += writeValueBesideLabel(worksheet, ['address', 'property'], estimate.address, 'B6') ? 1 : 0;
    hits += writeValueBesideLabel(worksheet, ['project', 'scope'], estimate.project, 'B7') ? 1 : 0;
    hits += writeValueBesideLabel(worksheet, ['subtotal'], estimate.subtotal, 'G20') ? 1 : 0;
    hits += writeValueBesideLabel(worksheet, ['grand total', 'balance due', 'total'], estimate.total, 'G23') ? 1 : 0;

    const layout = findTableLayout(worksheet);
    if (layout) {
      const row = layout.row + 1;
      worksheet.getCell(row, layout.descriptionCol).value = estimate.itemDescription;
      if (layout.qtyCol) worksheet.getCell(row, layout.qtyCol).value = estimate.qty;
      if (layout.priceCol) worksheet.getCell(row, layout.priceCol).value = estimate.unitPrice;
      if (layout.totalCol) worksheet.getCell(row, layout.totalCol).value = estimate.total;
      hits += 1;
    }
  });
  return hits;
}

function createFallbackWorksheet(workbook, estimate) {
  const worksheet = workbook.addWorksheet('Estimate Test');
  worksheet.columns = [
    { width: 18 },
    { width: 48 },
    { width: 10 },
    { width: 14 },
    { width: 16 }
  ];
  worksheet.mergeCells('A1:E2');
  worksheet.getCell('A1').value = 'OASIS CLIENT ESTIMATE';
  worksheet.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
  worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1A405F' } };
  worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.getCell('A4').value = 'Estimate #';
  worksheet.getCell('B4').value = estimate.estimateNumber;
  worksheet.getCell('D4').value = 'Date';
  worksheet.getCell('E4').value = estimate.date;
  worksheet.getCell('A5').value = 'Client';
  worksheet.getCell('B5').value = estimate.clientName;
  worksheet.getCell('A6').value = 'Address';
  worksheet.getCell('B6').value = estimate.address;
  worksheet.mergeCells('B6:E6');
  worksheet.getCell('A7').value = 'Project';
  worksheet.getCell('B7').value = estimate.project;
  worksheet.mergeCells('B7:E7');

  worksheet.getRow(9).values = ['Category', 'Equipment / Description', 'Qty', 'Unit Price', 'Line Total'];
  worksheet.getRow(9).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '539199' } };

  worksheet.getRow(10).values = [estimate.category, estimate.itemDescription, estimate.qty, estimate.unitPrice, estimate.total];
  worksheet.getCell('D10').numFmt = '$#,##0.00';
  worksheet.getCell('E10').numFmt = '$#,##0.00';

  worksheet.getCell('D12').value = 'Subtotal';
  worksheet.getCell('E12').value = estimate.subtotal;
  worksheet.getCell('D13').value = 'Grand Total';
  worksheet.getCell('E13').value = estimate.total;
  worksheet.getCell('E12').numFmt = '$#,##0.00';
  worksheet.getCell('E13').numFmt = '$#,##0.00';
}

async function main() {
  const estimate = {
    estimateNumber: 'EST-TEST-001',
    date: '2026-04-10',
    clientName: 'Test Client',
    address: 'Grand Cayman',
    project: 'Estimate Export Test',
    category: 'PUMPS',
    itemDescription: 'Variable Speed Pump',
    qty: 1,
    unitPrice: 1200,
    subtotal: 1200,
    total: 1200
  };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OASIS Service App';
  workbook.created = new Date();

  const candidates = ['QUOTE_TEMPLATE.xlsx', 'QUOTE TEMPLATE.xlsx', '1. QUOTE TEMPLATE.xlsx'];
  let templateName = 'built-in layout';
  for (const candidate of candidates) {
    const fullPath = path.join(process.cwd(), candidate);
    if (fs.existsSync(fullPath)) {
      await workbook.xlsx.readFile(fullPath);
      templateName = candidate;
      break;
    }
  }

  const hits = templateName !== 'built-in layout' ? populateTemplateWorkbook(workbook, estimate) : 0;
  if (templateName === 'built-in layout' || hits < 4) {
    createFallbackWorksheet(workbook, estimate);
  }

  const outputPath = path.join(os.tmpdir(), 'oasis-estimate-export-test.xlsx');
  await workbook.xlsx.writeFile(outputPath);

  const verifyWorkbook = new ExcelJS.Workbook();
  await verifyWorkbook.xlsx.readFile(outputPath);
  const values = [];
  verifyWorkbook.eachSheet(sheet => {
    sheet.eachRow({ includeEmpty: false }, row => {
      row.eachCell({ includeEmpty: false }, cell => values.push(normalizeText(cell.value)));
    });
  });

  const joined = values.join(' | ');
  const stats = fs.statSync(outputPath);

  if (stats.size < 2000) throw new Error(`Workbook too small: ${stats.size} bytes`);
  if (!joined.includes('est-test-001')) throw new Error('Estimate number missing from workbook');
  if (!joined.includes('estimate export test')) throw new Error('Project title missing from workbook');

  console.log(`PASS: estimate export ok using ${templateName} -> ${outputPath} (${stats.size} bytes)`);
}

main().catch(error => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
