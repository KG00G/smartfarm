const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 🔑 คีย์ลับสำหรับสร้างบัตรคิว (Token)
const JWT_SECRET = 'SmartFarm_Super_Secret_Key_2026';

const dbConfig = {
    host: process.env.DB_HOST || 'mysql',
    user: process.env.DB_USER || 'greenspace_user',
    password: process.env.DB_PASSWORD || 'greenspace_pass',
    database: process.env.DB_NAME || 'greenspace_db',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

(async () => {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Connected to MySQL Database successfully!');
        connection.release();
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
    }
})();

// ==========================================
// 🛡️ Middleware: ด่านตรวจ Token
// ==========================================
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ' });
        req.user = user; 
        next(); 
    });
};

// ==========================================
// 🚀 AUTH (ระบบบัญชีผู้ใช้) + เลือกระดับผู้ใช้งาน
// ==========================================
app.post('/api/register', async (req, res) => {
    const { username, password, email, first_name, last_name, phone, location, role } = req.body;
    
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const [userResult] = await connection.execute(
            'INSERT INTO user (username, password, email, first_name, last_name, phone, location) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [username, hashedPassword, email || null, first_name || username, last_name || null, phone || null, location || null]
        );
        const newUserId = userResult.insertId;

        if (!role || role === 'owner') {
            const farmName = `ฟาร์มของ ${first_name || username}`;
            const [farmResult] = await connection.execute('INSERT INTO farm (farm_name) VALUES (?)', [farmName]);
            const newFarmId = farmResult.insertId;

            await connection.execute(
                'INSERT INTO farm_member (farm_id, user_id, role) VALUES (?, ?, ?)',
                [newFarmId, newUserId, 'owner']
            );
        }

        await connection.commit();
        res.status(201).json({ message: 'สมัครสมาชิกสำเร็จ!' });
    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'ชื่อผู้ใช้ หรือ อีเมลนี้ มีคนใช้แล้ว' });
        res.status(500).json({ error: 'สมัครสมาชิกไม่สำเร็จ', detail: error.message });
    } finally {
        connection.release();
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [users] = await pool.execute('SELECT * FROM user WHERE username = ?', [username]);
        if (users.length === 0) return res.status(400).json({ error: 'ไม่พบชื่อผู้ใช้นี้' });

        const userData = users[0];
        const validPassword = await bcrypt.compare(password, userData.password);
        if (!validPassword) return res.status(400).json({ error: 'รหัสผ่านไม่ถูกต้อง' });

        const token = jwt.sign({ user_id: userData.user_id, username: userData.username }, JWT_SECRET, { expiresIn: '24h' });

        res.json({ message: 'เข้าสู่ระบบสำเร็จ', token: token, user: { user_id: userData.user_id, username: userData.username, first_name: userData.first_name } });
    } catch (error) {
        res.status(500).json({ error: 'ระบบขัดข้อง', detail: error.message });
    }
});

app.post('/api/forgot-password', async (req, res) => {
    const { username, email, new_password } = req.body;
    try {
        if (!username || !email || !new_password) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });

        const [users] = await pool.execute('SELECT user_id FROM user WHERE username = ? AND email = ?', [username, email]);
        if (users.length === 0) return res.status(404).json({ error: 'ไม่พบชื่อผู้ใช้หรืออีเมลนี้ในระบบ' });

        const hashedPassword = await bcrypt.hash(new_password, 10);
        await pool.execute('UPDATE user SET password = ? WHERE user_id = ?', [hashedPassword, users[0].user_id]);

        res.json({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ สามารถเข้าสู่ระบบด้วยรหัสใหม่ได้เลย' });
    } catch (error) {
        res.status(500).json({ error: 'ระบบขัดข้อง', detail: error.message });
    }
});

app.get('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT username, email, first_name, last_name, phone, location FROM user WHERE user_id = ?', [req.user.user_id]);
        res.json(rows[0]);
    } catch (error) { res.status(500).json({ error: 'Failed', detail: error.message }); }
});

app.put('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const { email, first_name, last_name, phone, location } = req.body;
        await pool.execute(
            'UPDATE user SET email=?, first_name=?, last_name=?, phone=?, location=? WHERE user_id=?',
            [email, first_name, last_name, phone, location, req.user.user_id]
        );
        res.json({ success: true, message: 'อัปเดตข้อมูลส่วนตัวสำเร็จ' });
    } catch (error) { res.status(500).json({ error: 'Failed', detail: error.message }); }
});

// ==========================================
// 👥 MEMBERS (ระบบจัดการลูกน้อง / 1 Farm หลาย ID)
// ==========================================
app.get('/api/farm/members', authenticateToken, async (req, res) => {
    try {
        const [myFarms] = await pool.execute('SELECT farm_id FROM farm_member WHERE user_id = ? LIMIT 1', [req.user.user_id]);
        if (myFarms.length === 0) return res.json([]);

        const [members] = await pool.execute(`
            SELECT u.user_id, u.username, u.first_name, u.last_name, u.email, fm.role 
            FROM farm_member fm
            JOIN user u ON fm.user_id = u.user_id
            WHERE fm.farm_id = ? ORDER BY fm.role ASC
        `, [myFarms[0].farm_id]);
        res.json(members);
    } catch (error) { res.status(500).json({ error: 'Failed to fetch members', detail: error.message }); }
});

app.post('/api/farm/members', authenticateToken, async (req, res) => {
    try {
        const { target_username } = req.body;
        const [myFarms] = await pool.execute('SELECT farm_id, role FROM farm_member WHERE user_id = ? LIMIT 1', [req.user.user_id]);
        if (myFarms.length === 0 || myFarms[0].role !== 'owner') return res.status(403).json({ error: 'เฉพาะเจ้าของฟาร์มเท่านั้นที่เพิ่มสมาชิกได้' });

        const [targetUsers] = await pool.execute('SELECT user_id FROM user WHERE username = ?', [target_username]);
        if (targetUsers.length === 0) return res.status(404).json({ error: 'ไม่พบชื่อผู้ใช้นี้ในระบบ' });

        const [check] = await pool.execute('SELECT * FROM farm_member WHERE farm_id=? AND user_id=?', [myFarms[0].farm_id, targetUsers[0].user_id]);
        if (check.length > 0) return res.status(400).json({ error: 'ผู้ใช้นี้เป็นสมาชิกในฟาร์มอยู่แล้ว' });

        // ✅ แก้ไขตรงนี้ เปลี่ยนจาก 'staff' เป็น 'member' ให้ตรงกับ Database
        await pool.execute('INSERT INTO farm_member (farm_id, user_id, role) VALUES (?, ?, ?)', [myFarms[0].farm_id, targetUsers[0].user_id, 'member']);
        res.json({ success: true, message: 'เพิ่มสมาชิกสำเร็จ!' });
    } catch (error) { res.status(500).json({ error: 'Failed to add member', detail: error.message }); }
});

app.delete('/api/farm/members/:target_id', authenticateToken, async (req, res) => {
    try {
        if (req.params.target_id == req.user.user_id) return res.status(400).json({ error: 'คุณลบตัวเองไม่ได้' });
        const [myFarms] = await pool.execute('SELECT farm_id, role FROM farm_member WHERE user_id = ? LIMIT 1', [req.user.user_id]);
        if (myFarms.length === 0 || myFarms[0].role !== 'owner') return res.status(403).json({ error: 'เฉพาะเจ้าของฟาร์มเท่านั้น' });

        await pool.execute('DELETE FROM farm_member WHERE farm_id = ? AND user_id = ?', [myFarms[0].farm_id, req.params.target_id]);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Failed', detail: error.message }); }
});

// ==========================================
// 🧠 DEVICES & PLOTS (จัดการอุปกรณ์และแปลงปลูก)
// ==========================================
app.get('/api/devices', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT d.*, GROUP_CONCAT(v.veg_name SEPARATOR ', ') AS veg_name 
            FROM devices d
            LEFT JOIN device_vegetables dv ON d.device_id = dv.device_id
            LEFT JOIN vegetable v ON dv.veg_id = v.veg_id
            JOIN farm_member fm ON d.farm_id = fm.farm_id
            WHERE fm.user_id = ?
            GROUP BY d.device_id
            ORDER BY d.updated_at DESC
        `, [req.user.user_id]);
        res.json(rows);
    } catch (error) { res.status(500).json({ error: 'Failed', detail: error.message }); }
});

app.get('/api/devices/:id', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT d.*, GROUP_CONCAT(v.veg_name SEPARATOR ', ') AS veg_name 
            FROM devices d 
            LEFT JOIN device_vegetables dv ON d.device_id = dv.device_id
            LEFT JOIN vegetable v ON dv.veg_id = v.veg_id
            JOIN farm_member fm ON d.farm_id = fm.farm_id 
            WHERE d.device_id = ? AND fm.user_id = ?
            GROUP BY d.device_id
        `, [req.params.id, req.user.user_id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Device not found' });
        res.json(rows[0]);
    } catch (error) { res.status(500).json({ error: 'Failed', detail: error.message }); }
});

app.post('/api/devices', authenticateToken, async (req, res) => {
    try {
        const { device_id, location } = req.body;
        if (!device_id) return res.status(400).json({ error: 'MAC Address is required' });
        
        const [farms] = await pool.execute('SELECT farm_id FROM farm_member WHERE user_id = ? LIMIT 1', [req.user.user_id]);
        if (farms.length === 0) return res.status(400).json({ error: 'คุณไม่มีฟาร์ม กรุณาให้เจ้าของฟาร์มเชิญคุณเข้าฟาร์มก่อนเพิ่มอุปกรณ์' });

        await pool.execute(
            `INSERT INTO devices (device_id, farm_id, location, mode, watering_duration) VALUES (?, ?, ?, 'auto', 120)`,
            [device_id, farms[0].farm_id, location || 'แปลงใหม่']
        );
        res.status(201).json({ success: true, id: device_id });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'อุปกรณ์นี้มีในระบบแล้ว' });
        res.status(500).json({ error: 'Failed', detail: error.message });
    }
});

app.put('/api/devices/:id', authenticateToken, async (req, res) => {
    try {
        const { location, mode, connection_status, min_moisture_threshold, watering_duration } = req.body;
        await pool.execute(
            `UPDATE devices SET 
             location=COALESCE(?, location), 
             mode=COALESCE(?, mode), 
             connection_status=COALESCE(?, connection_status), 
             min_moisture_threshold=COALESCE(?, min_moisture_threshold), 
             watering_duration=COALESCE(?, watering_duration)
             WHERE device_id=?`,
            [location, mode, connection_status, min_moisture_threshold, watering_duration, req.params.id]
        );
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Failed', detail: error.message }); }
});

app.delete('/api/devices/:id', authenticateToken, async (req, res) => {
    try {
        await pool.execute('DELETE FROM devices WHERE device_id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Failed', detail: error.message }); }
});

// ==========================================
// 🌱 PLANTING (การปลูกผักลงแปลง)
// ==========================================
app.post('/api/device-vegetables', authenticateToken, async (req, res) => {
    try {
        const { device_id, veg_id } = req.body;
        const [check] = await pool.execute('SELECT * FROM device_vegetables WHERE device_id=? AND veg_id=?', [device_id, veg_id]);
        if (check.length > 0) return res.status(400).json({ error: 'พืชชนิดนี้ถูกปลูกในแปลงนี้อยู่แล้วครับ 🌱' });

        await pool.execute('INSERT INTO device_vegetables (device_id, veg_id) VALUES (?, ?)', [device_id, veg_id]);
        res.status(201).json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Failed', detail: error.message }); }
});

// ==========================================
// 🥬 VEGETABLES (Master Data)
// ==========================================
app.get('/api/vegetables', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM vegetable ORDER BY veg_name ASC');
        res.json(rows);
    } catch (error) { res.status(500).json({ error: 'Failed', detail: error.message }); }
});

app.post('/api/vegetables', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { veg_name, light_intensity, min_moisture_default, device_id } = req.body;
        
        const [result] = await connection.execute(
            'INSERT INTO vegetable (veg_name, light_intensity, min_moisture_default) VALUES (?, ?, ?)',
            [veg_name, light_intensity || null, min_moisture_default || 40.0]
        );
        
        if (device_id) {
            await connection.execute('INSERT INTO device_vegetables (device_id, veg_id) VALUES (?, ?)', [device_id, result.insertId]);
        }
        await connection.commit();
        res.status(201).json({ success: true, message: 'เพิ่มผักสำเร็จ' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: 'Failed', detail: error.message });
    } finally { connection.release(); }
});

app.delete('/api/vegetables/:id', authenticateToken, async (req, res) => {
    try {
        const [deviceCheck] = await pool.execute('SELECT device_id FROM device_vegetables WHERE veg_id = ?', [req.params.id]);
        if (deviceCheck.length > 0) return res.status(400).json({ error: 'ไม่สามารถลบได้ มีแปลงที่กำลังปลูกผักชนิดนี้อยู่' });

        await pool.execute('DELETE FROM vegetable WHERE veg_id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Failed', detail: error.message }); }
});

// ==========================================
// 🌡️ SENSORS (environment_log)
// ==========================================
app.get('/api/sensors/latest', authenticateToken, async (req, res) => {
    try {
        const { device_id } = req.query;
        if (device_id) {
            const [rows] = await pool.execute('SELECT * FROM environment_log WHERE device_id=? ORDER BY recorded_at DESC LIMIT 1', [device_id]);
            if (rows.length === 0) return res.json({ status: 'no_data' }); 
            return res.json(rows[0]);
        }
        res.json([]);
    } catch (error) { res.status(500).json({ error: 'Failed', detail: error.message }); }
});

app.get('/api/sensors/history', authenticateToken, async (req, res) => {
    try {
        const { device_id, days = 1 } = req.query; 
        if (!device_id) return res.status(400).json({ error: 'device_id is required' });
        
        const dayLimit = parseInt(days) || 1;
        const limitRecords = dayLimit > 10 ? 800 : 300; 

        const [rows] = await pool.execute(
            `SELECT * FROM environment_log WHERE device_id=? AND recorded_at >= NOW() - INTERVAL ${dayLimit} DAY ORDER BY recorded_at ASC LIMIT ${limitRecords}`,
            [device_id]
        );
        res.json(rows);
    } catch (error) { res.status(500).json({ error: 'Failed', detail: error.message }); }
});

app.post('/api/sensors', async (req, res) => {
    try {
        const device_id = req.body.device_id || req.body.mac_address;
        const soil_moisture = req.body.soil_moisture !== undefined ? req.body.soil_moisture : req.body.moisture;
        const air_temperature = req.body.air_temperature !== undefined ? req.body.air_temperature : req.body.temperature;
        const light_intensity = req.body.light_intensity !== undefined ? req.body.light_intensity : req.body.light;
        const humidity = req.body.humidity !== undefined ? req.body.humidity : 0;

        if(!device_id) return res.status(400).json({error: "Missing device_id"});

        await pool.execute(
            'INSERT INTO environment_log (device_id, soil_moisture, air_temperature, light_intensity, humidity) VALUES (?, ?, ?, ?, ?)',
            [device_id, soil_moisture || 0, air_temperature || 0, light_intensity || 0, humidity]
        );

        await pool.execute('UPDATE devices SET connection_status="online" WHERE device_id=?', [device_id]);

        const [devs] = await pool.execute('SELECT mode, min_moisture_threshold, watering_duration FROM devices WHERE device_id=?', [device_id]);
        if (devs.length > 0 && soil_moisture !== undefined && soil_moisture !== null) {
            const dev = devs[0];
            const threshold = parseFloat(dev.min_moisture_threshold || 40.0);
            const currentMoist = parseFloat(soil_moisture);

            if (dev.mode === 'auto' && currentMoist <= threshold) {
                const [activePump] = await pool.execute('SELECT pump_log_id FROM pump_log WHERE device_id=? AND stop_time > NOW()', [device_id]);
                
                if (activePump.length === 0) {
                    const dur = parseInt(dev.watering_duration || 120);
                    const volLiters = (dur / 60) * 5; 
                    
                    await pool.execute(
                        `INSERT INTO pump_log (device_id, action_trigger, start_time, stop_time, water_volume) 
                         VALUES (?, 'auto', NOW(), DATE_ADD(NOW(), INTERVAL ${dur} SECOND), ?)`,
                        [device_id, volLiters]
                    );
                    return res.status(201).json({ success: true, action: 'WATER_NOW', duration: dur });
                }
            }
        }
        res.status(201).json({ success: true, action: 'NONE' });
    } catch (error) { res.status(500).json({ error: 'Failed', detail: error.message }); }
});

// ==========================================
// ⚙️ WATERING (pump_log)
// ==========================================
app.post('/api/watering/manual', authenticateToken, async (req, res) => {
    try {
        const { device_id, duration_seconds } = req.body;
        if (!device_id) return res.status(400).json({ error: 'device_id is required' });

        const dur = parseInt(duration_seconds) || 120;
        const volLiters = (dur / 60) * 5;

        const [result] = await pool.execute(
            `INSERT INTO pump_log (device_id, action_trigger, start_time, stop_time, water_volume) 
             VALUES (?, 'manual', NOW(), DATE_ADD(NOW(), INTERVAL ${dur} SECOND), ?)`,
            [device_id, volLiters]
        );
        res.status(201).json({ success: true, id: result.insertId });
    } catch (error) { res.status(500).json({ error: 'Failed', detail: error.message }); }
});

app.get('/api/watering', authenticateToken, async (req, res) => {
    try {
        const { device_id, days = 7 } = req.query;
        const dayLimit = parseInt(days) || 7;
        
        let where = `WHERE p.recorded_at >= NOW() - INTERVAL ${dayLimit} DAY AND fm.user_id = ?`;
        const params = [req.user.user_id];
        
        if (device_id) { where += ' AND p.device_id = ?'; params.push(device_id); }

        const [rows] = await pool.execute(`
            SELECT p.*, d.location, TIMESTAMPDIFF(SECOND, p.start_time, p.stop_time) AS calculated_duration
            FROM pump_log p
            JOIN devices d ON p.device_id = d.device_id
            JOIN farm_member fm ON d.farm_id = fm.farm_id
            ${where}
            ORDER BY p.recorded_at DESC LIMIT 50
        `, params);
        res.json(rows);
    } catch (error) { res.status(500).json({ error: 'Failed', detail: error.message }); }
});

// ==========================================
// 🛠️ SETTINGS (ตั้งค่าการรดน้ำ)
// ==========================================
app.get('/api/settings/:device_id', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT mode, min_moisture_threshold, watering_duration FROM devices WHERE device_id = ?', [req.params.device_id]);
        if (rows.length === 0) return res.status(404).json({ error: 'ไม่พบอุปกรณ์นี้' });
        res.json(rows[0]);
    } catch (error) { res.status(500).json({ error: 'Failed', detail: error.message }); }
});

app.put('/api/settings/:device_id', authenticateToken, async (req, res) => {
    try {
        const { mode, min_moisture_threshold, watering_duration } = req.body;
        await pool.execute(
            `UPDATE devices SET 
             mode = COALESCE(?, mode), 
             min_moisture_threshold = COALESCE(?, min_moisture_threshold), 
             watering_duration = COALESCE(?, watering_duration)
             WHERE device_id = ?`,
            [mode, min_moisture_threshold, watering_duration, req.params.device_id]
        );
        res.json({ success: true, message: 'Settings saved successfully' });
    } catch (error) { res.status(500).json({ error: 'Failed', detail: error.message }); }
});

// ==========================================
app.listen(port, () => {
    console.log(`🚀 Green Space API (Smart Auto Water) running on port ${port}`);
});