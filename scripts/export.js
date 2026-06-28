const fs = require('fs');
const path = require('path');
const { parse } = require('json2csv');

function getTapes() {
  try {
    const tapesPath = path.resolve(__dirname, '..', 'data', 'tapes.json');
    const tapes = JSON.parse(fs.readFileSync(tapesPath, 'utf8'));
    return tapes;
  } catch (e) {
    console.error(`Error reading tapes.json: ${e.message}`);
    process.exit(1);
  }
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function exportTapes(format, statusFilter) {
  const tapes = getTapes();
  const filtered = statusFilter ? tapes.filter(t => t.status === statusFilter) : tapes;

  if (format === 'csv') {
    const fields = ['id', 'title', 'year', 'label', 'format', 'condition', 'condition_notes', 'barcode', 'value_low', 'value_high', 'status', 'scanned_at'];
    const csv = parse(filtered, { fields });
    process.stdout.write(csv);
  } else if (format === 'html') {
    const rows = filtered.map(t => `
      <tr>
        <td>${esc(t.id)}</td>
        <td>${esc(t.title)}</td>
        <td>${esc(t.year)}</td>
        <td>${esc(t.label)}</td>
        <td>${esc(t.format)}</td>
        <td>${esc(t.condition)}</td>
        <td>${esc(t.status)}</td>
        <td>${(t.value_low || t.value_high) ? `$${esc(t.value_low || '?')}–$${esc(t.value_high || '?')}` : ''}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>VHS Collection</title>
<style>
  body { font-family: sans-serif; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid `#ddd`; padding: 8px; text-align: left; }
  th { background-color: `#f2f2f2`; }
</style>
</head>
<body>
  <h1>VHS Collection Export</h1>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Title</th>
        <th>Year</th>
        <th>Label</th>
        <th>Format</th>
        <th>Condition</th>
        <th>Status</th>
        <th>Value Range</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;
    process.stdout.write(html);
  } else if (format === 'print') {
    const condMap = { great: '✅ Great', good: '👍 Good', fair: '⚠️ Fair', poor: '❌ Poor' };
    const rows = filtered.map(t => `<tr style="background:${filtered.indexOf(t)%2?'#f9f9f9':'#fff'}">
      <td style="padding:6px 10px;font-family:monospace;font-size:11px;color:#666">${esc(t.id)}</td>
      <td style="padding:6px 10px;font-weight:600">${esc(t.title)}</td>
      <td style="padding:6px 10px;color:#555">${esc(t.year)}</td>
      <td style="padding:6px 10px;color:#555">${esc(t.label)}</td>
      <td style="padding:6px 10px">${condMap[t.condition] || esc(t.condition)}</td>
      <td style="padding:6px 10px;color:#2a7">${(t.value_low || t.value_high) ? `$${esc(t.value_low || '?')}–$${esc(t.value_high || '?')}` : ''}</td>
      <td style="padding:6px 10px;font-size:11px;color:#777">${(t.tags || []).map(tag => esc(tag)).join(', ')}</td>
    </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>VHS Inventory</title>
    <style>body{font-family:system-ui,sans-serif;margin:30px;color:#222}h1{margin-bottom:4px}p{color:#777;font-size:13px;margin-bottom:20px}
    table{width:100%;border-collapse:collapse;font-size:13px}th{background:#222;color:#fff;padding:8px 10px;text-align:left}
    tr:hover{background:#f0f0f0!important}@media print{button{display:none}}</style></head>
    <body><h1>VHS Collection</h1><p>Exported ${new Date().toLocaleDateString()} · ${filtered.length} tape${filtered.length !== 1 ? 's' : ''}</p>
    <table><tr><th>ID</th><th>Title</th><th>Year</th><th>Label</th><th>Condition</th><th>Est. Value</th><th>Tags</th></tr>${rows}</table></body></html>`;
    process.stdout.write(html);
  } else {
    console.error("Error: Invalid format specified. Use --format csv, --format html, or --format print.");
    process.exit(1);
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let format = 'csv';
  let status = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--format' && args[i + 1]) {
      format = args[++i];
    } else if (args[i] === '--status' && args[i + 1]) {
      status = args[++i];
    }
  }
  exportTapes(format, status);
}
