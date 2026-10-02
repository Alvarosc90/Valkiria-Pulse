CREATE TABLE oauth_states (
  id CHAR(36) NOT NULL,
  state_hash CHAR(64) NOT NULL,
  tenant_id BIGINT UNSIGNED NOT NULL,
  brand_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  platform ENUM('instagram','tiktok','linkedin') NOT NULL,
  return_to VARCHAR(500) NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_oauth_states_hash (state_hash),
  KEY idx_oauth_states_expiry (expires_at, consumed_at),
  CONSTRAINT fk_oauth_states_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_oauth_states_brand FOREIGN KEY (brand_id) REFERENCES brands(id),
  CONSTRAINT fk_oauth_states_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
