# Meridian Haulage — Fleet Profile and Procurement Constraints

**Document owner:** Procurement, Meridian Haulage GmbH
**Revision:** 2026-06-14
**Classification:** Internal

## Fleet composition

Meridian Haulage operates a mixed heavy-goods fleet out of two depots, Duisburg
(DE) and Gliwice (PL). As of the June 2026 count:

| Class | Units | Primary route band |
|---|---|---|
| Tractor units (40t) | 312 | Duisburg – Gliwice – Katowice |
| Rigid box (18t) | 74 | Regional DE |
| Light support vehicles | 14 | Depot-local |
| **Total addressable units** | **400** | |

All 400 units are in scope for the telematics refresh. Procurement has been
explicit that the tender is priced at **400 units** and that no vendor may quote
against a smaller notional fleet to reach a lower headline tier.

## Operating pattern

86% of tractor-unit journeys cross the DE/PL border at least once per shift.
This is the single most important fact about our operating pattern and it drives
most of the constraints below. Vendors have repeatedly quoted us domestic-only
pricing, which is not applicable to this fleet.

## Hard constraints

The following are pass/fail. A vendor failing any one of them is out, regardless
of price.

1. **Regulatory.** The platform must satisfy the certification regime that
   applies to cross-border commercial telematics in the DE/PL corridor from
   1 September 2026. See the regulation brief in this corpus.
2. **Data residency.** Telemetry and driver-hours records must be processed and
   stored inside the European Union. See the data residency memo.
3. **Latency.** Measured p95 telemetry delivery latency must be at or below
   500 ms under the benchmark load profile.
4. **Delivery.** Hardware must be deliverable in volume inside a 30-day window
   from purchase order, because the current units come off contract on
   31 October 2026.
5. **Reliability.** No unplanned platform outage exceeding four hours in the
   trailing twelve months. This was added after the 2025 review and is not
   negotiable; a single long outage strands drivers at the border.

## Selection rule

Among vendors that pass all five hard constraints, choose the lowest total
per-truck monthly cost at our actual volume, inclusive of any route-dependent
supplements. Price never overrides a hard constraint.

## What procurement needs back

A single recommended vendor, with the per-truck monthly figure at 400 units that
we would actually pay, and the evidence for each hard constraint.
