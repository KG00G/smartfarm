const express = require('express');
const router = express.Router();
const db = require('../config/db');

router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM vegetables ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { name, name_en, min_moisture, max_moisture, min_temp, max_temp, water_interval_hours, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const [result] = await db.query(
      `INSERT INTO vegetables (name, name_en, min_moisture, max_moisture, min_temp, max_temp, water_interval_hours, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, name_en || null, min_moisture || 40, max_moisture || 70, min_temp || 20, max_temp || 35, water_interval_hours || 12, description || null]
    );
    const [newVeg] = await db.query('SELECT * FROM vegetables WHERE id = ?', [result.insertId]);
    res.status(201).json(newVeg[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const { name, name_en, min_moisture, max_moisture, min_temp, max_temp, description } = req.body;
  try {
    await db.query(
      'UPDATE vegetables SET name=?, name_en=?, min_moisture=?, max_moisture=?, min_temp=?, max_temp=?, description=? WHERE id=?',
      [name, name_en, min_moisture, max_moisture, min_temp, max_temp, description, req.params.id]
    );
    const [rows] = await db.query('SELECT * FROM vegetables WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM vegetables WHERE id = ?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
