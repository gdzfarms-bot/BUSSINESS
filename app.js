const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection - use your Neon connection string
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_myo1RITzSD5P@ep-aged-cloud-a4e1rpsc-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: {
    rejectUnauthorized: false
  }
});

// Initialize database tables
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        stock INTEGER DEFAULT 0,
        cost DECIMAL(10,2) DEFAULT 0,
        price DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        product_id INTEGER REFERENCES products(id),
        quantity INTEGER NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('Database tables initialized');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

// API Routes

// Health check
app.get('/', (req, res) => {
  res.json({ ok: true, message: 'GDfarms API is running' });
});

// Get all products for a user
app.get('/api/products', async (req, res) => {
  try {
    const { user_id } = req.query;
    const result = await pool.query(
      'SELECT * FROM products WHERE user_id = $1 ORDER BY created_at DESC',
      [user_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

// Create a new product
app.post('/api/products', async (req, res) => {
  try {
    const { user_id, name, stock, cost, price } = req.body;
    const result = await pool.query(
      'INSERT INTO products (user_id, name, stock, cost, price) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [user_id, name, parseInt(stock), parseFloat(cost), parseFloat(price)]
    );
    res.json({ ok: true, product: result.rows[0] });
  } catch (err) {
    console.error('Error creating product:', err);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

// Get all sales for a user
app.get('/api/sales', async (req, res) => {
  try {
    const { user_id } = req.query;
    const result = await pool.query(
      `SELECT s.*, p.name as product_name 
       FROM sales s 
       LEFT JOIN products p ON s.product_id = p.id 
       WHERE s.user_id = $1 
       ORDER BY s.created_at DESC`,
      [user_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching sales:', err);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

// Record a sale
app.post('/api/sales', async (req, res) => {
  try {
    const { user_id, product_id, quantity, price } = req.body;
    const result = await pool.query(
      'INSERT INTO sales (user_id, product_id, quantity, price) VALUES ($1, $2, $3, $4) RETURNING *',
      [user_id, parseInt(product_id), parseInt(quantity), parseFloat(price)]
    );
    res.json({ ok: true, sale: result.rows[0] });
  } catch (err) {
    console.error('Error recording sale:', err);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

// Sync endpoint - get all data for a user
app.get('/api/sync', async (req, res) => {
  try {
    const { user_id } = req.query;
    
    const productsResult = await pool.query(
      'SELECT * FROM products WHERE user_id = $1',
      [user_id]
    );
    
    const salesResult = await pool.query(
      `SELECT s.*, p.name as product_name 
       FROM sales s 
       LEFT JOIN products p ON s.product_id = p.id 
       WHERE s.user_id = $1`,
      [user_id]
    );
    
    res.json({
      ok: true,
      products: productsResult.rows,
      sales: salesResult.rows
    });
  } catch (err) {
    console.error('Error syncing data:', err);
    res.status(500).json({ ok: false, error: 'Sync failed' });
  }
});

// Start server
app.listen(port, async () => {
  console.log(`GDfarms API running on port ${port}`);
  await initDB();
});
