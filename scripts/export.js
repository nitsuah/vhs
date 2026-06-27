const fs = require('fs');
const { parse } = require('json2csv');

function exportTapes(statusFilter) {
  try {
    const tapes = JSON.parse(fs.readFileSync('data/tapes.json', 'utf8'));
    const filtered = statusFilter ? tapes.filter(t => t.status === statusFilter) : tapes;

    const fields = ['title', 'year', 'label', 'format', 'condition', 'imdb_id', 'barcode'];
    const csv = parse(filtered, { fields });
    process.stdout.write(csv);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

const status = process.argv[2] === '--status' ? process.argv[3] : null;
exportTapes(status);
