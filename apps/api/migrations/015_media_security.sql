ALTER TABLE media_assets
  ADD COLUMN size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER mime_type,
  ADD KEY idx_media_assets_tenant_size (tenant_id, size_bytes);

UPDATE media_assets
SET size_bytes = COALESCE(
  CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.sizeBytes')) AS UNSIGNED),
  0
);

UPDATE saas_plans
SET limits_json = JSON_SET(
  COALESCE(limits_json, JSON_OBJECT()),
  '$.mediaStorageBytes',
  CASE plan_key
    WHEN 'starter' THEN 1073741824
    WHEN 'professional' THEN 5368709120
    WHEN 'business' THEN 21474836480
    WHEN 'enterprise' THEN -1
    ELSE 0
  END
)
WHERE plan_key IN ('starter','professional','business','enterprise');
