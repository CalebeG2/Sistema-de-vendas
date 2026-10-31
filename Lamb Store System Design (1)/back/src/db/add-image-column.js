const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'lamb_store',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl: process.env.DB_HOST?.includes('neon') ? { rejectUnauthorized: false } : false,
});

async function addImageColumn() {
  try {
    // Adicionar coluna de imagem se não existir
    await pool.query(`
      ALTER TABLE dtf_designs 
      ADD COLUMN IF NOT EXISTS imagem BYTEA;
    `);
    
    console.log('Coluna de imagem adicionada com sucesso');
    await pool.end();
  } catch (error) {
    console.error('Erro ao adicionar coluna:', error.message);
    process.exit(1);
  }
}

addImageColumn();
