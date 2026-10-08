const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/produits
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT p.*, c.nom AS categorie
       FROM produits p LEFT JOIN categories c ON c.id = p.categorie_id
       ORDER BY p.id DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/produits/:id
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM produits WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Produit introuvable' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/produits
router.post('/', async (req, res, next) => {
  try {
    const { nom, description, prix, quantite, categorie_id } = req.body;
    if (!nom) return res.status(400).json({ message: 'Le nom est obligatoire' });
    const [result] = await db.query(
      'INSERT INTO produits (nom, description, prix, quantite, categorie_id) VALUES (?, ?, ?, ?, ?)',
      [nom, description || null, prix || 0, quantite || 0, categorie_id || null]
    );
    res.status(201).json({ id: result.insertId, ...req.body });
  } catch (err) { next(err); }
});

// PUT /api/produits/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { nom, description, prix, quantite, categorie_id } = req.body;
    const [result] = await db.query(
      'UPDATE produits SET nom = ?, description = ?, prix = ?, quantite = ?, categorie_id = ? WHERE id = ?',
      [nom, description || null, prix || 0, quantite || 0, categorie_id || null, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Produit introuvable' });
    res.json({ id: Number(req.params.id), ...req.body });
  } catch (err) { next(err); }
});

// DELETE /api/produits/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const [result] = await db.query('DELETE FROM produits WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Produit introuvable' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
