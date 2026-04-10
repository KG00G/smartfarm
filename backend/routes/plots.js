const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET all plots
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.*, d.device_name, d.status as device_status,
        (SELECT COUNT(*) FROM plot_vegetables pv WHERE pv.plot_id = p.id) as vegetable_count
      FROM plots p
      LEFT JOIN devices d ON p.device_id = d.id
      ORDER BY p.created_at ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single plot with vegetables
router.get('/:id', async (req, res) => {
  try {
    const [plot] = await db.query(`
      SELECT p.*, d.device_name, d.status as device_status, d.mode as device_mode
      FROM plots p LEFT JOIN devices d ON p.device_id = d.id
      WHERE p.id = ?
    `, [req.params.id]);
    if (plot.length === 0) return res.status(404).json({ error: 'Plot not found' });

    const [vegs] = await db.query(`
      SELECT v.*, pv.planted_date, pv.notes, pv.id as pv_id
      FROM plot_vegetables pv
      JOIN vegetables v ON pv.vegetable_id = v.id
      WHERE pv.plot_id = ?
    `, [req.params.id]);

    res.json({ ...plot[0], vegetables: vegs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create new plot
router.post('/', async (req, res) => {
  const { plot_name, description, device_id } = req.body;
  if (!plot_name) return res.status(400).json({ error: 'plot_name is required' });
  try {
    const [result] = await db.query(
      'INSERT INTO plots (plot_name, description, device_id) VALUES (?, ?, ?)',
      [plot_name, description || null, device_id || null]
    );
    const [newPlot] = await db.query('SELECT * FROM plots WHERE id = ?', [result.insertId]);
    res.status(201).json(newPlot[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update plot
router.put('/:id', async (req, res) => {
  const { plot_name, description, device_id } = req.body;
  try {
    await db.query(
      'UPDATE plots SET plot_name=?, description=?, device_id=? WHERE id=?',
      [plot_name, description, device_id || null, req.params.id]
    );
    const [rows] = await db.query('SELECT * FROM plots WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE plot
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM plots WHERE id = ?', [req.params.id]);
    res.json({ message: 'Plot deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add vegetable to plot
router.post('/:id/vegetables', async (req, res) => {
  const { vegetable_id, planted_date, notes } = req.body;
  try {
    await db.query(
      'INSERT INTO plot_vegetables (plot_id, vegetable_id, planted_date, notes) VALUES (?, ?, ?, ?)',
      [req.params.id, vegetable_id, planted_date || null, notes || null]
    );
    res.status(201).json({ message: 'Vegetable added to plot' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE remove vegetable from plot
router.delete('/:id/vegetables/:pvId', async (req, res) => {
  try {
    await db.query('DELETE FROM plot_vegetables WHERE id = ? AND plot_id = ?', [req.params.pvId, req.params.id]);
    res.json({ message: 'Vegetable removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
