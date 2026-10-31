const { Pool } = require('pg');
const { getDatabaseConfig } = require('./config');

const pool = new Pool(getDatabaseConfig());

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
