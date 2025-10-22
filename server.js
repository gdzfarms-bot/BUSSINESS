import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { pool } from './db.js';

dotenv.config();

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors());
app.use(helmet());
app.use(morgan('tiny'));

const PORT = process.env.PORT || 5000;

// --- Helper ---
async function run(query, params = []) {
  const client = await pool.connect();
  try {
    const res = await client.query(query, params);
    return res.rows;
  } finally {
    client.release();
  }
}

// --- ROUTES ---

// Health
app.get('/api/health', async (req, res) => {
  res.json({ ok: true, now: Date.now() });
});

// POST /api/auth  { userId }
app.post('/api/auth', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });
  res.json({ ok: true, userId });
});

// GET /api/sync?userId=...
app.get('/api/sync', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });
  try {
    const products = await run('SELECT * FROM products WHERE user_id=$1', [userId]);
    const sales = await run('SELECT * FROM sales WHERE user_id=$1', [userId]);
    res.json({ ok: true, products, sales });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'db error' });
  }
});

// POST /api/products
app.post('/api/products', async (req, res) => {
  const { userId, product } = req.body;
  if (!userId || !product || !product.id)
    return res.status(400).json({ ok: false, error: 'userId and product.id required' });
  try {
    await run(
      `INSERT INTO products (id, user_id, name, stock, cost, price, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (id) DO UPDATE SET
         name=EXCLUDED.name,
         stock=EXCLUDED.stock,
         cost=EXCLUDED.cost,
         price=EXCLUDED.price,
         updated_at=NOW()`,
      [product.id, userId, product.name, product.stock, product.cost, product.price]
    );
    const [saved] = await run('SELECT * FROM products WHERE id=$1', [product.id]);
    res.json({ ok: true, product: saved });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'db error' });
  }
});

// POST /api/sales
app.post('/api/sales', async (req, res) => {
  const { userId, sale } = req.body;
  if (!userId || !sale || !sale.id)
    return res.status(400).json({ ok: false, error: 'userId and sale.id required' });
  try {
    await run(
      `INSERT INTO sales (id, user_id, product_id, qty, price, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (id) DO UPDATE SET
         qty=EXCLUDED.qty,
         price=EXCLUDED.price,
         product_id=EXCLUDED.product_id,
         created_at=EXCLUDED.created_at,
         updated_at=NOW()`,
      [sale.id, userId, sale.productId, sale.qty, sale.price, sale.createdAt]
    );
    const [saved] = await run('SELECT * FROM sales WHERE id=$1', [sale.id]);
    res.json({ ok: true, sale: saved });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'db error' });
  }
});

// 404 fallback
app.use((req, res) => res.status(404).json({ ok: false, error: 'not found' }));

app.listen(PORT, () => console.log(`✅ GDfarms backend running on port ${PORT}`));

