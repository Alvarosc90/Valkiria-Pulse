CREATE TABLE external_identities (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source ENUM('trainia','external') NOT NULL,
  external_user_id VARCHAR(190) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  metadata_json JSON NULL,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_external_identity_source_user (source, external_user_id),
  KEY idx_external_identity_user (user_id),
  CONSTRAINT fk_external_identity_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
