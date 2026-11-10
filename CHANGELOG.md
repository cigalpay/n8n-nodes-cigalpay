# Changelog

## 1.0.0
- CigalPay node: create checkouts (USD or EUR, up to 5,000), get payments by ID or order, list active payments, create and list refunds, list accepted and converted coins.
- CigalPay Trigger node: starts a workflow on signed payment notifications (HMAC-SHA512 checked, unsigned or forged requests refused with 401), paid-only, all or selected statuses, optional skipping of test notifications.
