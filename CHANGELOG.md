# Changelog

## 1.1.1
- Node metadata files use the full node identifiers (`n8n-nodes-cigalpay.cigalPay`, `n8n-nodes-cigalpay.cigalPayTrigger`).
- Trigger: the setup notice is gone; the "Trigger On" field description and the README explain the Notification URL.

## 1.1.0
- Ready for n8n verification: built and linted with n8n's official node CLI (`n8n-node build` / `n8n-node lint`), SVG icons with light and dark variants, node metadata files (Finance & Accounting).
- Options listed alphabetically.
- Errors are always reported as n8n node errors, with the item they came from.

## 1.0.1
- Published from GitHub Actions through npm Trusted Publishing, with provenance. No change to the nodes.

## 1.0.0
- CigalPay node: create checkouts (USD or EUR, up to 5,000), get payments by ID or order, list active payments, create and list refunds, list accepted and converted coins.
- CigalPay Trigger node: starts a workflow on signed payment notifications (HMAC-SHA512 checked, unsigned or forged requests refused with 401), paid-only, all or selected statuses, optional skipping of test notifications.
