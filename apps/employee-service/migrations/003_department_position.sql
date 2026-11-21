-- Backfill names from legacy employees before dropping text columns.
-- Existing employee UUIDs, versions, generations, and attendance references remain unchanged.
CREATE TABLE IF NOT EXISTS departments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);
CREATE TABLE IF NOT EXISTS positions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL UNIQUE,
  `level` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_position_level CHECK (`level` BETWEEN 1 AND 20)
);
INSERT INTO departments (id, code, name)
 SELECT UUID(), CONCAT('D', LEFT(REPLACE(UUID(), '-', ''), 31)), previous.department
 FROM (SELECT DISTINCT TRIM(department) AS department FROM employees) AS previous
 WHERE NOT EXISTS (SELECT 1 FROM departments d WHERE d.name = previous.department);
INSERT INTO positions (id, code, name, `level`)
 SELECT UUID(), CONCAT('P', LEFT(REPLACE(UUID(), '-', ''), 31)), previous.position, 1
 FROM (SELECT DISTINCT TRIM(position) AS position FROM employees) AS previous
 WHERE NOT EXISTS (SELECT 1 FROM positions p WHERE p.name = previous.position);
ALTER TABLE employees
  ADD COLUMN department_id CHAR(36) NULL AFTER email,
  ADD COLUMN position_id CHAR(36) NULL AFTER department_id;
UPDATE employees e
 JOIN departments d ON d.name = TRIM(e.department)
 JOIN positions p ON p.name = TRIM(e.position)
 SET e.department_id = d.id, e.position_id = p.id;
ALTER TABLE employees
  MODIFY COLUMN department_id CHAR(36) NOT NULL,
  MODIFY COLUMN position_id CHAR(36) NOT NULL;
ALTER TABLE employees
  ADD CONSTRAINT fk_employees_department FOREIGN KEY (department_id) REFERENCES departments(id),
  ADD CONSTRAINT fk_employees_position FOREIGN KEY (position_id) REFERENCES positions(id);
ALTER TABLE employees DROP COLUMN department, DROP COLUMN position;
