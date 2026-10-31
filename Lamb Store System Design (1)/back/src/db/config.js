const dotenv = require('dotenv');

dotenv.config();

function hasDatabaseConfiguration() {
  if (process.env.DATABASE_URL) return true;

  return Boolean(
    process.env.DB_HOST &&
      process.env.DB_NAME &&
      process.env.DB_USER &&
      process.env.DB_PASSWORD
  );
}

function getDatabaseConfig() {
  const connectionString = process.env.DATABASE_URL;
  const host = process.env.DB_HOST || 'localhost';
  const useSsl =
    process.env.DB_SSL === 'true' ||
    (connectionString || host).includes('neon');
  const ssl = useSsl ? { rejectUnauthorized: false } : false;

  if (connectionString) {
    return {
      connectionString,
      ssl: useSsl ? ssl : undefined,
    };
  }

  return {
    host,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'lamb_store',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl,
  };
}

module.exports = { getDatabaseConfig, hasDatabaseConfiguration };
