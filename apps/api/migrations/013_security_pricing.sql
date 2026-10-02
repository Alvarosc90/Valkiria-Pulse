ALTER TABLE users
  ADD COLUMN email_verified_at DATETIME NULL AFTER auth_version,
  ADD COLUMN password_changed_at DATETIME NULL AFTER email_verified_at,
  ADD COLUMN last_login_at DATETIME NULL AFTER password_changed_at;

-- Existing accounts predate mandatory verification and are trusted as migrated users.
UPDATE users
SET email_verified_at = UTC_TIMESTAMP()
WHERE email_verified_at IS NULL;

CREATE TABLE auth_one_time_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  purpose ENUM('verify_email','reset_password') NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  requested_ip VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_one_time_token_hash (token_hash),
  KEY idx_auth_one_time_user_purpose (user_id, purpose, consumed_at, expires_at),
  CONSTRAINT fk_auth_one_time_tokens_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_security_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  tenant_id BIGINT UNSIGNED NULL,
  email_hash CHAR(64) NULL,
  event_key VARCHAR(80) NOT NULL,
  outcome ENUM('success','failure','info') NOT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_auth_security_user_created (user_id, created_at),
  KEY idx_auth_security_tenant_created (tenant_id, created_at),
  KEY idx_auth_security_event_created (event_key, created_at),
  CONSTRAINT fk_auth_security_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_auth_security_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO saas_plan_prices
(plan_key, currency, billing_interval, unit_amount_minor, status, display_order, metadata_json)
VALUES
('starter','ARS','monthly',2490000,'active',10,JSON_OBJECT('launch', true, 'taxesIncluded', false, 'label', 'Precio lanzamiento')),
('starter','ARS','yearly',24900000,'active',11,JSON_OBJECT('launch', true, 'taxesIncluded', false, 'discountMonths', 2)),
('starter','USD','monthly',1900,'active',12,JSON_OBJECT('launch', true, 'taxesIncluded', false, 'label', 'Launch price')),
('starter','USD','yearly',19000,'active',13,JSON_OBJECT('launch', true, 'taxesIncluded', false, 'discountMonths', 2)),

('professional','ARS','monthly',5990000,'active',20,JSON_OBJECT('launch', true, 'taxesIncluded', false, 'label', 'Precio lanzamiento')),
('professional','ARS','yearly',59900000,'active',21,JSON_OBJECT('launch', true, 'taxesIncluded', false, 'discountMonths', 2)),
('professional','USD','monthly',4900,'active',22,JSON_OBJECT('launch', true, 'taxesIncluded', false, 'label', 'Launch price')),
('professional','USD','yearly',49000,'active',23,JSON_OBJECT('launch', true, 'taxesIncluded', false, 'discountMonths', 2)),

('business','ARS','monthly',11990000,'active',30,JSON_OBJECT('launch', true, 'taxesIncluded', false, 'label', 'Precio lanzamiento')),
('business','ARS','yearly',119900000,'active',31,JSON_OBJECT('launch', true, 'taxesIncluded', false, 'discountMonths', 2)),
('business','USD','monthly',9900,'active',32,JSON_OBJECT('launch', true, 'taxesIncluded', false, 'label', 'Launch price')),
('business','USD','yearly',99000,'active',33,JSON_OBJECT('launch', true, 'taxesIncluded', false, 'discountMonths', 2))
ON DUPLICATE KEY UPDATE
  unit_amount_minor = VALUES(unit_amount_minor),
  status = VALUES(status),
  display_order = VALUES(display_order),
  metadata_json = VALUES(metadata_json);

UPDATE saas_plan_entitlements
SET enabled = CASE
  WHEN plan_key IN ('professional','business','enterprise') THEN 1
  ELSE 0
END
WHERE entitlement_key = 'analytics';
