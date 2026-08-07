# Telemetry Delivery Latency Benchmark — Q2 2026

**Run by:** Meridian Haulage engineering
**Test window:** 2026-05-04 to 2026-05-15
**Report issued:** 2026-05-27

## Method

Each vendor supplied twelve gateway units, installed on the same twelve tractor
units running the Duisburg–Gliwice–Katowice rotation. Telemetry cadence was
fixed at 5 s for every vendor. Latency is measured from the timestamp stamped by
the gateway at capture to the timestamp at which the record becomes readable
through the vendor's own API.

Approximately 4.1 million samples per vendor over the window. Figures below are
over the full window including border-crossing segments, which is where the
tail sits.

## Results

| Vendor | Platform | p50 | p95 | p99 | Max observed |
|---|---|---|---|---|---|
| Drayfoss Mobility | Corridor | 95 ms | 290 ms | 610 ms | 2.1 s |
| **Kestrel Telemetry** | **FleetLink 3** | 120 ms | **340 ms** | 780 ms | 2.6 s |
| Orbaline | Freight Cloud | 155 ms | 410 ms | 990 ms | 3.4 s |
| Vantor Fleet Systems | VantorOne | 240 ms | 620 ms | 1.9 s | 7.8 s |

## Against the requirement

Procurement's hard constraint is a measured p95 at or below 500 ms.

- Drayfoss passes at 290 ms.
- Kestrel passes at 340 ms.
- Orbaline passes at 410 ms.
- Vantor **fails** at 620 ms.

## Commentary

The Vantor tail is dominated by the transatlantic hop — the system of record is
in the United States, so every European sample crosses the Atlantic twice before
it is readable through the API. Vantor's EU edge cache does not change this,
because the cache is populated from the US system of record.

Drayfoss's numbers are the best in the set, which is consistent with its
positioning and its price.
