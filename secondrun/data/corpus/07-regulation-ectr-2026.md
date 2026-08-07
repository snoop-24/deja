# Regulatory Brief — ECTR-2026 and the DE/PL Corridor

**Prepared by:** Meridian Haulage legal and compliance
**Date:** 2026-05-22

## What ECTR-2026 is

ECTR-2026 (European Commercial Telematics Regulation, 2026 revision) governs the
capture, retention and cross-border transfer of commercial vehicle telemetry and
drivers' hours records. It replaces the 2021 framework.

## The annexes, and which one binds us

ECTR-2026 is split into annexes by operating pattern. Only one of them applies
to Meridian.

- **Annex A** — Light commercial vehicles under 3.5t. Not applicable to us.
- **Annex B** — Heavy goods vehicles operating **within a single member state**.
  This is the domestic annex. It is the least demanding of the three and it is
  the one most non-EU vendors certify against first, because it does not require
  cross-border transfer controls.
- **Annex C** — Heavy goods vehicles operating **across an internal EU border**.
  This is the annex that binds Meridian, because 86% of our tractor-unit
  journeys cross the DE/PL border. Annex C adds requirements on transfer
  logging, jurisdiction tagging of each telemetry segment, and tamper-evident
  firmware attestation.

**Certification against Annex B does not satisfy Annex C.** This has been
confirmed with counsel. A vendor certified only to Annex B cannot be used on
this fleet.

## In force date

Annex C obligations take effect **1 September 2026**. There is no transitional
period for new contracts signed after 1 June 2026, which includes ours.

## The firmware attestation requirement

Annex C §4.2 requires that the deployed gateway firmware be at or above the
build that the platform was certified against. Certified builds are recorded per
platform in the ECTR certification register; operators are responsible for
confirming the deployed build meets or exceeds the registered minimum.

Running a build below the registered minimum voids certification for that unit
even if the platform itself is listed as certified. In practice this means
goods-in inspection must check the shipped firmware string against the register
entry before units are put into service.

## Penalties

Operating a non-conforming unit on a cross-border journey carries an
administrative penalty per unit per journey, assessed by the member state of
entry. Poland's implementing act is the more aggressive of the two and assesses
per journey rather than per day.
