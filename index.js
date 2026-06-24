const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const port = 3000;

// Middlewares necesarios para que el Frontend (HTML) se pueda comunicar
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'tasks.html'));
});

app.get('/tasks.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'tasks.html'));
});

// 1. Configuración de conexión a PostgreSQL usando tus credenciales
const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'tasks_db',
    user: 'luis',
    password: 'luisbaquiax1234'
});

// --- RUTAS (ENDPOINTS) ---

// ===== PROYECTOS =====

// Obtener todos los proyectos con su tiempo total invertido
app.get('/api/projects', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                p.id,
                p.name,
                p.description,
                p.created_at,
                COALESCE(SUM(tl.duration_seconds), 0)::INTEGER as total_seconds
            FROM projects p
            LEFT JOIN tasks t ON p.id = t.id_proyecto
            LEFT JOIN time_logs tl ON t.id = tl.task_id
            GROUP BY p.id, p.name, p.description, p.created_at
            ORDER BY p.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener proyectos' });
    }
});

// Obtener tiempo total de un proyecto específico
app.get('/api/projects/:id/total-time', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            SELECT COALESCE(SUM(tl.duration_seconds), 0) as total_seconds
            FROM tasks t
            LEFT JOIN time_logs tl ON t.id = tl.task_id
            WHERE t.id_proyecto = $1
        `, [id]);
        res.json({ totalSeconds: result.rows[0].total_seconds });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener tiempo total' });
    }
});

// Crear un nuevo proyecto
app.post('/api/projects', async (req, res) => {
    const { name, description } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO projects (name, description) VALUES ($1, $2) RETURNING *',
            [name, description || null]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al crear proyecto' });
    }
});

// Actualizar un proyecto
app.put('/api/projects/:id', async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;
    try {
        const result = await pool.query(
            'UPDATE projects SET name = $1, description = $2 WHERE id = $3 RETURNING *',
            [name, description || null, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Proyecto no encontrado' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al actualizar proyecto' });
    }
});

// Eliminar un proyecto (también elimina tareas asociadas)
app.delete('/api/projects/:id', async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        // Primero obtener los task_ids que pertenecen a este proyecto
        const tasksResult = await client.query('SELECT id FROM tasks WHERE id_proyecto = $1', [id]);
        const taskIds = tasksResult.rows.map(r => r.id);
        
        // Eliminar time_logs de esas tareas
        if (taskIds.length > 0) {
            await client.query('DELETE FROM time_logs WHERE task_id = ANY($1)', [taskIds]);
        }
        
        // Eliminar tareas del proyecto
        await client.query('DELETE FROM tasks WHERE id_proyecto = $1', [id]);
        
        // Eliminar proyecto
        await client.query('DELETE FROM projects WHERE id = $1', [id]);
        
        await client.query('COMMIT');
        res.json({ message: 'Proyecto eliminado correctamente' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Error al eliminar proyecto' });
    } finally {
        client.release();
    }
});

// ===== TAREAS =====

// Obtener todas las tareas
app.get('/api/tasks', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT t.*, p.name as project_name FROM tasks t
            LEFT JOIN projects p ON t.id_proyecto = p.id
            ORDER BY t.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener tareas' });
    }
});

// Obtener tareas filtradas por proyecto
app.get('/api/projects/:project_id/tasks', async (req, res) => {
    const { project_id } = req.params;
    try {
        const result = await pool.query(
            `SELECT t.*, p.name as project_name FROM tasks t
             LEFT JOIN projects p ON t.id_proyecto = p.id
             WHERE t.id_proyecto = $1 ORDER BY t.created_at DESC`,
            [project_id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener tareas del proyecto' });
    }
});

// Crear una nueva tarea
app.post('/api/tasks', async (req, res) => {
    const { title, description, id_proyecto } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO tasks (title, description, status, id_proyecto) VALUES ($1, $2, $3, $4) RETURNING *',
            [title, description || null, 'en_pausa', id_proyecto || null]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al crear tarea' });
    }
});

// Actualizar estado de una tarea (en_progreso, en_pausa, finalizada)
app.put('/api/tasks/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        await pool.query('UPDATE tasks SET status = $1 WHERE id = $2', [status, id]);
        res.json({ message: 'Estado actualizado correctamente' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al actualizar el estado' });
    }
});

// Eliminar una tarea y sus registros de tiempo
app.delete('/api/tasks/:id', async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM time_logs WHERE task_id = $1', [id]);
        await client.query('DELETE FROM tasks WHERE id = $1', [id]);
        await client.query('COMMIT');
        res.json({ message: 'Tarea eliminada correctamente' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Error al eliminar la tarea' });
    } finally {
        client.release();
    }
});

// Guardar un nuevo registro de tiempo de una sesión
app.post('/api/logs', async (req, res) => {
    const { taskId, startTime, endTime, durationSeconds } = req.body;
    // Extraer solo la fecha (YYYY-MM-DD) para la columna log_date
    const logDate = new Date(startTime).toISOString().split('T')[0];
    
    try {
        await pool.query(
            'INSERT INTO time_logs (task_id, start_time, end_time, duration_seconds, log_date) VALUES ($1, $2, $3, $4, $5)',
            [taskId, startTime, endTime, durationSeconds, logDate]
        );
        res.json({ message: 'Registro de tiempo guardado' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al guardar el registro' });
    }
});

// Obtener los registros de tiempo invertido de una tarea específica
app.get('/api/tasks/:id/logs', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM time_logs WHERE task_id = $1 ORDER BY start_time DESC',
            [id]
        );
        
        // Transformar snake_case a camelCase para que JS lo entienda fácilmente
        const logs = result.rows.map(row => ({
            id: row.id,
            taskId: row.task_id,
            startTime: row.start_time,
            endTime: row.end_time,
            durationSeconds: row.duration_seconds,
            logDate: typeof row.log_date === 'string' ? row.log_date : new Date(row.log_date).toISOString().split('T')[0]
        }));
        
        res.json(logs);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener los registros' });
    }
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`✅ Servidor Backend corriendo en http://localhost:${port}`);
});