CREATE TABLE legal_acceptances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  tenant_id BIGINT UNSIGNED NOT NULL,
  document_key ENUM('terms','privacy') NOT NULL,
  document_version VARCHAR(40) NOT NULL,
  accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_legal_acceptance_version (user_id, tenant_id, document_key, document_version),
  KEY idx_legal_acceptance_tenant (tenant_id, accepted_at),
  CONSTRAINT fk_legal_acceptance_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_legal_acceptance_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE public_leads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  company VARCHAR(160) NOT NULL,
  email VARCHAR(180) NOT NULL,
  phone VARCHAR(60) NULL,
  current_system VARCHAR(160) NULL,
  message TEXT NULL,
  source VARCHAR(80) NOT NULL DEFAULT 'landing',
  status ENUM('new','contacted','qualified','won','lost') NOT NULL DEFAULT 'new',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_public_leads_status_created (status, created_at),
  KEY idx_public_leads_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
