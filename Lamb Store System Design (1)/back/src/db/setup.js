const { Pool, Client } = require('pg');
const dotenv = require('dotenv');
const crypto = require('crypto');
const { getDatabaseConfig } = require('./config');

dotenv.config();

const dbName = process.env.DB_NAME || 'lamb_store';
const baseConfig = getDatabaseConfig();

async function ensureDatabaseExists() {
  if (process.env.DATABASE_URL || process.env.NODE_ENV === 'production') return;
  const client = new Client({ ...baseConfig, database: 'postgres' });
  try {
    await client.connect();
    const res = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (res.rowCount === 0) {
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Database "${dbName}" created successfully.`);
    }
  } catch (err) {
    // Ignore if already exists or cannot connect to maintenance db
  } finally {
    await client.end().catch(() => {});
  }
}

async function setup() {
  await ensureDatabaseExists();

  const pool = new Pool(process.env.DATABASE_URL ? baseConfig : { ...baseConfig, database: dbName });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      sku VARCHAR(100) UNIQUE NOT NULL,
      nome VARCHAR(255) NOT NULL,
      categoria VARCHAR(100) NOT NULL,
      preco NUMERIC(10,2) NOT NULL,
      custo NUMERIC(10,2) NOT NULL,
      estoque INTEGER NOT NULL DEFAULT 0,
      estoque_minimo INTEGER NOT NULL DEFAULT 10,
      status VARCHAR(50) NOT NULL DEFAULT 'Ativo'
    );
  `);

  await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS estoque_minimo INTEGER NOT NULL DEFAULT 10');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id SERIAL PRIMARY KEY,
      product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
      tipo VARCHAR(30) NOT NULL,
      motivo VARCHAR(255),
      quantidade INTEGER NOT NULL,
      saldo INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dtf_designs (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      cat VARCHAR(100) NOT NULL,
      dpi INTEGER NOT NULL DEFAULT 300,
      tam VARCHAR(50) NOT NULL DEFAULT 'A4',
      versoes INTEGER NOT NULL DEFAULT 1,
      lic VARCHAR(50) NOT NULL DEFAULT 'Padrão',
      usos INTEGER NOT NULL DEFAULT 0,
      hue VARCHAR(20) NOT NULL DEFAULT '#10b981',
      estoque INTEGER NOT NULL DEFAULT 0,
      imagem BYTEA,
      mime_type VARCHAR(100)
    );
  `);

  await pool.query('ALTER TABLE dtf_designs ADD COLUMN IF NOT EXISTS imagem BYTEA');
  await pool.query('ALTER TABLE dtf_designs ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100)');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      cliente VARCHAR(255) NOT NULL,
      cpf_cnpj VARCHAR(30),
      telefone VARCHAR(40),
      email VARCHAR(255),
      endereco VARCHAR(255),
      cidade VARCHAR(100),
      uf VARCHAR(2),
      cep VARCHAR(15),
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      dtf_id INTEGER REFERENCES dtf_designs(id) ON DELETE SET NULL,
      quantidade INTEGER NOT NULL CHECK (quantidade > 0),
      valor_total NUMERIC(12,2) NOT NULL DEFAULT 0,
      pagamento VARCHAR(30) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'aguardando',
      prazo DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS cpf_cnpj VARCHAR(30)');
  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS telefone VARCHAR(40)');
  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS email VARCHAR(255)');
  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS endereco VARCHAR(255)');
  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS cidade VARCHAR(100)');
  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS uf VARCHAR(2)');
  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS cep VARCHAR(15)');
  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS valor_total NUMERIC(12,2) NOT NULL DEFAULT 0');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dashboard_entries (
      id SERIAL PRIMARY KEY,
      data DATE NOT NULL DEFAULT CURRENT_DATE,
      descricao VARCHAR(255) NOT NULL DEFAULT 'Lançamento Manual',
      receita NUMERIC(12,2) NOT NULL DEFAULT 0,
      pedidos INTEGER NOT NULL DEFAULT 1,
      pagamento VARCHAR(30) NOT NULL DEFAULT 'pix',
      status_pedido VARCHAR(30) NOT NULL DEFAULT 'entregue',
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      produto_nome VARCHAR(255),
      quantidade_pecas INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS automation_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      backup_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      report_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`INSERT INTO automation_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      cargo VARCHAR(50) NOT NULL DEFAULT 'Operador',
      status VARCHAR(20) NOT NULL DEFAULT 'Ativo',
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const userCount = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  if (userCount.rows[0].count === 0) {
    const adminEmail = process.env.INITIAL_ADMIN_EMAIL || 'ana@lambstore.com.br';
    const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'admin123';
    const passwordHash = crypto.scryptSync(adminPassword, 'lamb-store-salt', 64).toString('hex');
    await pool.query(
      `INSERT INTO users (nome, email, cargo, password_hash) VALUES ($1, $2, $3, $4)`,
      ['Ana Costa', adminEmail, 'Admin', passwordHash]
    );
  }

  if (process.env.NODE_ENV !== 'production') {
    await pool.query(`
      DELETE FROM products
      WHERE sku IN (
        'CAM-BAS-BRA-P', 'CAM-BAS-BRA-M', 'CAM-PRE-PRE-M', 'CAM-OVR-CIN-G',
        'REG-ESS-VIN-PM', 'CAM-POL-AZU-M', 'CAM-BAS-PRE-G', 'CAM-PRE-BRA-P'
      )
    `);

    await pool.query(`
      DELETE FROM dtf_designs
      WHERE nome IN (
        'Logo Minimal v3', 'Floral Delicado', 'Street Art 04', 'Bordado Classic',
        'Tropical v2', 'Minimal Lines', 'Geometric 08', 'Urban Pattern', 'Vintage Logo'
      )
    `);
  }

  console.log('Database schema initialized successfully.');
  await pool.end();
}

if (require.main === module) {
  setup().catch((error) => {
    console.error('Failed to initialize PostgreSQL database:');
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { setup, ensureDatabaseExists };
