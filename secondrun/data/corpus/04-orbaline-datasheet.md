# Orbaline — Orbaline Freight Cloud Product Datasheet

**Vendor:** Orbaline Systems Sp. z o.o. (Wrocław, PL)
**Product:** Orbaline Freight Cloud
**Datasheet revision:** 2026-05-11

## Overview

Orbaline is a Poland-based telematics provider with deep coverage of the
Central European corridor. Orbaline Freight Cloud is its flagship platform and
is widely deployed among Polish carriers.

## Hardware — OB gateway

| Attribute | Value |
|---|---|
| Model | OB-4 |
| Cellular | Dual eSIM, LTE Cat-6 |
| Positioning | GNSS multi-constellation |
| CAN interfaces | 2× FMS, 1× J1939 |
| Operating temperature | −35 °C to +75 °C |
| Firmware branch | 2.x |

## Firmware

The OB-4 gateway ships on firmware 2.9.1, with 2.9.x as the current supported
branch.

## Platform capabilities

- Driver-hours capture with tachograph integration
- Cross-border segment tagging
- Fuel and AdBlue consumption telemetry
- Configurable telemetry cadence from 1 s to 120 s
- REST and streaming APIs
- Strong Polish-language driver app

## Hosting

Hosted in Warsaw with a secondary site in Poznań. Both inside the European
Union. Orbaline does not replicate customer data outside the EU.

## Support

24/7 platform support, Polish and English. 99.9% monthly availability target.

## Orbaline Freight Cloud — compliance status against Meridian's hard constraints

| Constraint | Status | Evidence |
|---|---|---|
| Certification (Annex C) | PASSES | Register ECTR-PL-0188, minimum build 2.9.1 |
| Data residency (EU) | PASSES | Warsaw and Poznań, both in the EU |
| Latency (p95 ≤ 500 ms) | PASSES | 410 ms measured |
| Delivery (≤ 30 days) | PASSES | 18 days |
| Reliability (no unplanned outage > 4 hours in trailing 12 months) | **FAILS** | Unplanned platform outage of **14 hours** on 3 March 2026 |

**Orbaline is disqualified on reliability.** The platform was unavailable to all
customers for 14 hours on 3 March 2026 — from 02:10 to 16:10 CET — which is more
than three times Meridian's four-hour ceiling, and the incident falls inside the
trailing twelve-month window for any evaluation run in 2026. Orbaline is the
cheapest compliant-looking option on paper and this is the only constraint it
fails, so it is the vendor most likely to be recommended in error. Full detail is
in the incident report circulated to customers and prospects.

## Commercial

See the 2026 volume pricing schedule.
