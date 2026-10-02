ALTER TABLE users
  ADD COLUMN auth_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER active;

ALTER TABLE user_tenants
  ADD COLUMN auth_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER active;

CREATE TABLE refresh_sessions (
  id CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  tenant_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_refresh_sessions_user (user_id, revoked_at),
  KEY idx_refresh_sessions_expiry (expires_at),
  CONSTRAINT fk_refresh_sessions_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_refresh_sessions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
