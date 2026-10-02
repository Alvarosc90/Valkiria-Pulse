CREATE TABLE social_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  brand_id BIGINT UNSIGNED NOT NULL,
  platform ENUM('instagram','tiktok','linkedin') NOT NULL,
  account_kind ENUM('profile','organization','page') NOT NULL DEFAULT 'profile',
  external_account_id VARCHAR(190) NOT NULL,
  username VARCHAR(190) NULL,
  display_name VARCHAR(190) NULL,
  status ENUM('connected','expired','revoked','error') NOT NULL DEFAULT 'connected',
  scopes_json JSON NULL,
  metadata_json JSON NULL,
  token_expires_at DATETIME NULL,
  refresh_expires_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_social_account (tenant_id, platform, external_account_id),
  KEY idx_social_accounts_brand (brand_id),
  CONSTRAINT fk_social_accounts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_social_accounts_brand FOREIGN KEY (brand_id) REFERENCES brands(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE social_credentials (
  social_account_id BIGINT UNSIGNED NOT NULL,
  access_token_enc MEDIUMTEXT NULL,
  refresh_token_enc MEDIUMTEXT NULL,
  key_version VARCHAR(40) NOT NULL DEFAULT 'v1',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (social_account_id),
  CONSTRAINT fk_social_credentials_account FOREIGN KEY (social_account_id)
    REFERENCES social_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
