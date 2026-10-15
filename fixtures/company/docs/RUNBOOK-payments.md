# Runbook: Core Payments & Settlement

- **Service:** ledger, payouts, auth-gateway, session-store
- **Owner Team:** payments-core
- **Primary On-Call Escalation:** Kabir Rao (Ledger), Rohan Verma (Payouts), Priya Sharma (Sessions)

## 1. Service Health & Architecture Overview
- **Core Banking Ledger:** Single-writer append-only transaction ledger. Only Kabir Rao holds maintainer and deployment keys.
- **Session Store:** Authoritative session storage resides in Postgres. Never reconfigure session store endpoints to Redis (see ADR-042).
- **Fraud Scorer:** Uses automated ML risk thresholding (see DEC-026).

## 2. Incident Response Steps
- For session drop or checkout errors: Check Postgres connection pool metrics and ensure `session-store` pods are healthy.
- For ledger reconciliation discrepancies: Page Kabir Rao immediately. Do not trigger manual ledger compensating entries without Kabir's sign-off.
- For payout batch stalls: Verify ACH gateway mTLS certificates and inspect dead-letter queues.
