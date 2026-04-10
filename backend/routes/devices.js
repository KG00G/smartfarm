const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET all devices
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT d.*, ds.auto_water_enabled, ds.moisture_threshold_low, ds.moisture_threshold_high
      FROM devices d
      LEFT JOIN device_settings ds ON d.id = ds.device_id
      ORDER BY d.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single device
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM devices WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Device not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add new device
router.post('/', async (req, res) => {
  const { device_name, device_code, status, mode, location, ip_address } = req.body;
  if (!device_name || !device_code) {
    return res.status(400).json({ error: 'device_name and device_code are required' });
  }
  try {
    const [result] = await db.query(
      'INSERT INTO devices (device_name, device_code, status, mode, location, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [device_name, device_code, status || 'offline', mode || 'auto', location || null, ip_address || null]
    );
    // Create default settings
    await db.query('INSERT INTO device_settings (device_id) VALUES (?)', [result.insertId]);
    const [newDevice] = await db.query('SELECT * FROM devices WHERE id = ?', [result.insertId]);
    res.status(201).json(newDevice[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'device_code already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT update device
router.put('/:id', async (req, res) => {
  const { device_name, status, mode, location } = req.body;
  try {
    await db.query(
      'UPDATE devices SET device_name=?, status=?, mode=?, location=?, updated_at=NOW() WHERE id=?',
      [device_name, status, mode, location, req.params.id]
    );
    const [rows] = await db.query('SELECT * FROM devices WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE device
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM devices WHERE id = ?', [req.params.id]);
    res.json({ message: 'Device deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
