# Spec: Production Saas Hardening

> 13 nodes · cohesion 0.21

## Key Concepts

- **RLS Storage Audit Hardening Plan** (13 connections) — `docs/superpowers/plans/2026-05-31-rls-storage-audit-hardening.md`
- **Production SaaS Hardening Plan (2026-05-30)** (7 connections) — `docs/superpowers/plans/2026-05-30-production-saas-hardening.md`
- **Application Audit Log (app_audit_logs — Immutable Events)** (3 connections) — `docs/superpowers/plans/2026-05-31-rls-storage-audit-hardening.md`
- **RLS as Defense in Depth (Not Live Toggle)** (2 connections) — `docs/superpowers/plans/2026-05-30-production-saas-hardening.md`
- **Migration 072 (Security Hardening — audit logs, RLS, storage)** (2 connections) — `docs/superpowers/plans/2026-05-30-production-saas-hardening.md`
- **Supabase Schema Reconciliation Audit** (2 connections) — `docs/superpowers/audits/2026-06-06-supabase-schema-reconciliation.md`
- **Local vs Live Migration Drift** (2 connections) — `docs/superpowers/audits/2026-06-06-supabase-schema-reconciliation.md`
- **Supabase Project ayftynkgmfkaqmmnlmoc** (2 connections) — `docs/superpowers/audits/2026-06-06-supabase-schema-reconciliation.md`
- **broadcast-csvs Bucket Made Private (No Public URL)** (1 connections) — `docs/superpowers/plans/2026-05-31-rls-storage-audit-hardening.md`
- **Razorpay Idempotency Key (booking:{id}:payment_link)** (1 connections) — `docs/superpowers/plans/2026-05-30-production-saas-hardening.md`
- **TeleCMI Webhook Shared-Secret Guard (x-aira-webhook-secret)** (1 connections) — `docs/superpowers/plans/2026-05-30-production-saas-hardening.md`
- **Public→Signed URL CSV Migration** (1 connections) — `docs/superpowers/plans/2026-05-31-rls-storage-audit-hardening.md`
- **app_audit_logs (non-blocking)** (1 connections) — `docs/superpowers/plans/2026-05-31-rls-storage-audit-hardening.md`

## Relationships

- [[Spec: Feature Flags Operator Console]] (2 shared connections)

## Source Files

- `docs/superpowers/audits/2026-06-06-supabase-schema-reconciliation.md`
- `docs/superpowers/plans/2026-05-30-production-saas-hardening.md`
- `docs/superpowers/plans/2026-05-31-rls-storage-audit-hardening.md`

## Audit Trail

- EXTRACTED: 35 (92%)
- INFERRED: 3 (8%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*