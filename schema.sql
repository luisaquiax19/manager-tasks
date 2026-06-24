-- Tabla proyecto para almacenar información de los proyectos
CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla principal de tareas
CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'en_pausa', -- Valores: 'en_progreso', 'en_pausa', 'finalizada'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    id_proyecto INTEGER REFERENCES projects(id) ON DELETE SET NULL
);

-- Tabla para los registros de tiempo (sesiones)
CREATE TABLE time_logs (
    id SERIAL PRIMARY KEY,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    duration_seconds INTEGER NOT NULL,
    log_date DATE NOT NULL
);