const express = require('express');
const cors = require('cors');
require('dotenv').config();

const db = require('./db');
const produitsRoutes = require('./routes/produits');
const categoriesRoutes = require('./routes/categories');

const app = express();
app.use(cors({ origin: 'http://localhost:4200' }));
app.use(express.json());

app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', database: 'connectée' });
  } catch (err) {
    res.status(500).json({ status: 'erreur', database: err.message });
  }
});

app.use('/api/produits', produitsRoutes);
app.use('/api/categories', categoriesRoutes);

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Erreur serveur', detail: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API Magasin Kablem : http://localhost:${PORT}/api`));
