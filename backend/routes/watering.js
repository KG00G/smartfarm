const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET watering logs
router.get('/', async (req, res) => {
  const { device_id, plot_id, days = 7, limit = 50 } = req.query;
  try {
    let where = 'WHERE wl.started_at >= NOW() - INTERVAL ? DAY';
    const params = [parseInt(days)];
    if (device_id) { where += ' AND wl.device_id = ?'; params.push(device_id); }
    if (plot_id) { where += ' AND wl.plot_id = ?'; params.push(plot_id); }

    const [rows] = await db.query(`
      SELECT wl.*, d.device_name, p.plot_name
      FROM watering_logs wl
      JOIN devices d ON wl.device_id = d.id
      LEFT JOIN plots p ON wl.plot_id = p.id
      ${where}
      ORDER BY wl.started_at DESC
      LIMIT ?
    `, [...params, parseInt(limit)]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET daily summary
router.get('/daily-summary', async (req, res) => {
  const { device_id, days = 7 } = req.query;
  if (!device_id) return res.status(400).json({ error: 'device_id is required' });
  try {
    const [rows] = await db.query(`
      SELECT 
        DATE(started_at) as date,
        COUNT(*) as watering_count,
        SUM(duration_seconds) as total_duration_seconds,
        ROUND(SUM(water_volume_liters), 3) as total_water_liters,
        AVG(trigger_moisture) as avg_trigger_moisture
      FROM watering_logs
      WHERE device_id = ? AND started_at >= NOW() - INTERVAL ? DAY
      GROUP BY DATE(started_at)
      ORDER BY date DESC
    `, [device_id, parseInt(days)]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST manual trigger watering
router.post('/manual', async (req, res) => {
  const { device_id, plot_id, duration_seconds = 30, notes } = req.body;
  if (!device_id) return res.status(400).json({ error: 'device_id is required' });
  try {
    const [result] = await db.query(
      `INSERT INTO watering_logs (device_id, plot_id, trigger_type, started_at, stopped_at, duration_seconds, water_volume_liters, notes)
       VALUES (?, ?, 'manual', NOW(), NOW() + INTERVAL ? SECOND, ?, ROUND(?*0.05, 3), ?)`,
      [device_id, plot_id || null, duration_seconds, duration_seconds, duration_seconds, notes || null]
    );
    res.status(201).json({ message: 'Manual watering logged', id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
