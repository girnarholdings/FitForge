# Prewalk · Barcode scanning for nutrition logging

**Verdict: substantial — do not implement casually.** Three subsystems, each individually fine,
jointly a real project: camera + decode across both mobile browsers, a barcode→nutrition data
source the app does not currently possess, and a privacy/licensing posture change. Estimate:
2–3 focused sessions to ship something honest, most of it in the data source and iOS fallback.
This document records what was found so the eventual implementation starts warm.

## 1 · Decoding: the platform API does not cover our primary platform

- `BarcodeDetector` (the native Shape Detection API) works on Chrome/Edge/Android — fast, free,
  zero bundle cost.
- **iOS Safari does not ship it** (WebKit has it behind no stable flag), and iPhone Safari at
  390×664 is this app's *primary design target*. So the native path alone strands the main
  audience.
- The proven fallback is a WASM decoder (`zxing-wasm`, ~400–900 KB) or a JS one (`quagga2`,
  lighter but EAN-only and noticeably worse in low light). Either must be a lazy route-level
  chunk — this app's whole performance story is not shipping what people aren't using.
- Practical shape: feature-detect `BarcodeDetector`, else lazy-load zxing-wasm; both feed the
  same `onBarcode(gtin)` callback. Camera itself is plain `getUserMedia` + `<video>` (HTTPS
  already enforced), plus permission-denied and no-camera states, torch toggle where supported.
- Testing cost is real: CI cannot point a webcam at a Coke can. The decode layer needs a
  fixture-stream harness (feeding a pre-recorded frame into the detector) or it ships untested.

## 2 · Data: we own no barcodes

- The shipped catalogs (509 curated + the USDA tier-2 shards) carry **no GTIN/UPC column** — the
  tier-2 pipeline imported USDA's *generic* foods, and barcodes live on *branded* products.
- The realistic source is **Open Food Facts** (~3M products, ODbL licence):
  - **Live client calls** are the wrong answer: a third-party request carrying every product the
    user scans, on an app whose stated position is that browsing your own food log talks to
    nobody.
  - **Worker proxy** is the right answer if built: `GET /barcode/:gtin` on the existing cache
    worker, normalising OFF's response to the app's `Food` shape, cached at the edge
    (`Cache-Control: immutable`-ish; product data changes rarely). Adds: ODbL attribution
    requirement in the UI, OFF availability as a dependency, and honest handling of the ~30–50%
    scan-miss rate outside the EU (fallback: prefill the create-your-own sheet with the scanned
    code so the miss still ends in a logged food).
  - **Pre-built shards** do not fly: even pruned to `gtin → name + macros` the useful subset is
    tens of MB — not static-export material.

## 3 · Where it would land in the product

- Entry point: a scan icon in the nutrition composer and in the Find-a-food sheet.
- Hit → the existing ReviewSheet row, pre-matched, macros editable like any other item.
- Miss → CustomFoodSheet pre-filled with the barcode as a note, "Save to My foods" on — so the
  SECOND scan of the same product hits locally without OFF at all. My Foods as a personal
  barcode cache is the cheapest good idea here: store `gtin` on custom foods and check it before
  the network.

## 4 · Recommended sequencing (when wanted)

1. Worker: `/barcode/:gtin` proxy + edge cache + OFF attribution string (½ session).
2. Client: scanner sheet with `BarcodeDetector` fast path only — ship Android-first behind the
   feature detect, with graceful "your browser can't scan yet" copy on iOS (½ session).
3. iOS: zxing-wasm lazy chunk + the fixture-stream test harness (1 session).
4. `gtin` field on My Foods for the local-first repeat-scan path (small).

Steps 1–2 alone would be a shippable slice; it is step 3 (the platform that matters most) that
makes the feature substantial.
