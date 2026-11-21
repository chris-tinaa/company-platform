CREATE TABLE IF NOT EXISTS documents (
  id CHAR(36) NOT NULL PRIMARY KEY,
  subject_employee_id CHAR(36) NOT NULL,
  uploader_employee_id CHAR(36) NOT NULL,
  storage_id VARCHAR(64) NOT NULL UNIQUE,
  sha256 CHAR(64) NOT NULL,
  content_type VARCHAR(20) NOT NULL,
  size_bytes INT NOT NULL,
  status ENUM('STAGED','READY') NOT NULL DEFAULT 'STAGED',
  attendance_id CHAR(36) NULL UNIQUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX ix_document_subject (subject_employee_id, created_at)
);
