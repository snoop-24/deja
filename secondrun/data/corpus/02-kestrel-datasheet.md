# Kestrel Telemetry — FleetLink 3 Product Datasheet

**Vendor:** Kestrel Telemetry B.V. (Eindhoven, NL)
**Product:** FleetLink 3 telematics platform
**Datasheet revision:** 2026-05-30

## Overview

FleetLink 3 is Kestrel's third-generation commercial vehicle telematics stack.
It combines an in-cab gateway unit (the K3 gateway), a cellular backhaul with
dual-carrier failover, and a hosted analytics platform.

## Hardware — K3 gateway

| Attribute | Value |
|---|---|
| Model | K3-220 |
| Cellular | Dual eSIM, LTE Cat-4, 5G NR optional |
| Positioning | GNSS multi-constellation |
| CAN interfaces | 2× FMS, 1× J1939 |
| Operating temperature | −30 °C to +75 °C |
| Firmware branch | 4.x |

## Firmware

The K3 gateway ships from the factory on firmware **4.7.2**. Kestrel maintains
the 4.7 branch as its long-term-support line through at least Q4 2028. Earlier
4.6.x firmware is still supported for fault fixes but is not being certified
against new regulatory annexes.

Customers operating in jurisdictions with a firmware floor should confirm the
shipped build at goods-in; Kestrel will not ship 4.6.x into a new contract.

## Platform capabilities

- Driver-hours capture with tachograph integration
- Cross-border segment tagging (automatic, based on GNSS geofence)
- Fuel and AdBlue consumption telemetry
- Configurable telemetry cadence from 1 s to 300 s
- REST and streaming APIs

## Hosting

FleetLink 3 is hosted in Kestrel's own facilities. The primary region is
Amsterdam with a warm standby in Frankfurt. Both are inside the European Union.
Kestrel does not replicate customer telemetry outside the EU and states this
contractually in clause 11.3 of its standard MSA.

## Support

24/7 for platform incidents. Named account engineer above 200 units.
Standard SLA credits apply against a 99.9% monthly availability target.

## Kestrel FleetLink 3 — compliance status against Meridian's hard constraints

| Constraint | Status | Evidence |
|---|---|---|
| Certification (Annex C) | PASSES | Register ECTR-NL-0412, minimum certified build 4.7.2 |
| Data residency (EU) | PASSES | Amsterdam primary, Frankfurt standby, both in the EU |
| Latency (p95 ≤ 500 ms) | PASSES | 340 ms measured |
| Delivery (≤ 30 days) | PASSES | 21 days for the full 400-unit order |
| Reliability (no unplanned outage > 4 hours in trailing 12 months) | PASSES | No qualifying incident |

**Kestrel passes all five hard constraints.** It is not the cheapest option per
unit — Vantor and Orbaline both price lower — but both of those fail a hard
constraint, and Meridian's selection rule is that price never overrides one.

## Commercial

Pricing is published in the 2026 volume pricing schedule and is not repeated
here. Kestrel prices per-unit per-month with volume tiers, and applies a
route-dependent supplement where a fleet operates cross-border — see the
supplements section of the pricing schedule.
