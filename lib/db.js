const { Pool } = require('pg');

let pool;

function getPool() {
  if (process.env.NODE_ENV === 'test') {
    return {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn(),
      on: jest.fn(),
    };
  }
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
    pool.on('error', (err, client) => {
      console.error('Unexpected error on idle client', err);
      process.exit(-1);
    });
  }
  return pool;
}

const db = {
  query: (text, params) => getPool().query(text, params),
  getClient: () => getPool().connect(),
};

module.exports = db;
