# Valkiria PULSE · Launch readiness

Status: implementation foundation prepared. Commercial production launch still depends on the external items listed below.

## Included in product

### Public commercial surface
- Public landing.
- Dark visual identity and Valkiria Project link.
- PULSE IA public assistant.
- Commercial contact form with rate limiting and honeypot.
- Lead persistence in database.
- Self-service 14-day trial signup.
- Public plans section without inventing production prices.
- Login and return-to-landing navigation.

### Legal and privacy surface
- Terms and Conditions.
- Privacy Policy.
- Cookies Policy.
- Security page.
- Data Processing roles page.
- Versioned legal acceptance audit during signup.
- Cookie preference storage.
- Separate contact channels for commercial/privacy and support/security.

### Security controls already present
- Short-lived access tokens.
- Revocable refresh sessions.
- Login and public endpoint rate limiting.
- Tenant-aware authenticated routes.
- RBAC.
- Encrypted social credentials.
- Audit events for critical product actions.
- Provider separation from editorial agents.
- Managed schema migrations with pre-migration backup in Valky.

## Required before public paid launch

### 1. Commercial identity
Confirm and publish the exact contracting party:
- legal/fiscal name;
- CUIT or applicable tax identifier;
- fiscal/legal address;
- invoicing channel;
- tax treatment.

Do not hard-code this in policy text until the contracting identity is final.

### 2. Data protection administration
For an Argentina-based responsible:
- review whether Valkiria Project must register as responsible with the Registro Nacional de Bases de Datos Personales;
- identify each personal-data database that must be registered;
- document the internal procedure for access, rectification, update and deletion requests;
- document incident-response ownership;
- maintain a supplier/subprocessor register.

### 3. Legal review
Have a qualified professional review:
- Terms and Conditions;
- Privacy Policy;
- Data Processing terms / DPA;
- limitation of liability;
- intellectual-property clauses;
- cancellation/refund rules;
- international data transfers;
- B2B/B2C applicability.

The repository copy is an operational first version, not a substitute for external legal review.

### 4. Email
Configure production SMTP for:
- email verification;
- password recovery;
- trial welcome;
- security notifications;
- commercial contact notifications.

Self-service signup currently creates the workspace immediately. Email verification should be enabled before high-volume public acquisition.

### 5. Billing
Still required:
- approve production prices;
- choose payment provider;
- configure checkout adapter;
- configure verified webhooks;
- cancellation / pause / plan-change execution;
- invoice/tax flow;
- retry / past-due policy.

The product intentionally shows "Precio a consultar" until prices are approved.

### 6. Social-provider production approvals
Instagram:
- confirm production publishing scopes and app review requirements.

TikTok:
- complete production review for Content Posting API.
- sandbox success does not replace production approval.

LinkedIn:
- personal publishing can remain separate from organization publishing.
- organization/community-management permissions must be approved before offering company-page publishing or organization analytics.

### 7. Analytics
Real provider analytics only become available after the matching platform insights permissions are approved.
Do not show demo metrics as live customer data.

### 8. Production infrastructure
Before public traffic:
- production domain and TLS;
- persistent media/object storage;
- database backup schedule and restore drill;
- uptime/health monitoring;
- error monitoring;
- log retention policy;
- secret rotation procedure;
- staging environment;
- tested rollback.

Suggested public hostname: decide explicitly before SEO canonical/sitemap are fixed.

### 9. Product operations
Prepare:
- onboarding checklist;
- support response expectations;
- incident contact;
- account deletion/export procedure;
- social token revocation procedure;
- provider outage messages;
- customer offboarding runbook.

## Recommended launch sequence

1. Internal dogfood with TrainIA as the first tenant.
2. Import/reconnect validated TrainIA social accounts securely.
3. Complete TikTok production review and LinkedIn organization approval.
4. Configure SMTP and email verification.
5. Confirm legal/fiscal contracting identity and obtain legal review.
6. Confirm prices and billing provider.
7. Deploy staging and execute end-to-end signup → connect → create → approve → publish → analytics.
8. Deploy production.
9. Open trial signup publicly.
10. Add paid checkout only after webhook and cancellation paths have passed QA.
