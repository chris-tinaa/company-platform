CREATE TABLE IF NOT EXISTS attendance (
  id CHAR(36) NOT NULL PRIMARY KEY,
  employee_id CHAR(36) NOT NULL,
  attendance_date DATE NOT NULL,
  checked_in_at DATETIME(3) NOT NULL,
  latitude DECIMAL(9,6) NOT NULL,
  longitude DECIMAL(9,6) NOT NULL,
  location_accuracy DECIMAL(7,1) NOT NULL,
  document_id CHAR(36) NOT NULL UNIQUE,
  idempotency_key VARCHAR(128) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_attendance_employee_date (employee_id, attendance_date),
  UNIQUE KEY uq_attendance_employee_key (employee_id, idempotency_key),
  INDEX ix_attendance_date (attendance_date)
);
