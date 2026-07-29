// ── FILTERING & SORTING ───────────────────────────────────────────────────────
const { getInventory, getColFilters, getFormatList } = require('./inventory-state');

function norm(t) {
  return (t || '').toLowerCase().replace(/^(the |a |an )/i, '').trim();
}

function getFiltered() {
  const inv = getInventory();
  const filters = getColFilters();
  const sort = document.getElementById('sort-sel')?.value || 'scanned_desc';

  let items = inv.filter(t => {
    const q = (document.getElementById('search')?.value || '').toLowerCase();
    if (q && ![t.title, t.label || '', t.barcode || '', t.condition_notes || '', t.notes || '']
      .some(s => s.toLowerCase().includes(q))
      && !(t.tags || []).some(tag => tag.toLowerCase().includes(q))) {
      return false;
    }
    if (filters.title && !t.title.toLowerCase().includes(filters.title.toLowerCase())) return false;
    if (filters.label && !(t.label || '').toLowerCase().includes(filters.label.toLowerCase())) return false;
    if (filters.format && t.format !== filters.format) return false;
    if (filters.condition && t.condition !== filters.condition) return false;
    if (filters.status && t.status !== filters.status) return false;
    if (filters.tags && !(t.tags || []).some(tag => tag.toLowerCase().includes(filters.tags.toLowerCase()))) return false;
    if (filters.yrFrom && t.year && +t.year < +filters.yrFrom) return false;
    if (filters.yrTo && t.year && +t.year > +filters.yrTo) return false;
    return true;
  });

  items.sort((a, b) => {
    if (sort === 'title_asc') return norm(a.title).localeCompare(norm(b.title));
    if (sort === 'title_desc') return norm(b.title).localeCompare(norm(a.title));
    if (sort === 'scanned_asc') return (a.scanned_at || '').localeCompare(b.scanned_at || '');
    if (sort === 'id_asc') return (a.id || '').localeCompare(b.id || '');
    if (sort === 'year_asc') return (parseInt(a.year) || 9999) - (parseInt(b.year) || 9999);
    if (sort === 'year_desc') return (parseInt(b.year) || 0) - (parseInt(a.year) || 0);
    if (sort === 'val_desc') return (parseFloat(b.value_high) || parseFloat(b.value_low) || 0) - (parseFloat(a.value_high) || parseFloat(a.value_low) || 0);
    if (sort === 'val_asc') return (parseFloat(a.value_low) || parseFloat(a.value_high) || 0) - (parseFloat(b.value_low) || parseFloat(b.value_high) || 0);
    const condRank = { great: 0, good: 1, fair: 2, poor: 3 };
    if (sort === 'cond_asc') return (condRank[a.condition] ?? 1) - (condRank[b.condition] ?? 1);
    if (sort === 'cond_desc') return (condRank[b.condition] ?? 1) - (condRank[a.condition] ?? 1);
    return (b.scanned_at || '').localeCompare(a.scanned_at || '');
  });

  return items;
}

module.exports = { getFiltered };