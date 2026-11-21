CREATE TABLE IF NOT EXISTS account_activations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  employee_id CHAR(36) NOT NULL,
  activated_by_user_id CHAR(36) NOT NULL,
  activated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX ix_account_activations_employee (employee_id, activated_at),
  CONSTRAINT fk_account_activations_employee FOREIGN KEY (employee_id) REFERENCES users(employee_id),
  CONSTRAINT fk_account_activations_actor FOREIGN KEY (activated_by_user_id) REFERENCES users(id)
);
