import type { RowDataPacket } from "mysql2";
import { config } from "../config.js";
import { db } from "../db.js";
i  rule &&
    typeof rule.path === "string" &&
    matchesRule(payload, rule)
  );
}

function channelForStep(channel: string, paidProvider?: string | null) {
  if (channel === "manual_paid_media") {
    return paidProvider === "google" ? "google_ads" : "meta_ads";
  }
  return channel;
}

export async function processPendingGrowthSignals(limit = 50) {
  if (!config.PULSE_GROWTH_INTEGRATIONS_ENABLED) {
    return { processed: 0, ignored: 0, actionsDrafted: 0, actionsBlocked: 0 };
  }

  const [signals] = await db.query<RowDataPacket[]>(
    `SELECT id, tenant_id AS tenantId, brand_id AS brandId,
            source_system AS sourceSystem, event_type AS eventType,
            contact_id AS contactId, occurred_at AS occurredAt,
            payload_json AS payload
     FROM growth_signals
     WHERE processing_status = 'pending'
     ORDER BY occurred_at ASC, id ASC
     LIMIT ?`,
    [Math.max(1, Math.min(200, limit))]
  );

  let processed = 0;
  let ignored = 0;
  let actionsDrafted = 0;
  let actionsBlocked = 0;

  for (const signal of signals) {
    const tenantId = Number(signal.tenantId);
    const signalId = Number(signal.id);
    const payload = growthObjectValue(signal.payload);

    const [triggers] = await db.query<RowDataPacket[]>(
      `SELECT gt.id, gt.campaign_id AS campaignId,
              gt.conditions_json AS conditionsJson,
              gc.status AS campaignStatus,
              gc.paid_provider AS paidProvider
       FROM growth_triggers gt
       INNER JOIN growth_campaigns gc
         ON gc.id = gt.campaign_id
        AND gc.tenant_id = gt.tenant_id
       WHERE gt.tenant_id = ?
         AND gt.source_system = ?
         AND gt.event_type = ?
         AND gt.enabled = 1
         AND gc.status IN ('ready','active')
       ORDER BY gt.id ASC`,
      [tenantId, String(signal.sourceSystem), String(signal.eventType)]
    );

    const matched = triggers.filter((trigger) =>
      growthConditionsMatch(payload, trigger.conditionsJson)
    );

    if (!matched.length) {
      await db.execute(
        `UPDATE growth_signals
         SET processing_status = 'ignored',
             processing_note = 'No matching ready/active trigger',
             processed_at = UTC_TIMESTAMP(3)
         WHERE id = ? AND tenant_id = ? AND processing_status = 'pending'`,
        [signalId, tenantId]
      );
      ignored += 1;
      continue;
    }

    for (const trigger of matched) {
      const campaignId = Number(trigger.campaignId);
      const [sequences] = await db.query<RowDataPacket[]>(
        `SELECT id
         FROM growth_sequences
         WHERE tenant_id = ?
           AND campaign_id = ?
           AND status IN ('ready','active')
         ORDER BY id ASC`,
        [tenantId, campaignId]
      );

      for (const sequence of sequences) {
        const sequenceId = Number(sequence.id);
        const [steps] = await db.query<RowDataPacket[]>(
          `SELECT id, position, channel, action_type AS actionType,
                  delay_minutes AS delayMinutes,
                  requires_consent AS requiresConsent,
                  template_json AS template
           FROM growth_sequence_steps
           WHERE tenant_id = ? AND sequence_id = ?
           ORDER BY position ASC`,
          [tenantId, sequenceId]
        );

        let cumulativeDelayMinutes = 0;
        for (const step of steps) {
          cumulativeDelayMinutes += Number(step.delayMinutes ?? 0);
          const channel = channelForStep(
            String(step.channel),
            trigger.paidProvider ? String(trigger.paidProvider) : null
          );

          let blocked = false;
          if (channel === "whatsapp") {
            if (!signal.contactId) {
              blocked = true;
            } else {
              const [contacts] = await db.query<RowDataPacket[]>(
                `SELECT whatsapp_consent AS consent
                 FROM growth_contacts
                 WHERE id = ? AND tenant_id = ?
                 LIMIT 1`,
                [Number(signal.contactId), tenantId]
              );
              blocked = String(contacts[0]?.consent ?? "unknown") !== "opted_in";
            }
          }

          const idempotencyKey =
            `growth-signal:${signalId}:sequence:${sequenceId}:step:${Number(step.id)}`;
          const scheduledAt = new Date(
            new Date(signal.occurredAt).getTime() + cumulativeDelayMinutes * 60_000
          );

          const [result] = await db.execute<any>(
            `INSERT INTO growth_channel_actions
             (tenant_id, campaign_id, sequence_id, step_id, contact_id, channel,
              execution_mode, status, idempotency_key, payload_json, scheduled_at)
             VALUES (?, ?, ?, ?, ?, ?, 'draft_only', ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
            [
              tenantId,
              campaignId,
              sequenceId,
              Number(step.id),
              signal.contactId ? Number(signal.contactId) : null,
              channel,
              blocked ? "blocked" : "drafted",
              idempotencyKey,
              JSON.stringify({
                sourceSignalId: signalId,
                sourceEventType: signal.eventType,
                actionType: step.actionType,
                template: growthObjectValue(step.template),
                context: payload
              }),
              scheduledAt
            ]
          );

          if (Number(result.affectedRows) === 1) {
            if (blocked) actionsBlocked += 1;
            else actionsDrafted += 1;
          }
        }
      }
    }

    await db.execute(
      `UPDATE growth_signals
       SET processing_status = 'processed',
           processing_note = ?,
           processed_at = UTC_TIMESTAMP(3)
       WHERE id = ? AND tenant_id = ? AND processing_status = 'pending'`,
      [
        `Matched ${matched.length} trigger(s); generated draft actions only`,
        signalId,
        tenantId
      ]
    );
    processed += 1;
  }

  return { processed, ignored, actionsDrafted, actionsBlocked };
}
