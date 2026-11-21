ALTER TABLE employees ADD COLUMN session_generation BIGINT NOT NULL DEFAULT 1 AFTER version;
