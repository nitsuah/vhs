// Migrations bundled as Text modules (see "rules" in wrangler.jsonc).
// Workers can't fs.readdirSync the migrations dir, so list them here.
// tests/worker-migrations.test.js fails if this list drifts from migrations/.
import m001 from '../migrations/001_initial_schema.sql';
import m002a from '../migrations/002_enhanced_lookup.sql';
import m002b from '../migrations/002_review_items.sql';
import m003 from '../migrations/003_imdb_index.sql';
import m004 from '../migrations/004_scan_analytics.sql';
import m005 from '../migrations/005_multi_user.sql';
import m006 from '../migrations/006_email_not_unique.sql';
import m007 from '../migrations/007_tmdb_lookups.sql';
import m008 from '../migrations/008_queue_ownership.sql';

export const MIGRATION_FILES = [
  '001_initial_schema.sql',
  '002_enhanced_lookup.sql',
  '002_review_items.sql',
  '003_imdb_index.sql',
  '004_scan_analytics.sql',
  '005_multi_user.sql',
  '006_email_not_unique.sql',
  '007_tmdb_lookups.sql',
  '008_queue_ownership.sql',
];

const SQL = [m001, m002a, m002b, m003, m004, m005, m006, m007, m008];

export const migrations = MIGRATION_FILES.map((name, i) => ({ name, sql: SQL[i] }));
