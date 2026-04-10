const express = require('express');
const router = express.Router();
const db = require('../config/db');

router.get('/:device_id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM device_settings WHERE device_id = ?', [req.params.device_id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Settings not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:device_id', async (req, res) => {
  const {
    auto_water_enabled, moisture_threshold_low, moisture_threshold_high,
    watering_duration_seconds, schedule_enabled, schedule_time_1, schedule_time_2
  } = req.body;
  try {
    await db.query(`
      INSERT INTO device_settings (device_id, auto_water_enabled, moisture_threshold_low, moisture_threshold_high,
        watering_duration_seconds, schedule_enabled, schedule_time_1, schedule_time_2)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        auto_water_enabled=VALUES(auto_water_enabled),
        moisture_threshold_low=VALUES(moisture_threshold_low),
        moisture_threshold_high=VALUES(moisture_threshold_high),
        watering_duration_seconds=VALUES(watering_duration_seconds),
        schedule_enabled=VALUES(schedule_enabled),
        schedule_time_1=VALUES(schedule_time_1),
        schedule_time_2=VALUES(schedule_time_2),
        updated_at=NOW()
    `, [req.params.device_id, auto_water_enabled, moisture_threshold_low, moisture_threshold_high,
        watering_duration_seconds, schedule_enabled, schedule_time_1, schedule_time_2]);
    const [rows] = await db.query('SELECT * FROM device_settings WHERE device_id = ?', [req.params.device_id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
