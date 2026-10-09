# TUR Calculator Made Simple

A browser-only (no backend) single-page app for **test uncertainty ratio (TUR)** per
**ANSI/NCSL Z540.3-2006 3.11**, legacy **TAR**, **probability of false accept / reject** and
**guard bands** (Z540.3 Handbook Methods 1, 5, 6; ILAC G8:09/2019; JCGM 106:2012), with definitions
and step-by-step how-to guidance.

Live: https://stephendperryjr.github.io/tur-calculator/

## Run it

```bash
npm install
npm test            # unit tests for the math (vitest) - checked against published values
npm run build       # type-check + production build -> dist/
npm run preview     # serve dist/ at http://127.0.0.1:4173
npm run dev         # development server with hot reload
node scripts/screenshots.mjs   # smoke test (fails on console errors) + screenshots (needs preview running)
```

## Features

- **TUR calculator** – TUR = (upper limit − lower limit) / (2 × U95). Symmetric ± tolerances built from
  spec terms (% of reading, % of range/FS, ppm of reading/range, counts × resolution, fixed), asymmetric
  (−a/+b, span-based TUR plus near-side ratio) and one-sided limits (practical |limit − nominal| / U95,
  clearly labelled as not a Z540.3 TUR). U95 from a stated U and k, or from an RSS of components
  (normal ÷k, rectangular ÷√3, triangular ÷√6, U-shaped ÷√2, standard), with k = 2, 1.96 or t95(νeff)
  (Welch–Satterthwaite). Configurable required ratio (default 4:1), TAR comparison, guidance when TUR < 4:1.
- **Risk & guard bands** – global PFA/PFR (normal UUT population from true or observed EOPR, normal
  measurement error; adaptive Gauss–Kronrod integration), worst-case PFA over all EOPR, PFA-vs-EOPR chart,
  and acceptance limits/PFA/PFR for: no guard band, w = U95 (ILAC G8:2009 rule / Handbook Method 5),
  Z540.3 Handbook Method 6 (M2% = 1.04 − exp(0.38 ln TUR − 0.54)), RSS (√(L² − U²)), custom r·U95,
  and a numerically solved target PFA. Specific risk for a single reading (JCGM 106 7.3–7.4).
- **Multi-point table** – TUR, pass/fail, acceptance limits and PFA per test point; CSV export.
- **Report** – printable / downloadable HTML report.
- **How-to** and **Definitions** – worked examples (10 V DMM, caliper, pressure gauge, one-sided limit),
  where to find the data, common mistakes, glossary and references.

## Verification (see `src/lib/__tests__`)

| Source | What is matched |
| --- | --- |
| Keysight 5991-1267EN (Dobbert; basis of Z540.3 Handbook Method 6), Table 2 | worst-case PFA at 17 TURs (1.1–19:1) to 3 decimals and the ITP where it occurs; M for 2 % PFA at 6 TURs |
| Z540.3 Handbook Method 6 formula | worst-case PFA with M2% guard band stays at 2 % (1.9–2.06 %, curve-fit error) for TUR 1.2–4.5; M ≈ 0 at 4.6:1 |
| NASA-HDBK-8739.19-4 Table 5-1 | 1 % PFA guard-band multipliers and PFR (4 rows), forward and inverse |
| NASA-HDBK-8739.19-4 Table 5-2 | PFR column (5 rows). The PFA column is not reproduced (non-monotonic; appears inconsistent) |
| Mimbs 2011 (NASA) | 4.6:1 → 2.0 % and 3.33:1 → 2.7 % worst-case PFA; observed 89 % → true EOPR at 10, 4, 3, 2, 1, 0.7:1 |
| ILAC G8:09/2019 Table 1 | specific PFA bounds for w = 3U, 1.5U, 1U, 0.83U, 0, −U |
| Morehouse / Sandia SAND2021-8069 (text) | 4:1 @ 95 % EOPR: PFA < 1 %, PFR ≈ 1.5 %; RSS guard band ≈ 0.6 % PFA, PFR ≈ 2 % → 18 % |

Published risk curves use U95 = 1.96 u; the app defaults to k = 2 (Z540.3 / ILAC G8 practice) and lets
you choose 1.96 or t95(νeff).
