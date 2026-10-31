const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { Resend } = require('resend');
const { setup } = require('./db/setup');

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'lamb_store',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl: process.env.DB_HOST?.includes('neon') ? { rejectUnauthorized: false } : false,
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const backupsDir = path.join(__dirname, '..', 'backups');
const localStorePath = path.join(__dirname, 'db', 'local-data.json');
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

let usePostgres = false;

function hashPassword(password) {
  return crypto.scryptSync(password, 'lamb-store-salt', 64).toString('hex');
}

function publicUser(user) {
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    cargo: user.cargo,
    status: user.status,
    ultimo: user.ultimo || new Date().toLocaleString('pt-BR'),
  };
}

function orderStatus(status) {
  return ['aguardando', 'producao', 'finalizado', 'entregue', 'cancelado'].includes(status)
    ? status
    : 'aguardando';
}

function computeProductStatus(estoque, min = 10, manualStatus) {
  const qty = Number(estoque) || 0;
  const minQty = Number(min) || 10;
  if (qty <= 0) return 'Sem Estoque';
  if (qty <= minQty) return 'Crítico';
  return manualStatus && manualStatus !== 'Sem Estoque' && manualStatus !== 'Crítico'
    ? manualStatus
    : 'Ativo';
}

// Local JSON Store Fallback when PostgreSQL is offline
function loadLocalStore() {
  try {
    if (fs.existsSync(localStorePath)) {
      const parsed = JSON.parse(fs.readFileSync(localStorePath, 'utf-8'));
      return {
        products: parsed.products || [],
        dtf_designs: parsed.dtf_designs || [],
        orders: parsed.orders || [],
        dashboard_entries: parsed.dashboard_entries || [],
        stock_movements: parsed.stock_movements || [],
        users: parsed.users?.length
          ? parsed.users
          : [
              {
                id: 1,
                nome: 'Ana Costa',
                email: 'ana@lambstore.com.br',
                cargo: 'Admin',
                status: 'Ativo',
                password_hash: hashPassword('admin123'),
                ultimo: new Date().toLocaleString('pt-BR'),
              },
            ],
        automation_settings: parsed.automation_settings || {
          backup_enabled: true,
          report_enabled: false,
        },
        nextIds: parsed.nextIds || {
          products: 1,
          dtf_designs: 1,
          orders: 1,
          dashboard_entries: 1,
          stock_movements: 1,
          users: 2,
        },
      };
    }
  } catch (err) {
    console.error('Failed to read local store, initializing empty store:', err.message);
  }
  const initial = {
    products: [],
    dtf_designs: [],
    orders: [],
    dashboard_entries: [],
    stock_movements: [],
    users: [
      {
        id: 1,
        nome: 'Ana Costa',
        email: 'ana@lambstore.com.br',
        cargo: 'Admin',
        status: 'Ativo',
        password_hash: hashPassword('admin123'),
        ultimo: new Date().toLocaleString('pt-BR'),
      },
    ],
    automation_settings: { backup_enabled: true, report_enabled: false },
    nextIds: {
      products: 1,
      dtf_designs: 1,
      orders: 1,
      dashboard_entries: 1,
      stock_movements: 1,
      users: 2,
    },
  };
  saveLocalStore(initial);
  return initial;
}

function saveLocalStore(store) {
  try {
    fs.mkdirSync(path.dirname(localStorePath), { recursive: true });
    fs.writeFileSync(localStorePath, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write local store:', err.message);
  }
}

async function initDatabase() {
  try {
    await setup();
    await pool.query('SELECT 1');
    usePostgres = true;
    console.log('✅ Connected to PostgreSQL database (clean state without mock data).');
  } catch (error) {
    usePostgres = false;
    loadLocalStore();
    console.warn(
      '⚠️ PostgreSQL not reachable (' +
        error.message +
        '). Using persistent local JSON database (src/db/local-data.json).'
    );
  }
}

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
app.get('/api/products', async (req, res) => {
  try {
    if (usePostgres) {
      const result = await pool.query('SELECT * FROM products ORDER BY id DESC');
      return res.json(
        result.rows.map((r) => ({
          ...r,
          preco: Number(r.preco),
          custo: Number(r.custo),
          estoque: Number(r.estoque),
          estoque_minimo: Number(r.estoque_minimo ?? 10),
        }))
      );
    }
    const store = loadLocalStore();
    res.json([...store.products].sort((a, b) => b.id - a.id));
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Falha ao buscar produtos' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (usePostgres) {
      const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Produto não encontrado' });
      const r = result.rows[0];
      return res.json({
        ...r,
        preco: Number(r.preco),
        custo: Number(r.custo),
        estoque: Number(r.estoque),
        estoque_minimo: Number(r.estoque_minimo ?? 10),
      });
    }
    const store = loadLocalStore();
    const prod = store.products.find((p) => p.id === id);
    if (!prod) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(prod);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Falha ao buscar produto' });
  }
});

app.get('/api/products/:id/movements', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (usePostgres) {
      const result = await pool.query(
        'SELECT * FROM stock_movements WHERE product_id = $1 ORDER BY created_at DESC LIMIT 50',
        [id]
      );
      return res.json(result.rows);
    }
    const store = loadLocalStore();
    res.json(
      store.stock_movements
        .filter((m) => m.product_id === id)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    );
  } catch (error) {
    res.status(500).json({ error: 'Falha ao buscar movimentações' });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const { sku, nome, categoria, preco, custo, estoque, estoque_minimo, status } = req.body;
    if (!sku || !nome || !categoria || preco === undefined || custo === undefined) {
      return res.status(400).json({ error: 'Preencha todos os campos obrigatórios do produto' });
    }
    const parsedPreco = Number(preco);
    const parsedCusto = Number(custo);
    const parsedEstoque = Number(estoque ?? 0);
    const parsedMinimo = Number(estoque_minimo ?? 10);
    const finalStatus = computeProductStatus(parsedEstoque, parsedMinimo, status);

    if (usePostgres) {
      const result = await pool.query(
        'INSERT INTO products (sku, nome, categoria, preco, custo, estoque, estoque_minimo, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
        [sku.trim(), nome.trim(), categoria.trim(), parsedPreco, parsedCusto, parsedEstoque, parsedMinimo, finalStatus]
      );
      const r = result.rows[0];
      if (parsedEstoque > 0) {
        await pool.query(
          'INSERT INTO stock_movements (product_id, tipo, motivo, quantidade, saldo) VALUES ($1, $2, $3, $4, $5)',
          [r.id, 'Entrada', 'Estoque inicial no cadastro', parsedEstoque, parsedEstoque]
        );
      }
      return res.status(201).json({
        ...r,
        preco: Number(r.preco),
        custo: Number(r.custo),
        estoque: Number(r.estoque),
        estoque_minimo: Number(r.estoque_minimo ?? 10),
      });
    }

    const store = loadLocalStore();
    if (store.products.some((p) => p.sku.toLowerCase() === sku.trim().toLowerCase())) {
      return res.status(409).json({ error: 'Já existe um produto cadastrado com este SKU' });
    }
    const newProd = {
      id: store.nextIds.products++,
      sku: sku.trim(),
      nome: nome.trim(),
      categoria: categoria.trim(),
      preco: parsedPreco,
      custo: parsedCusto,
      estoque: parsedEstoque,
      estoque_minimo: parsedMinimo,
      status: finalStatus,
    };
    store.products.push(newProd);
    if (parsedEstoque > 0) {
      store.stock_movements.push({
        id: store.nextIds.stock_movements++,
        product_id: newProd.id,
        tipo: 'Entrada',
        motivo: 'Estoque inicial no cadastro',
        quantidade: parsedEstoque,
        saldo: parsedEstoque,
        created_at: new Date().toISOString(),
      });
    }
    saveLocalStore(store);
    res.status(201).json(newProd);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(error.code === '23505' ? 409 : 500).json({
      error: error.code === '23505' ? 'Já existe um produto com este SKU' : 'Falha ao criar produto',
    });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { sku, nome, categoria, preco, custo, estoque, estoque_minimo, status } = req.body;
    const parsedPreco = Number(preco);
    const parsedCusto = Number(custo);
    const parsedEstoque = Number(estoque ?? 0);
    const parsedMinimo = Number(estoque_minimo ?? 10);
    const finalStatus = computeProductStatus(parsedEstoque, parsedMinimo, status);

    if (usePostgres) {
      const result = await pool.query(
        'UPDATE products SET sku = $1, nome = $2, categoria = $3, preco = $4, custo = $5, estoque = $6, estoque_minimo = $7, status = $8 WHERE id = $9 RETURNING *',
        [sku.trim(), nome.trim(), categoria.trim(), parsedPreco, parsedCusto, parsedEstoque, parsedMinimo, finalStatus, id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Produto não encontrado' });
      const r = result.rows[0];
      return res.json({
        ...r,
        preco: Number(r.preco),
        custo: Number(r.custo),
        estoque: Number(r.estoque),
        estoque_minimo: Number(r.estoque_minimo ?? 10),
      });
    }

    const store = loadLocalStore();
    const idx = store.products.findIndex((p) => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Produto não encontrado' });
    if (
      store.products.some(
        (p) => p.id !== id && p.sku.toLowerCase() === sku.trim().toLowerCase()
      )
    ) {
      return res.status(409).json({ error: 'Já existe outro produto com este SKU' });
    }
    store.products[idx] = {
      ...store.products[idx],
      sku: sku.trim(),
      nome: nome.trim(),
      categoria: categoria.trim(),
      preco: parsedPreco,
      custo: parsedCusto,
      estoque: parsedEstoque,
      estoque_minimo: parsedMinimo,
      status: finalStatus,
    };
    saveLocalStore(store);
    res.json(store.products[idx]);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(error.code === '23505' ? 409 : 500).json({
      error: error.code === '23505' ? 'Já existe outro produto com este SKU' : 'Falha ao atualizar produto',
    });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (usePostgres) {
      const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Produto não encontrado' });
      return res.json({ message: 'Produto excluído com sucesso' });
    }
    const store = loadLocalStore();
    const idx = store.products.findIndex((p) => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Produto não encontrado' });
    store.products.splice(idx, 1);
    saveLocalStore(store);
    res.json({ message: 'Produto excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Falha ao excluir produto' });
  }
});

app.patch('/api/products/:id/stock', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const quantity = Number(req.body.quantity);
    const type = req.body.type === 'saida' ? 'saida' : 'entrada';
    const motivo = (req.body.motivo || (type === 'entrada' ? 'Entrada manual' : 'Saída manual')).trim();

    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ error: 'A quantidade deve ser um número inteiro positivo' });
    }

    if (usePostgres) {
      const cur = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
      if (!cur.rows.length) return res.status(404).json({ error: 'Produto não encontrado' });
      const prod = cur.rows[0];
      if (type === 'saida' && Number(prod.estoque) < quantity) {
        return res.status(409).json({ error: 'Estoque insuficiente para realizar a saída' });
      }
      const nextStock = type === 'entrada' ? Number(prod.estoque) + quantity : Number(prod.estoque) - quantity;
      const nextStatus = computeProductStatus(nextStock, prod.estoque_minimo ?? 10, prod.status);
      const result = await pool.query(
        'UPDATE products SET estoque = $1, status = $2 WHERE id = $3 RETURNING *',
        [nextStock, nextStatus, id]
      );
      await pool.query(
        'INSERT INTO stock_movements (product_id, tipo, motivo, quantidade, saldo) VALUES ($1, $2, $3, $4, $5)',
        [id, type === 'entrada' ? 'Entrada' : 'Saída', motivo, type === 'entrada' ? quantity : -quantity, nextStock]
      );
      const r = result.rows[0];
      return res.json({
        ...r,
        preco: Number(r.preco),
        custo: Number(r.custo),
        estoque: Number(r.estoque),
        estoque_minimo: Number(r.estoque_minimo ?? 10),
      });
    }

    const store = loadLocalStore();
    const idx = store.products.findIndex((p) => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Produto não encontrado' });
    const prod = store.products[idx];
    if (type === 'saida' && Number(prod.estoque) < quantity) {
      return res.status(409).json({ error: 'Estoque insuficiente para realizar a saída' });
    }
    const nextStock = type === 'entrada' ? Number(prod.estoque) + quantity : Number(prod.estoque) - quantity;
    prod.estoque = nextStock;
    prod.status = computeProductStatus(nextStock, prod.estoque_minimo ?? 10, prod.status);
    store.stock_movements.push({
      id: store.nextIds.stock_movements++,
      product_id: prod.id,
      tipo: type === 'entrada' ? 'Entrada' : 'Saída',
      motivo,
      quantidade: type === 'entrada' ? quantity : -quantity,
      saldo: nextStock,
      created_at: new Date().toISOString(),
    });
    saveLocalStore(store);
    res.json(prod);
  } catch (error) {
    console.error('Error adjusting stock:', error);
    res.status(500).json({ error: 'Falha ao ajustar estoque' });
  }
});

// ─── AUTHENTICATION & USERS ───────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (usePostgres) {
      const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email || '']);
      const user = result.rows[0];
      if (!user || user.status !== 'Ativo' || hashPassword(password || '') !== user.password_hash) {
        return res.status(401).json({ error: 'E-mail ou senha inválidos' });
      }
      return res.json({ user: publicUser(user) });
    }
    const store = loadLocalStore();
    const user = store.users.find((u) => u.email.toLowerCase() === String(email || '').toLowerCase());
    if (!user || user.status !== 'Ativo' || hashPassword(password || '') !== user.password_hash) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos' });
    }
    user.ultimo = new Date().toLocaleString('pt-BR');
    saveLocalStore(store);
    res.json({ user: publicUser(user) });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Falha ao autenticar' });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    if (usePostgres) {
      const result = await pool.query('SELECT id, nome, email, cargo, status, created_at FROM users ORDER BY id');
      return res.json(
        result.rows.map((u) => ({
          ...u,
          ultimo: new Date(u.created_at || Date.now()).toLocaleString('pt-BR'),
        }))
      );
    }
    const store = loadLocalStore();
    res.json(store.users.map(publicUser));
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Falha ao buscar usuários' });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { nome, email, cargo, password } = req.body;
    if (!nome || !email || !password) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
    }
    if (usePostgres) {
      const result = await pool.query(
        'INSERT INTO users (nome, email, cargo, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, nome, email, cargo, status, created_at',
        [nome, email, cargo || 'Operador', hashPassword(password)]
      );
      const u = result.rows[0];
      return res.status(201).json({ ...u, ultimo: new Date(u.created_at).toLocaleString('pt-BR') });
    }
    const store = loadLocalStore();
    if (store.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return res.status(409).json({ error: 'E-mail já cadastrado' });
    }
    const newUser = {
      id: store.nextIds.users++,
      nome,
      email,
      cargo: cargo || 'Operador',
      status: 'Ativo',
      password_hash: hashPassword(password),
      ultimo: new Date().toLocaleString('pt-BR'),
    };
    store.users.push(newUser);
    saveLocalStore(store);
    res.status(201).json(publicUser(newUser));
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(error.code === '23505' ? 409 : 500).json({
      error: error.code === '23505' ? 'E-mail já cadastrado' : 'Falha ao criar usuário',
    });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { nome, email, cargo, status, password } = req.body;
    if (usePostgres) {
      const values = [nome, email, cargo, status, id];
      const result = password
        ? await pool.query(
            'UPDATE users SET nome=$1, email=$2, cargo=$3, status=$4, password_hash=$5 WHERE id=$6 RETURNING id, nome, email, cargo, status, created_at',
            [nome, email, cargo, status, hashPassword(password), id]
          )
        : await pool.query(
            'UPDATE users SET nome=$1, email=$2, cargo=$3, status=$4 WHERE id=$5 RETURNING id, nome, email, cargo, status, created_at',
            values
          );
      if (!result.rows.length) return res.status(404).json({ error: 'Usuário não encontrado' });
      const u = result.rows[0];
      return res.json({ ...u, ultimo: new Date(u.created_at || Date.now()).toLocaleString('pt-BR') });
    }
    const store = loadLocalStore();
    const idx = store.users.findIndex((u) => u.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Usuário não encontrado' });
    store.users[idx] = {
      ...store.users[idx],
      nome: nome ?? store.users[idx].nome,
      email: email ?? store.users[idx].email,
      cargo: cargo ?? store.users[idx].cargo,
      status: status ?? store.users[idx].status,
      ...(password ? { password_hash: hashPassword(password) } : {}),
    };
    saveLocalStore(store);
    res.json(publicUser(store.users[idx]));
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(error.code === '23505' ? 409 : 500).json({
      error: error.code === '23505' ? 'E-mail já cadastrado' : 'Falha ao atualizar usuário',
    });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (usePostgres) {
      const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
      if (!result.rows.length) return res.status(404).json({ error: 'Usuário não encontrado' });
      return res.json({ message: 'Usuário removido com sucesso' });
    }
    const store = loadLocalStore();
    const idx = store.users.findIndex((u) => u.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Usuário não encontrado' });
    store.users.splice(idx, 1);
    saveLocalStore(store);
    res.json({ message: 'Usuário removido com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Falha ao remover usuário' });
  }
});

// ─── DTF DESIGNS ──────────────────────────────────────────────────────────────
app.get('/api/designs', async (req, res) => {
  try {
    if (usePostgres) {
      const result = await pool.query(`
        SELECT id, nome, cat, dpi, tam, versoes, lic, usos, hue, estoque,
               (imagem IS NOT NULL) AS has_image
        FROM dtf_designs
        ORDER BY id DESC
      `);
      return res.json(
        result.rows.map((d) => ({
          ...d,
          dpi: Number(d.dpi),
          versoes: Number(d.versoes),
          usos: Number(d.usos),
          estoque: Number(d.estoque),
        }))
      );
    }
    const store = loadLocalStore();
    res.json(
      [...store.dtf_designs]
        .sort((a, b) => b.id - a.id)
        .map(({ imagem, mime_type, ...rest }) => ({
          ...rest,
          has_image: Boolean(imagem),
        }))
    );
  } catch (error) {
    console.error('Error fetching designs:', error);
    res.status(500).json({ error: 'Falha ao buscar designs' });
  }
});

app.get('/api/designs/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (usePostgres) {
      const result = await pool.query(
        `
        SELECT id, nome, cat, dpi, tam, versoes, lic, usos, hue, estoque,
               (imagem IS NOT NULL) AS has_image
        FROM dtf_designs
        WHERE id = $1
      `,
        [id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Design não encontrado' });
      return res.json(result.rows[0]);
    }
    const store = loadLocalStore();
    const d = store.dtf_designs.find((item) => item.id === id);
    if (!d) return res.status(404).json({ error: 'Design não encontrado' });
    const { imagem, mime_type, ...rest } = d;
    res.json({ ...rest, has_image: Boolean(imagem) });
  } catch (error) {
    console.error('Error fetching design:', error);
    res.status(500).json({ error: 'Falha ao buscar design' });
  }
});

app.post('/api/designs', async (req, res) => {
  try {
    const { nome, cat, dpi, tam, versoes, lic, usos, hue, estoque, imagem, mimeType } = req.body;
    if (!nome || !cat) {
      return res.status(400).json({ error: 'Nome e categoria são obrigatórios' });
    }
    const parsedDpi = Number(dpi || 300);
    const parsedVersoes = Number(versoes || 1);
    const parsedUsos = Number(usos || 0);
    const parsedEstoque = Number(estoque || 0);
    const cleanBase64 = imagem ? imagem.replace(/^data:[^;]+;base64,/, '') : null;

    if (usePostgres) {
      const imageBuffer = cleanBase64 ? Buffer.from(cleanBase64, 'base64') : null;
      const result = await pool.query(
        'INSERT INTO dtf_designs (nome, cat, dpi, tam, versoes, lic, usos, hue, estoque, imagem, mime_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, nome, cat, dpi, tam, versoes, lic, usos, hue, estoque, (imagem IS NOT NULL) AS has_image',
        [
          nome.trim(),
          cat.trim(),
          parsedDpi,
          tam || 'A4',
          parsedVersoes,
          lic || 'Padrão',
          parsedUsos,
          hue || '#10b981',
          parsedEstoque,
          imageBuffer,
          mimeType || null,
        ]
      );
      return res.status(201).json(result.rows[0]);
    }

    const store = loadLocalStore();
    const newDesign = {
      id: store.nextIds.dtf_designs++,
      nome: nome.trim(),
      cat: cat.trim(),
      dpi: parsedDpi,
      tam: tam || 'A4',
      versoes: parsedVersoes,
      lic: lic || 'Padrão',
      usos: parsedUsos,
      hue: hue || '#10b981',
      estoque: parsedEstoque,
      imagem: cleanBase64,
      mime_type: mimeType || 'image/png',
    };
    store.dtf_designs.push(newDesign);
    saveLocalStore(store);
    const { imagem: _img, mime_type: _mime, ...publicDesign } = newDesign;
    res.status(201).json({ ...publicDesign, has_image: Boolean(cleanBase64) });
  } catch (error) {
    console.error('Error creating design:', error);
    res.status(500).json({ error: 'Falha ao criar design' });
  }
});

app.put('/api/designs/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { nome, cat, dpi, tam, versoes, lic, usos, hue, estoque, imagem, mimeType } = req.body;
    const cleanBase64 = imagem ? imagem.replace(/^data:[^;]+;base64,/, '') : null;

    if (usePostgres) {
      if (cleanBase64) {
        const imageBuffer = Buffer.from(cleanBase64, 'base64');
        const result = await pool.query(
          'UPDATE dtf_designs SET nome = $1, cat = $2, dpi = $3, tam = $4, versoes = $5, lic = $6, usos = $7, hue = $8, estoque = $9, imagem = $10, mime_type = $11 WHERE id = $12 RETURNING id, nome, cat, dpi, tam, versoes, lic, usos, hue, estoque, (imagem IS NOT NULL) AS has_image',
          [nome, cat, Number(dpi), tam, Number(versoes), lic, Number(usos), hue, Number(estoque), imageBuffer, mimeType || 'image/png', id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Design não encontrado' });
        return res.json(result.rows[0]);
      } else {
        const result = await pool.query(
          'UPDATE dtf_designs SET nome = $1, cat = $2, dpi = $3, tam = $4, versoes = $5, lic = $6, usos = $7, hue = $8, estoque = $9 WHERE id = $10 RETURNING id, nome, cat, dpi, tam, versoes, lic, usos, hue, estoque, (imagem IS NOT NULL) AS has_image',
          [nome, cat, Number(dpi), tam, Number(versoes), lic, Number(usos), hue, Number(estoque), id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Design não encontrado' });
        return res.json(result.rows[0]);
      }
    }

    const store = loadLocalStore();
    const idx = store.dtf_designs.findIndex((d) => d.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Design não encontrado' });
    store.dtf_designs[idx] = {
      ...store.dtf_designs[idx],
      nome: nome ?? store.dtf_designs[idx].nome,
      cat: cat ?? store.dtf_designs[idx].cat,
      dpi: dpi !== undefined ? Number(dpi) : store.dtf_designs[idx].dpi,
      tam: tam ?? store.dtf_designs[idx].tam,
      versoes: versoes !== undefined ? Number(versoes) : store.dtf_designs[idx].versoes,
      lic: lic ?? store.dtf_designs[idx].lic,
      usos: usos !== undefined ? Number(usos) : store.dtf_designs[idx].usos,
      hue: hue ?? store.dtf_designs[idx].hue,
      estoque: estoque !== undefined ? Number(estoque) : store.dtf_designs[idx].estoque,
      ...(cleanBase64 ? { imagem: cleanBase64, mime_type: mimeType || 'image/png' } : {}),
    };
    saveLocalStore(store);
    const { imagem: _img, mime_type: _mime, ...rest } = store.dtf_designs[idx];
    res.json({ ...rest, has_image: Boolean(store.dtf_designs[idx].imagem) });
  } catch (error) {
    console.error('Error updating design:', error);
    res.status(500).json({ error: 'Falha ao atualizar design' });
  }
});

app.patch('/api/designs/:id/stock', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const estoque = Math.max(0, Number(req.body.estoque ?? 0));
    if (usePostgres) {
      const result = await pool.query(
        'UPDATE dtf_designs SET estoque = $1 WHERE id = $2 RETURNING id, nome, cat, dpi, tam, versoes, lic, usos, hue, estoque, (imagem IS NOT NULL) AS has_image',
        [estoque, id]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Design não encontrado' });
      return res.json(result.rows[0]);
    }
    const store = loadLocalStore();
    const idx = store.dtf_designs.findIndex((d) => d.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Design não encontrado' });
    store.dtf_designs[idx].estoque = estoque;
    saveLocalStore(store);
    const { imagem, mime_type, ...rest } = store.dtf_designs[idx];
    res.json({ ...rest, has_image: Boolean(imagem) });
  } catch (error) {
    console.error('Error updating DTF stock:', error);
    res.status(500).json({ error: 'Falha ao atualizar estoque do DTF' });
  }
});

app.delete('/api/designs/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (usePostgres) {
      const result = await pool.query('DELETE FROM dtf_designs WHERE id = $1 RETURNING id', [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Design não encontrado' });
      return res.json({ message: 'Design excluído com sucesso' });
    }
    const store = loadLocalStore();
    const idx = store.dtf_designs.findIndex((d) => d.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Design não encontrado' });
    store.dtf_designs.splice(idx, 1);
    saveLocalStore(store);
    res.json({ message: 'Design excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting design:', error);
    res.status(500).json({ error: 'Falha ao excluir design' });
  }
});

app.post('/api/designs/:id/upload', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { imagem, mimeType } = req.body;
    if (!imagem) return res.status(400).json({ error: 'Imagem obrigatória' });
    const cleanBase64 = imagem.replace(/^data:[^;]+;base64,/, '');

    if (usePostgres) {
      const buffer = Buffer.from(cleanBase64, 'base64');
      const result = await pool.query(
        'UPDATE dtf_designs SET imagem = $1, mime_type = $2 WHERE id = $3 RETURNING id, nome',
        [buffer, mimeType || 'image/png', id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Design não encontrado' });
      return res.json({ message: 'Imagem atualizada com sucesso', design: result.rows[0] });
    }

    const store = loadLocalStore();
    const idx = store.dtf_designs.findIndex((d) => d.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Design não encontrado' });
    store.dtf_designs[idx].imagem = cleanBase64;
    store.dtf_designs[idx].mime_type = mimeType || 'image/png';
    saveLocalStore(store);
    res.json({ message: 'Imagem atualizada com sucesso', design: { id, nome: store.dtf_designs[idx].nome } });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'Falha no upload de imagem' });
  }
});

app.get('/api/designs/:id/image', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (usePostgres) {
      const result = await pool.query('SELECT imagem, mime_type FROM dtf_designs WHERE id = $1', [id]);
      if (result.rows.length === 0 || !result.rows[0].imagem) {
        return res.status(404).json({ error: 'Imagem não encontrada' });
      }
      res.set('Cache-Control', 'no-store');
      res.set('Content-Type', result.rows[0].mime_type || 'image/png');
      return res.send(result.rows[0].imagem);
    }
    const store = loadLocalStore();
    const d = store.dtf_designs.find((item) => item.id === id);
    if (!d || !d.imagem) return res.status(404).json({ error: 'Imagem não encontrada' });
    res.set('Cache-Control', 'no-store');
    res.set('Content-Type', d.mime_type || 'image/png');
    res.send(Buffer.from(d.imagem, 'base64'));
  } catch (error) {
    console.error('Error fetching image:', error);
    res.status(500).json({ error: 'Falha ao carregar imagem' });
  }
});

// ─── ORDERS / KANBAN ──────────────────────────────────────────────────────────
app.get('/api/orders', async (req, res) => {
  try {
    if (usePostgres) {
      const result = await pool.query(`
        SELECT o.id, o.cliente, o.cpf_cnpj, o.telefone, o.email, o.endereco,
               o.cidade, o.uf, o.cep, o.quantidade AS qtd, o.valor_total, o.pagamento, o.status,
               o.product_id, o.dtf_id, o.created_at,
               TO_CHAR(o.prazo, 'DD/MM/YYYY') AS prazo,
               TO_CHAR(o.prazo, 'YYYY-MM-DD') AS prazo_iso,
               COALESCE(p.nome, 'Produto Removido') AS produto,
               COALESCE(d.nome, 'DTF Removido') AS dtf
        FROM orders o
        LEFT JOIN products p ON p.id = o.product_id
        LEFT JOIN dtf_designs d ON d.id = o.dtf_id
        ORDER BY o.created_at DESC
      `);
      return res.json(
        result.rows.map((r) => ({
          ...r,
          qtd: Number(r.qtd),
          valor_total: Number(r.valor_total || 0),
        }))
      );
    }
    const store = loadLocalStore();
    const enriched = [...store.orders]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((o) => {
        const prod = store.products.find((p) => p.id === Number(o.product_id));
        const dtf = store.dtf_designs.find((d) => d.id === Number(o.dtf_id));
        return {
          ...o,
          qtd: Number(o.quantidade ?? o.qtd ?? 1),
          valor_total: Number(o.valor_total || (prod ? prod.preco * (o.quantidade ?? o.qtd ?? 1) : 0)),
          produto: o.produto || prod?.nome || 'Produto',
          dtf: o.dtf || dtf?.nome || 'Design DTF',
        };
      });
    res.json(enriched);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Falha ao buscar pedidos' });
  }
});

app.post('/api/orders', async (req, res) => {
  const {
    cliente,
    cpfCnpj,
    telefone,
    email,
    endereco,
    cidade,
    uf,
    cep,
    productId,
    dtfId,
    quantidade,
    pagamento,
    prazo,
  } = req.body;
  const qty = Number(quantidade);
  if (!cliente || !productId || !dtfId || !Number.isInteger(qty) || qty < 1 || !pagamento || !prazo) {
    return res.status(400).json({ error: 'Preencha todos os dados obrigatórios do pedido' });
  }

  if (usePostgres) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const prodRes = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [productId]);
      if (!prodRes.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Produto não encontrado' });
      }
      if (Number(prodRes.rows[0].estoque) < qty) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Estoque de produto insuficiente' });
      }

      const dtfRes = await client.query('SELECT * FROM dtf_designs WHERE id = $1 FOR UPDATE', [dtfId]);
      if (!dtfRes.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Design DTF não encontrado' });
      }
      if (Number(dtfRes.rows[0].estoque) < qty) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Estoque de DTF insuficiente' });
      }

      const nextProdStock = Number(prodRes.rows[0].estoque) - qty;
      const nextProdStatus = computeProductStatus(
        nextProdStock,
        prodRes.rows[0].estoque_minimo ?? 10,
        prodRes.rows[0].status
      );
      await client.query('UPDATE products SET estoque = $1, status = $2 WHERE id = $3', [
        nextProdStock,
        nextProdStatus,
        productId,
      ]);
      await client.query(
        'INSERT INTO stock_movements (product_id, tipo, motivo, quantidade, saldo) VALUES ($1, $2, $3, $4, $5)',
        [productId, 'Saída', `Pedido - ${cliente}`, -qty, nextProdStock]
      );
      await client.query('UPDATE dtf_designs SET estoque = estoque - $1, usos = usos + $1 WHERE id = $2', [
        qty,
        dtfId,
      ]);

      const valorTotal = Number(prodRes.rows[0].preco) * qty;
      const result = await client.query(
        `
        INSERT INTO orders (cliente, cpf_cnpj, telefone, email, endereco, cidade, uf, cep, product_id, dtf_id, quantidade, valor_total, pagamento, status, prazo)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'aguardando', $14)
        RETURNING id, cliente, cpf_cnpj, telefone, email, endereco, cidade, uf, cep, product_id, dtf_id, quantidade AS qtd, valor_total, pagamento, status, created_at,
                  TO_CHAR(prazo, 'DD/MM/YYYY') AS prazo, TO_CHAR(prazo, 'YYYY-MM-DD') AS prazo_iso
      `,
        [cliente, cpfCnpj, telefone, email, endereco, cidade, uf, cep, productId, dtfId, qty, valorTotal, pagamento, prazo]
      );
      await client.query('COMMIT');
      const order = result.rows[0];
      return res.status(201).json({
        ...order,
        qtd: Number(order.qtd),
        valor_total: Number(order.valor_total),
        produto: prodRes.rows[0].nome,
        dtf: dtfRes.rows[0].nome,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating order:', error);
      return res.status(500).json({ error: 'Falha ao criar pedido' });
    } finally {
      client.release();
    }
  }

  try {
    const store = loadLocalStore();
    const prod = store.products.find((p) => p.id === Number(productId));
    if (!prod) return res.status(404).json({ error: 'Produto não encontrado' });
    if (Number(prod.estoque) < qty) return res.status(409).json({ error: 'Estoque de produto insuficiente' });

    const dtf = store.dtf_designs.find((d) => d.id === Number(dtfId));
    if (!dtf) return res.status(404).json({ error: 'Design DTF não encontrado' });
    if (Number(dtf.estoque) < qty) return res.status(409).json({ error: 'Estoque de DTF insuficiente' });

    prod.estoque = Number(prod.estoque) - qty;
    prod.status = computeProductStatus(prod.estoque, prod.estoque_minimo ?? 10, prod.status);
    dtf.estoque = Number(dtf.estoque) - qty;
    dtf.usos = Number(dtf.usos || 0) + qty;

    store.stock_movements.push({
      id: store.nextIds.stock_movements++,
      product_id: prod.id,
      tipo: 'Saída',
      motivo: `Pedido - ${cliente}`,
      quantidade: -qty,
      saldo: prod.estoque,
      created_at: new Date().toISOString(),
    });

    const formattedPrazo = prazo.includes('-')
      ? prazo.split('-').reverse().join('/')
      : prazo;

    const newOrder = {
      id: store.nextIds.orders++,
      cliente,
      cpf_cnpj: cpfCnpj || '',
      telefone: telefone || '',
      email: email || '',
      endereco: endereco || '',
      cidade: cidade || '',
      uf: uf || '',
      cep: cep || '',
      product_id: prod.id,
      dtf_id: dtf.id,
      quantidade: qty,
      qtd: qty,
      valor_total: Number(prod.preco) * qty,
      pagamento,
      status: 'aguardando',
      prazo: formattedPrazo,
      prazo_iso: prazo,
      produto: prod.nome,
      dtf: dtf.nome,
      created_at: new Date().toISOString(),
    };
    store.orders.push(newOrder);
    saveLocalStore(store);
    res.status(201).json(newOrder);
  } catch (error) {
    console.error('Error creating order in local store:', error);
    res.status(500).json({ error: 'Falha ao criar pedido' });
  }
});

app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = orderStatus(req.body.status);
    if (usePostgres) {
      const result = await pool.query('UPDATE orders SET status = $1 WHERE id = $2 RETURNING id, status', [
        status,
        id,
      ]);
      if (!result.rows.length) return res.status(404).json({ error: 'Pedido não encontrado' });
      return res.json(result.rows[0]);
    }
    const store = loadLocalStore();
    const order = store.orders.find((o) => Number(o.id) === id);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
    order.status = status;
    saveLocalStore(store);
    res.json({ id: order.id, status: order.status });
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ error: 'Falha ao atualizar status do pedido' });
  }
});

app.delete('/api/orders/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (usePostgres) {
      const result = await pool.query('DELETE FROM orders WHERE id = $1 RETURNING id', [id]);
      if (!result.rows.length) return res.status(404).json({ error: 'Pedido não encontrado' });
      return res.json({ message: 'Pedido excluído com sucesso' });
    }
    const store = loadLocalStore();
    const idx = store.orders.findIndex((o) => Number(o.id) === id);
    if (idx === -1) return res.status(404).json({ error: 'Pedido não encontrado' });
    store.orders.splice(idx, 1);
    saveLocalStore(store);
    res.json({ message: 'Pedido excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ error: 'Falha ao excluir pedido' });
  }
});

// ─── DASHBOARD MANUAL ENTRIES CRUD ────────────────────────────────────────────
app.get('/api/dashboard/entries', async (req, res) => {
  try {
    if (usePostgres) {
      const result = await pool.query(`
        SELECT id, TO_CHAR(data, 'YYYY-MM-DD') AS data, descricao,
               receita::float AS receita, pedidos, pagamento, status_pedido,
               product_id, produto_nome, quantidade_pecas, created_at
        FROM dashboard_entries
        ORDER BY data DESC, id DESC
      `);
      return res.json(result.rows);
    }
    const store = loadLocalStore();
    res.json(
      [...store.dashboard_entries].sort(
        (a, b) => new Date(b.data) - new Date(a.data) || b.id - a.id
      )
    );
  } catch (error) {
    console.error('Error fetching dashboard entries:', error);
    res.status(500).json({ error: 'Falha ao buscar lançamentos do dashboard' });
  }
});

app.post('/api/dashboard/entries', async (req, res) => {
  try {
    const {
      data,
      descricao,
      receita,
      pedidos,
      pagamento,
      status_pedido,
      product_id,
      produto_nome,
      quantidade_pecas,
    } = req.body;

    const entryDate = data || new Date().toISOString().slice(0, 10);
    const parsedReceita = Number(receita ?? 0);
    const parsedPedidos = Math.max(0, Number(pedidos ?? 1));
    const parsedPecas = Math.max(0, Number(quantidade_pecas ?? 1));
    const cleanPagamento = ['pix', 'cartao', 'boleto'].includes(pagamento) ? pagamento : 'pix';
    const cleanStatus = orderStatus(status_pedido || 'entregue');
    const cleanDesc = (descricao || 'Lançamento Manual').trim();

    if (usePostgres) {
      const result = await pool.query(
        `
        INSERT INTO dashboard_entries
          (data, descricao, receita, pedidos, pagamento, status_pedido, product_id, produto_nome, quantidade_pecas)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, TO_CHAR(data, 'YYYY-MM-DD') AS data, descricao,
                  receita::float AS receita, pedidos, pagamento, status_pedido,
                  product_id, produto_nome, quantidade_pecas, created_at
      `,
        [
          entryDate,
          cleanDesc,
          parsedReceita,
          parsedPedidos,
          cleanPagamento,
          cleanStatus,
          product_id ? Number(product_id) : null,
          produto_nome || null,
          parsedPecas,
        ]
      );
      return res.status(201).json(result.rows[0]);
    }

    const store = loadLocalStore();
    const newEntry = {
      id: store.nextIds.dashboard_entries++,
      data: entryDate,
      descricao: cleanDesc,
      receita: parsedReceita,
      pedidos: parsedPedidos,
      pagamento: cleanPagamento,
      status_pedido: cleanStatus,
      product_id: product_id ? Number(product_id) : null,
      produto_nome: produto_nome || null,
      quantidade_pecas: parsedPecas,
      created_at: new Date().toISOString(),
    };
    store.dashboard_entries.push(newEntry);
    saveLocalStore(store);
    res.status(201).json(newEntry);
  } catch (error) {
    console.error('Error creating dashboard entry:', error);
    res.status(500).json({ error: 'Falha ao salvar lançamento no dashboard' });
  }
});

app.put('/api/dashboard/entries/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      data,
      descricao,
      receita,
      pedidos,
      pagamento,
      status_pedido,
      product_id,
      produto_nome,
      quantidade_pecas,
    } = req.body;

    const entryDate = data || new Date().toISOString().slice(0, 10);
    const parsedReceita = Number(receita ?? 0);
    const parsedPedidos = Math.max(0, Number(pedidos ?? 1));
    const parsedPecas = Math.max(0, Number(quantidade_pecas ?? 1));
    const cleanPagamento = ['pix', 'cartao', 'boleto'].includes(pagamento) ? pagamento : 'pix';
    const cleanStatus = orderStatus(status_pedido || 'entregue');
    const cleanDesc = (descricao || 'Lançamento Manual').trim();

    if (usePostgres) {
      const result = await pool.query(
        `
        UPDATE dashboard_entries
        SET data = $1, descricao = $2, receita = $3, pedidos = $4,
            pagamento = $5, status_pedido = $6, product_id = $7,
            produto_nome = $8, quantidade_pecas = $9
        WHERE id = $10
        RETURNING id, TO_CHAR(data, 'YYYY-MM-DD') AS data, descricao,
                  receita::float AS receita, pedidos, pagamento, status_pedido,
                  product_id, produto_nome, quantidade_pecas, created_at
      `,
        [
          entryDate,
          cleanDesc,
          parsedReceita,
          parsedPedidos,
          cleanPagamento,
          cleanStatus,
          product_id ? Number(product_id) : null,
          produto_nome || null,
          parsedPecas,
          id,
        ]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Lançamento não encontrado' });
      return res.json(result.rows[0]);
    }

    const store = loadLocalStore();
    const idx = store.dashboard_entries.findIndex((e) => e.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Lançamento não encontrado' });
    store.dashboard_entries[idx] = {
      ...store.dashboard_entries[idx],
      data: entryDate,
      descricao: cleanDesc,
      receita: parsedReceita,
      pedidos: parsedPedidos,
      pagamento: cleanPagamento,
      status_pedido: cleanStatus,
      product_id: product_id ? Number(product_id) : null,
      produto_nome: produto_nome || null,
      quantidade_pecas: parsedPecas,
    };
    saveLocalStore(store);
    res.json(store.dashboard_entries[idx]);
  } catch (error) {
    console.error('Error updating dashboard entry:', error);
    res.status(500).json({ error: 'Falha ao atualizar lançamento' });
  }
});

app.delete('/api/dashboard/entries/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (usePostgres) {
      const result = await pool.query('DELETE FROM dashboard_entries WHERE id = $1 RETURNING id', [id]);
      if (!result.rows.length) return res.status(404).json({ error: 'Lançamento não encontrado' });
      return res.json({ message: 'Lançamento excluído com sucesso' });
    }
    const store = loadLocalStore();
    const idx = store.dashboard_entries.findIndex((e) => e.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Lançamento não encontrado' });
    store.dashboard_entries.splice(idx, 1);
    saveLocalStore(store);
    res.json({ message: 'Lançamento excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting dashboard entry:', error);
    res.status(500).json({ error: 'Falha ao excluir lançamento' });
  }
});

// ─── DASHBOARD SUMMARY ────────────────────────────────────────────────────────
app.get('/api/dashboard', async (req, res) => {
  try {
    if (usePostgres) {
      const [products, entries, orders] = await Promise.all([
        pool.query('SELECT * FROM products ORDER BY id DESC'),
        pool.query(`
          SELECT id, TO_CHAR(data, 'YYYY-MM-DD') AS data, descricao,
                 receita::float AS receita, pedidos, pagamento, status_pedido,
                 product_id, produto_nome, quantidade_pecas
          FROM dashboard_entries
          ORDER BY data DESC, id DESC
        `),
        pool.query('SELECT * FROM orders ORDER BY created_at DESC'),
      ]);
      return res.json({
        products: products.rows,
        entries: entries.rows,
        orders: orders.rows,
      });
    }
    const store = loadLocalStore();
    res.json({
      products: store.products,
      entries: store.dashboard_entries,
      orders: store.orders,
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({ error: 'Falha ao carregar dados do dashboard' });
  }
});

// ─── AUTOMATIONS & REPORTS ────────────────────────────────────────────────────
app.get('/api/settings/automations', async (req, res) => {
  try {
    if (usePostgres) {
      const result = await pool.query('SELECT backup_enabled, report_enabled FROM automation_settings WHERE id = 1');
      return res.json(result.rows[0] || { backup_enabled: false, report_enabled: false });
    }
    const store = loadLocalStore();
    res.json(store.automation_settings);
  } catch (error) {
    res.status(500).json({ error: 'Falha ao buscar configurações de automação' });
  }
});

app.patch('/api/settings/automations', async (req, res) => {
  try {
    const backupEnabled = typeof req.body.backupEnabled === 'boolean' ? req.body.backupEnabled : null;
    const reportEnabled = typeof req.body.reportEnabled === 'boolean' ? req.body.reportEnabled : null;
    if (usePostgres) {
      const result = await pool.query(
        `
        UPDATE automation_settings
        SET backup_enabled = COALESCE($1, backup_enabled),
            report_enabled = COALESCE($2, report_enabled),
            updated_at = NOW()
        WHERE id = 1
        RETURNING backup_enabled, report_enabled
      `,
        [backupEnabled, reportEnabled]
      );
      return res.json(result.rows[0]);
    }
    const store = loadLocalStore();
    if (backupEnabled !== null) store.automation_settings.backup_enabled = backupEnabled;
    if (reportEnabled !== null) store.automation_settings.report_enabled = reportEnabled;
    saveLocalStore(store);
    res.json(store.automation_settings);
  } catch (error) {
    console.error('Error updating automation settings:', error);
    res.status(500).json({ error: 'Falha ao atualizar automações' });
  }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  if (usePostgres) {
    try {
      await pool.query('SELECT NOW()');
      return res.json({ status: 'OK', database: 'postgresql' });
    } catch (error) {
      return res.json({ status: 'OK', database: 'local-json-fallback' });
    }
  }
  res.json({ status: 'OK', database: 'local-json-fallback' });
});

initDatabase().then(() => {
  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Backend rodando em http://localhost:${port}`);
  });
});
