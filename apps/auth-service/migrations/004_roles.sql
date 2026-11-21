-- Normalize the existing HR/EMPLOYEE role enum without changing user identities or sessions.
CREATE TABLE IF NOT EXISTS roles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
INSERT INTO roles (id, code, name) VALUES
  ('00000000-0000-4000-8000-000000000301', 'HR', 'Human Resources'),
  ('00000000-0000-4000-8000-000000000302', 'EMPLOYEE', 'Karyawan');
ALTER TABLE users ADD COLUMN role_id CHAR(36) NULL AFTER username;
UPDATE users u JOIN roles r ON r.code = u.role SET u.role_id = r.id;
ALTER TABLE users MODIFY COLUMN role_id CHAR(36) NOT NULL;
ALTER TABLE users ADD CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id);
ALTER TABLE users DROP COLUMN role;
