const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET latest sensor reading per device
router.get('/latest', async (req, res) => {
  const { device_id } = req.query;
  try {
    let query = `
      SELECT sr.*, d.device_name, d.status as device_status
      FROM sensor_readings sr
      JOIN devices d ON sr.device_id = d.id
      WHERE sr.id = (
        SELECT MAX(sr2.id) FROM sensor_readings sr2 WHERE sr2.device_id = sr.device_id
      )
    `;
    const params = [];
    if (device_id) {
      query = `
        SELECT sr.*, d.device_name
        FROM sensor_readings sr
        JOIN devices d ON sr.device_id = d.id
        WHERE sr.device_id = ?
        ORDER BY sr.recorded_at DESC LIMIT 1
      `;
      params.push(device_id);
    }
    const [rows] = await db.query(query, params);
    if (device_id) {
      res.json(rows[0] || null);
    } else {
      res.json(rows);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET sensor history (last N hours or date range)
router.get('/history', async (req, res) => {
  const { device_id, hours = 24, limit = 100 } = req.query;
  if (!device_id) return res.status(400).json({ error: 'device_id is required' });
  try {
    const [rows] = await db.query(`
      SELECT * FROM sensor_readings
      WHERE device_id = ?
        AND recorded_at >= NOW() - INTERVAL ? HOUR
      ORDER BY recorded_at ASC
      LIMIT ?
    `, [device_id, parseInt(hours), parseInt(limit)]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST receive sensor data (called by IoT device / ESP32)
router.post('/', async (req, res) => {
  const { device_id, plot_id, moisture, temperature, light_intensity, humidity, ph_level } = req.body;
  if (!device_id) return res.status(400).json({ error: 'device_id is required' });
  try {
    const [result] = await db.query(
      `INSERT INTO sensor_readings (device_id, plot_id, moisture, temperature, light_intensity, humidity, ph_level)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [device_id, plot_id || null, moisture, temperature, light_intensity, humidity || null, ph_level || null]
    );
    // Update device status to online + timestamp
    await db.query('UPDATE devices SET status="online", updated_at=NOW() WHERE id=?', [device_id]);

    // Auto-watering logic: check thresholds
    const [settings] = await db.query('SELECT * FROM device_settings WHERE device_id=?', [device_id]);
    if (settings.length > 0 && settings[0].auto_water_enabled && moisture !== undefined) {
      if (parseFloat(moisture) < parseFloat(settings[0].moisture_threshold_low)) {
        // Log auto watering event
        await db.query(
          `INSERT INTO watering_logs (device_id, plot_id, trigger_type, started_at, stopped_at, 
            duration_seconds, water_volume_liters, trigger_moisture)
           VALUES (?, ?, 'auto', NOW(), NOW() + INTERVAL ? SECOND, ?, ROUND(?*0.05, 3), ?)`,
          [device_id, plot_id || null, settings[0].watering_duration_seconds,
           settings[0].watering_duration_seconds, settings[0].watering_duration_seconds, moisture]
        );
        return res.status(201).json({ message: 'Reading saved', action: 'WATER_NOW', duration: settings[0].watering_duration_seconds });
      }
    }
    res.status(201).json({ message: 'Reading saved', id: result.insertId, action: 'NONE' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
