const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

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

// Test database connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Database connection error:', err);
});

// Initialize database tables
async function initDB() {
  try {
    // Create products table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        stock INTEGER DEFAULT 0,
        cost DECIMAL(10,2) DEFAULT 0,
        price DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create sales table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        product_id INTEGER,
        quantity INTEGER NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
      )
    `);

    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sales_user_id ON sales(user_id)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at)
    `);

    console.log('Database tables initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    ok: true, 
    message: 'GDfarms API is running!',
    endpoints: {
      products: 'GET/POST /api/products',
      sales: 'GET/POST /api/sales',
      sync: 'GET /api/sync'
    }
  });
});

// Get database status
app.get('/api/status', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as time, version() as version');
    res.json({
      ok: true,
      database: {
        connected: true,
        time: result.rows[0].time,
        version: result.rows[0].version
      },
      server: {
        time: new Date().toISOString(),
        uptime: process.uptime()
      }
    });
  } catch (err) {
    console.error('Status check error:', err);
    res.status(500).json({ ok: false, error: 'Database connection failed' });
  }
});

// Get all products for a user
app.get('/api/products', async (req, res) => {
  try {
    const { user_id } = req.query;
    
    if (!user_id) {
      return res.status(400).json({ ok: false, error: 'user_id is required' });
    }

    const result = await pool.query(
      'SELECT * FROM products WHERE user_id = $1 ORDER BY created_at DESC',
      [user_id]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch products' });
  }
});

// Create a new product
app.post('/api/products', async (req, res) => {
  try {
    const { user_id, name, stock, cost, price } = req.body;
    
    if (!user_id || !name) {
      return res.status(400).json({ 
        ok: false, 
        error: 'user_id and name are required' 
      });
    }

    const result = await pool.query(
      `INSERT INTO products (user_id, name, stock, cost, price) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [
        user_id, 
        name, 
        parseInt(stock) || 0, 
        parseFloat(cost) || 0, 
        parseFloat(price) || 0
      ]
    );
    
    res.json({ ok: true, product: result.rows[0] });
  } catch (err) {
    console.error('Error creating product:', err);
    res.status(500).json({ ok: false, error: 'Failed to create product' });
  }
});

// Update a product
app.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, stock, cost, price, user_id } = req.body;
    
    if (!user_id) {
      return res.status(400).json({ ok: false, error: 'user_id is required' });
    }

    const result = await pool.query(
      `UPDATE products 
       SET name = $1, stock = $2, cost = $3, price = $4, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $5 AND user_id = $6 
       RETURNING *`,
      [name, stock, cost, price, id, user_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Product not found' });
    }
    
    res.json({ ok: true, product: result.rows[0] });
  } catch (err) {
    console.error('Error updating product:', err);
    res.status(500).json({ ok: false, error: 'Failed to update product' });
  }
});

// Delete a product
app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.query;
    
    if (!user_id) {
      return res.status(400).json({ ok: false, error: 'user_id is required' });
    }

    const result = await pool.query(
      'DELETE FROM products WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, user_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Product not found' });
    }
    
    res.json({ ok: true, message: 'Product deleted successfully' });
  } catch (err) {
    console.error('Error deleting product:', err);
    res.status(500).json({ ok: false, error: 'Failed to delete product' });
  }
});

// Get all sales for a user
app.get('/api/sales', async (req, res) => {
  try {
    const { user_id } = req.query;
    
    if (!user_id) {
      return res.status(400).json({ ok: false, error: 'user_id is required' });
    }

    const result = await pool.query(
      `SELECT s.*, p.name as product_name, p.cost as product_cost
       FROM sales s 
       LEFT JOIN products p ON s.product_id = p.id 
       WHERE s.user_id = $1 
       ORDER BY s.created_at DESC`,
      [user_id]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching sales:', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch sales' });
  }
});

// Record a sale
app.post('/api/sales', async (req, res) => {
  try {
    const { user_id, product_id, quantity, price } = req.body;
    
    if (!user_id || !product_id || !quantity || !price) {
      return res.status(400).json({ 
        ok: false, 
        error: 'user_id, product_id, quantity, and price are required' 
      });
    }

    // Start a transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Record the sale
      const saleResult = await client.query(
        `INSERT INTO sales (user_id, product_id, quantity, price) 
         VALUES ($1, $2, $3, $4) 
         RETURNING *`,
        [user_id, product_id, parseInt(quantity), parseFloat(price)]
      );
      
      // Update product stock (optional - you might want to handle this differently)
      await client.query(
        'UPDATE products SET stock = stock - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [quantity, product_id]
      );
      
      await client.query('COMMIT');
      
      res.json({ ok: true, sale: saleResult.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error recording sale:', err);
    res.status(500).json({ ok: false, error: 'Failed to record sale' });
  }
});

// Sync endpoint - get all data for a user
app.get('/api/sync', async (req, res) => {
  try {
    const { user_id } = req.query;
    
    if (!user_id) {
      return res.status(400).json({ ok: false, error: 'user_id is required' });
    }

    const [productsResult, salesResult] = await Promise.all([
      pool.query('SELECT * FROM products WHERE user_id = $1 ORDER BY created_at DESC', [user_id]),
      pool.query(
        `SELECT s.*, p.name as product_name 
         FROM sales s 
         LEFT JOIN products p ON s.product_id = p.id 
         WHERE s.user_id = $1 
         ORDER BY s.created_at DESC`,
        [user_id]
      )
    ]);
    
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

// Get sales analytics for a user
app.get('/api/analytics', async (req, res) => {
  try {
    const { user_id, days = 30 } = req.query;
    
    if (!user_id) {
      return res.status(400).json({ ok: false, error: 'user_id is required' });
    }

    const analyticsResult = await pool.query(
      `SELECT 
        COUNT(*) as total_sales,
        SUM(quantity) as total_quantity,
        SUM(quantity * price) as total_revenue,
        AVG(quantity * price) as average_sale_value,
        MIN(created_at) as first_sale_date,
        MAX(created_at) as last_sale_date
       FROM sales 
       WHERE user_id = $1 
         AND created_at >= NOW() - INTERVAL '${days} days'`,
      [user_id]
    );
    
    const topProductsResult = await pool.query(
      `SELECT 
        p.name as product_name,
        SUM(s.quantity) as total_quantity,
        SUM(s.quantity * s.price) as total_revenue,
        COUNT(s.id) as sale_count
       FROM sales s
       LEFT JOIN products p ON s.product_id = p.id
       WHERE s.user_id = $1 
         AND s.created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY p.name
       ORDER BY total_revenue DESC
       LIMIT 10`,
      [user_id]
    );
    
    res.json({
      ok: true,
      summary: analyticsResult.rows[0],
      top_products: topProductsResult.rows
    });
  } catch (err) {
    console.error('Error fetching analytics:', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch analytics' });
  }
});

// Simple user authentication (for demo purposes)
app.post('/api/auth', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ ok: false, error: 'userId is required' });
    }
    
    // For demo purposes, we just validate the user ID format
    // In a real app, you'd check against a users table
    if (userId.length < 1) {
      return res.status(400).json({ ok: false, error: 'Invalid user ID' });
    }
    
    res.json({ 
      ok: true, 
      message: 'Authentication successful',
      user: { id: userId }
    });
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ ok: false, error: 'Authentication failed' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ ok: false, error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ ok: false, error: 'Endpoint not found' });
});

// Start server
app.listen(port, async () => {
  console.log(`🚀 GDfarms API server running on port ${port}`);
  console.log(`📊 Database: ${process.env.DATABASE_URL ? 'Connected via DATABASE_URL' : 'Using default Neon connection'}`);
  
  // Initialize database
  await initDB();
  
  console.log(`✅ Server is ready!`);
  console.log(`📍 Health check: http://localhost:${port}/`);
  console.log(`📍 API Status: http://localhost:${port}/api/status`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});
