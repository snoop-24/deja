# Customer Incident Report — Orbaline Freight Cloud

**Issued by:** Orbaline Systems Sp. z o.o. to customers and active prospects
**Incident date:** 3 March 2026
**Report issued:** 17 March 2026
**Classification:** Sev-1, unplanned

## Summary

On 3 March 2026 the Orbaline Freight Cloud platform was unavailable to all
customers for **14 hours**, from 02:10 CET to 16:10 CET. Telemetry ingest,
the driver app, the customer web console and the API were all affected.
Gateways buffered locally and back-filled once service was restored; no
telemetry was permanently lost.

## Duration

The outage ran **14 hours** end to end. This is the longest unplanned outage in
the platform's history. The previous longest was 40 minutes, in 2024.

## Cause

A schema migration against the primary telemetry store was applied without the
intended online-migration path. The migration acquired a table-level lock on the
ingest hot path. The rollback procedure had not been rehearsed against a table
of production size and itself took nine hours to complete.

## Customer impact

- Real-time tracking unavailable for the full 14 hours.
- Drivers' hours records were not queryable during the window, which forced
  several customers into manual paper fallback at border checks.
- SLA credits were issued to all affected customers under the 99.9%
  availability commitment.

## Remediation

- Online-migration tooling is now mandatory for all schema changes.
- Rollback procedures are rehearsed quarterly against production-size data.
- A staged ingest bypass was added so that ingest survives a control-plane
  failure.

Orbaline states that no comparable incident has occurred since.

## Note for procurement

Buyers with a contractual reliability floor should note that this incident falls
inside the trailing twelve-month window for any evaluation conducted in 2026.
