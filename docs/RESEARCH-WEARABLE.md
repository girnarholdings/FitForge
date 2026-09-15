# Research · FitForge Band: hardware + software integration and India/China manufacturing cost

Date: 2026-09-14

Research caveat: primary pages were egress-blocked in the research environment. Figures come from search snippets and from GitHub-indexed copies of primary text. Twelve research lenses and eight verification passes fed this brief. Every number carries a tag: verified / secondary / estimate. The mark ⚠ flags a number that is unverified, corrected, refuted or blog-grade. Where the files are silent the text says "not found". Where verification changed a number, the text says "(corrected in verification)". Each cite key in square brackets maps to the Sources section.

FX rate: every INR to USD conversion uses Rs 95.7 per USD, the 14 Sep 2026 BookMyForex spot (secondary) [BookMyForex]. Trading Economics printed 95.834 the same day [Trading Economics]. The India research files used Rs 85. Verification corrected that rate as about 12 percent stale.

Reader: KT, owner of FitForge. Frame: risk and reward, bounded downside, optionality.

## 0. TL;DR verdict

1. There is a narrow opportunity. No band at US$99.99 to US$359 per year ships validated automatic exercise and rep detection. Amazfit Helio Strap claims 25 movements with no published validation [DC Rainmaker]. Garmin ships auto rep counting at a blog-reported 80-90 percent on isolated arm moves ⚠ [Garmin rep blog]. Whoop automated strength load in Feb 2026 and promises 1RM estimation in Nov 2026, but still counts no reps [Whoop 2026 update] [Whoop what's new]. FORT, a YC W26 startup, attacks the same gap and slipped to Q2 2027 [FORT].
2. The screenless shell is a commodity. Helio Strap and Google Fitbit Air sell at US$99.99 with no subscription [BusinessWire Helio] [Fitbit Air]. The value sits in plan-aware detection inside the app KT already owns.
3. The science supports one upper-arm IMU on a closed exercise set. Recognition reaches 94 to 99 percent. Rep counts are within ±1 rep in 93 percent of sets (corrected in verification) [RecoFit PDF]. The band cannot see leg machines, load or bar velocity.
4. Custom hardware costs (estimate): China JDM ex-works US$18-28 at 5k units. India own-design US$22-35 at 5k [China lens]. No public per-unit India EMS quote exists. RFQs are the only way to close that gap.
5. US duty, Sept 2026 (corrected in verification): India 0 percent and China 7.5 percent if the band enters under HTS 8517.62.00 (secondary: the CBP exemption annex was not read line by line). If CBP follows the Whoop ruling into heading 9031, India pays about 11.7 percent and China about 39.2 percent [CBP forced-labor HTS list] [CBP N339661]. A binding ruling decides which country wins.
6. Program cash (estimate): S1 SDK band plus app, US$26-60k to 1,000 units plus integration labour. S3 China JDM, US$53-137k to 1,000 units and US$208-372k to 10,000. S2 India custom design, US$232-881k to 1,000 because the MOQ prior is 5,000. Timelines: S1 3-9 months, S2 and S3 12-24 months (estimate, no India EMS lead time found).
7. The regulatory lane is open if claims stay in wellness. FDA reissued the General Wellness guidance on 6 Jan 2026 [Covington FDA]. Whoop's blood-pressure feature drew a warning letter on 14 Jul 2025, closed 17 Jun 2026 [FDA closeout].
8. Software comes first and needs no hardware. ForgeBridge v1, the idempotent health store and the sync denylist exist in the repo. Band events need one new append-only store, `fitforge.band.v1`, never the LWW bundle.
9. First 90 days: run rep-detection trials on Polar Verity Sense or Bangle.js 2 against real FitForge plans. Send the Appendix A RFQ to two Indian EMS and two Shenzhen JDMs. File a CBP binding-ruling request.
10. Kill hardware if closed-set recognition stays under 90 percent after calibration, if JDM quotes exceed US$30 at 5k with no raw-data SDK, or if Fitbit Air, Helio Strap 2, Whoop or FORT ship validated auto rep counting first.

## 1. What the device is

### 1.1 FitForge Band v1 spec sheet

Synthesis from the hardware lens plus corrections. Every line is an estimate unless tagged.

| Item | v1 target | Basis | Confidence |
|---|---|---|---|
| Form factor | Screenless module on a textile upper-arm sleeve. Wrist variant second. | Upper arm beats forearm and wrist for PPG under motion [PMC12788198]. Polar Loop module 42 x 27 x 9 mm, 29 g [Polar Loop manual]. | verified placement; estimate design |
| Optical sensor | Integrated PPG module, green + red + IR, 25 Hz continuous, 50-100 Hz inside sets. | Whoop 5.0 samples at 26 Hz [WHOOP 5.0 support]. MAX86171-class or Goodix GH3220/GH3026-class AFE. | secondary rate; estimate part |
| Motion sensor | Bosch BMI270 6-axis. Gyro duty-cycled inside sets only. | In-tree Zephyr driver [Zephyr BMI270]. Normal A+G 685 uA, Performance 970 uA, Low Power 420 uA at 25 Hz (corrected) [Bosch BMI270 DS]. | verified |
| Skin temperature | NTC thermistor. Digital IC only on a premium variant. | Whoop 4.0 used MAX6631MTT [TechInsights WS40]. FitForge has no temperature consumer today [FitForge repo]. | verified |
| MCU / radio | nRF52840-class SoC, BLE 5. Check nRF54L15 supply before design freeze. | Nordic called nRF52 "running out of steam" on its Q3 2025 call [Nordic Q3 2025]. Ultrahuman Ring AIR is the single-nRF52840 precedent [Nordic Ultrahuman]. Whoop 4.0 was dual-processor (corrected) [TechInsights WS40]. | verified |
| Battery | 150-200 mAh Li-Po. 5 days at 1.0 mA on 150 mAh. 7 days needs 180-200 mAh. 1.3 mA needs about 200 mAh for 5 days. | Helio Strap 232 mAh, 10 days [Amazfit FAQ]. Polar Loop 170 mAh, 8 days [Polar Loop manual]. Whoop 5.0 claims 14+ days [WHOOP 5.0 support]. | secondary comps; estimate draw |
| Water rating | IP68 target. 5 ATM only if swim use is required. | Helio Strap 5 ATM [Amazfit FAQ]. Polar Loop 30 m [Polar Loop manual]. | secondary |
| Screen | None. LRA haptic and one LED. | Segment norm: Whoop, Helio Strap, Polar Loop, Garmin Index, Fitbit Air. | verified |
| Storage | 8-16 MB QSPI NOR. Log 14 days of aggregates and set events. | Whoop stores up to 14 days unsynced [WHOOP catching up]. | verified requirement; estimate part |
| Firmware | Zephyr / nRF Connect SDK, MCUboot + MCUmgr SMP DFU over BLE, TFLite Micro classifier. | In-tree drivers and DFU path [sdk-nrf FOTA] [tflite-micro]. | verified |
| BLE profile | HRS 0x180D + BAS 0x180F + DIS 0x180A + custom Set-Event service + NUS debug. | Section 6.2. | estimate |
| Target BOM | MVP about US$25 at 10k and US$18 at 100k, ex-works. | Section 3 tables. | estimate |
| Target retail | US$149 working assumption. Floor US$99.99, premium no-sub tier US$169.99-199.99. | Section 2 price ladder. Bolt MSRP multiple 2.5-4x (corrected) [Bolt Part 4]. | estimate |
| Weight | Under 30 g module plus strap. | Helio Strap 20 g [Amazfit FAQ]. Polar Loop 29 g [Polar Loop manual]. | secondary |

### 1.2 Honest scope: what the band can and cannot detect

What it can do:

- Confirm and count upper-body and compound free-weight sets on a closed candidate set. RecoFit reached 99 / 98 / 96 percent on circuits of 4 / 7 / 13 exercises with one arm-worn IMU [RecoFit MSR]. Rep counts were within ±1 rep 93 percent of the time (corrected) [RecoFit PDF].
- Count reps on a wrist smartwatch with a mean error of 1.12 reps on a mean 9.65-rep set (corrected: mean, not median) [MiLift].
- Recognise 10 exercises at 94 percent from a smartwatch alone on unseen subjects [MM-Fit].
- Track sleep and resting heart rate with known bias. WHOOP versus PSG: 2-stage agreement 89 percent, wake specificity 51 percent, kappa 0.49 [PubMed 32713257].

What it cannot do:

- See leg-machine work or static holds from an arm sensor. Wrist-only F1 fell to 58-67 on WEAR. An ankle lifted it to 68-75 (corrected) [WEAR repo].
- Measure load. No IMU senses weight. Weight comes from the FitForge prescription or user entry [PMC8038306].
- Claim bar velocity. Beast Sensor and Bar Sensei were the least valid devices in squat and power clean [PMC7404723].
- Deliver clinical HRV. PPG gives pulse-rate variability. Dial 2025 put WHOOP 4.0 nocturnal rMSSD at CCC 0.94 against a Polar H10 [Dial 2025].
- Read heart rate cleanly at the wrist during lifting [PMC13358589]. The upper arm is the fix.

Product rule: the band solves a verification problem, not open-world recognition. The player knows the next exercise. The band confirms it and counts.

## 2. Competitive landscape

### 2.1 Table

| Device | Price | Subscription | Sensors | Strength auto-tracking | Where made | Cite |
|---|---|---|---|---|---|---|
| Whoop 5.0 / MG | US$199 One, US$239 Peak, US$359 Life per year, hardware bundled in the US (verified). May 2026 unbundled test in Australia: device AUD 139 + AUD 300 per year (secondary). IPO signalled in 18-24 months. | Yes, mandatory | Ambiq Cortex-M4 + BLE, TDK 6-axis IMU, ADI PPG/ECG AFE, 26 Hz PPG, 14+ days (verified) | Strength Trainer is user-logged. Passive MSK (Feb 2026) auto-estimates load. AI workout builder parses sets and reps from text or screenshots. Automatic 1RM estimation promised for Nov 2026. No rep count or exercise ID found. | China-assembled; band attached and firmware loaded in the US (verified) | [Whoop Life] [TechInsights WG50] [Whoop 2026 update] [Whoop what's new] [G&W Whoop pricing] [CBP N339661] |
| Oura Ring 4 | US price not found | Yes; fee not verified | 18-path PPG, Bosch accel, NTC temp, 26 mAh ⚠ (secondary) | None found | Not verified | [EDN Oura] [Oura S-1] |
| Amazfit Helio Strap | US$99.99 (corrected) | None | BioTracker 6.0, 5 PD + 2 LED, accel, gyro, temp, geomagnetic, BT 5.2, 232 mAh, 10 days, 5 ATM, 20 g | Auto-recognises 25 strength movements with sets, reps, rest (secondary, unvalidated) | Zepp Health ODM stack, China; factory not found | [BusinessWire Helio] [Amazfit FAQ] [DC Rainmaker] |
| Amazfit Helio Strap Pro | US$199.99, Jun 2026 | None | Upper-arm HR strap + waist motion sensor, up to 40-day battery | Tracks eight HYROX movements | Zepp, China | [BusinessWire Helio Pro] |
| Polar Loop | US$199.99 / GBP 149.50 | None | Precision Prime PPG + accel, 170 mAh, 8 days, 29 g, 30 m, BT 5.1 | Automatic training detection; no rep count found | Not found | [Polar Loop PR] [Polar Loop manual] |
| Garmin Index Sleep Monitor | US$169.99 | None | Upper-arm sleep band: HRV, breathing, skin temp, pulse ox, 7 nights | None (sleep only) | Not found | [Garmin Index] |
| Garmin watches (strength feature) | Not researched | None | Wrist PPG + IMU | Auto rep counting blog-reported at 80-90 percent on isolated arm moves; poor on bench, squat, deadlift ⚠ (blog). No vendor accuracy published. Peer review not found. | Not found | [Garmin rep blog] |
| Google Fitbit Air | US$99.99; Curry edition US$129.99. Ships 26 May 2026 | Not stated in the file | 24/7 HR, AFib alerts, about 1 week battery | Not found | Not found | [Fitbit Air] |
| Ultrahuman Ring AIR | INR 28,499, about US$298 | None | nRF52840, 24 mAh, up to 5 days (verified); 6 days after a firmware update (secondary) | None found | Bengaluru, India, then Plano, Texas (corrected) | [Smartprix Ultrahuman] [Nordic Ultrahuman] [Ultrahuman battery blog] [Ultrahuman Plano] |
| Xiaomi Mi Band 8 | Not found | Not found | Goodix GH3026 + Bosch BHI260AP + Ambiq Apollo3 Blue ⚠ (secondary) | Not found | Zepp/Huami-built line (secondary) | [AuroraOS] |
| Apple Watch | Not found | Not required | Wrist PPG + IMU | StrengthControl app recognised 88.4 percent of 363 barbell sets; rep count valid for squat and deadlift, not bench | Compal / Luxshare, primarily (secondary) | [PMC8471343] [Foxconn notes] |
| FORT | US$289 early-bird, US$309 pre-order with first year, US$349 retail + US$80/yr | Yes after year one | Screenless wrist band; claims rep velocity and proximity to failure | Claims automatic rep, set, rest detection. Ship date slipped from Q3 2026 to Q2 2027 | Not found | [FORT] |
| Indian brands: Noise, boAt, Fire-Boltt | Fire-Boltt floor INR 899-2,199, about US$9-23 ⚠ (blog) | None | Screened budget smartwatches | Not found | India: boAt 75.83 percent local in Q1 FY26; Optiemus and Dixon assemble | [BS 21 Nov 2025] [Nalanda] |

Market context: India smartwatch ASP was US$26.5 in 2025 while volumes fell 17.6 percent [FoneArena IDC]. India smart-ring shipments fell 30.6 percent in 2025 with ASP down to US$160 (corrected) [TechCrunch India rings].

### 2.2 Strategic read

The screenless-band segment got crowded between June 2025 and June 2026. Helio Strap launched 24 Jun 2025 at US$99.99 [BusinessWire Helio]. Garmin Index Sleep Monitor launched 18 Jun 2025 at US$169.99 [Garmin Index]. Polar Loop launched 3 Sep 2025 at US$199.99 [Polar Loop PR]. Fitbit Air landed 7 May 2026 at US$99.99 [Fitbit Air]. Helio Strap Pro landed 18 Jun 2026 at US$199.99 [BusinessWire Helio Pro]. A Helio Strap 2 sits in FCC filings with an Aug to Nov 2026 window [Helio Strap 2].

The price ladder is fixed. US$99.99 is the floor for a 24/7 HR, HRV, sleep and temperature band from a brand with an app. US$169.99-199.99 is the premium no-subscription tier. US$199-359 per year is the subscription tier, hardware bundled in the US. Whoop's Australian test of AUD 139 plus AUD 300 per year shows that even the bundle is now in play (secondary) [G&W Whoop pricing].

Capital prices recurring revenue, not bands. Whoop raised US$575M at US$10.1B on 31 Mar 2026 with a US$1.1B bookings run rate and 2.5M members [Whoop Series G]. Oura filed an S-1 on 3 Sep 2026: nine-month revenue US$1.21B, 5.0M paid members, 55 percent gross margin, 89 percent membership gross margin, about 85 percent 12-month retention [Oura S-1]. Fitbit's hardware-only GAAP gross margin ran about 42.7 percent in 2017 (derived from the FY2018 10-K), 39.9 percent in 2018 and 29.8 percent in 2019; the often-quoted 43 percent is the 2017 non-GAAP figure (corrected) [Fitbit 10-K 2019] [Fitbit 10-K 2018]. Zepp Health printed 38.2 percent in Q3 2025 (later quarters not checked) [Zepp Q3 2025].

Where FitForge's edge is:

- No band in the US$99.99-359 range ships validated automatic exercise and rep detection. Helio Strap claims 25 movements without validation [DC Rainmaker]. Garmin's rep counting is blog-rated at 80-90 percent on isolated moves and poor on compound lifts ⚠ [Garmin rep blog]. Whoop's Passive MSK automates load, not reps [Whoop 2026 update]. FORT claims the full feature and has not shipped [FORT].
- FitForge already knows the planned exercise, target reps and load. That turns open-world recognition into a small-candidate verification task. RecoFit shows the gain: 99 percent at 4 candidates versus 96 percent at 13 [RecoFit MSR].
- The graveyard is real. Atlas Wristband died on accuracy and scale, then Peloton cancelled its successor [Wareable Atlas]. Amazon killed Halo in 2023 and deleted the data [Amazon Halo]. The base rate for standalone strength wearables is near total loss. The base rate for a feature inside an existing app is unmeasured.

Conclusion: treat the sensor as a distribution cost for the software. Do not compete on the shell.

## 3. Hardware architecture and BOM

### 3.1 Architecture

Benchmarks:

- Whoop 4.0 was a two-processor design (corrected). A Maxim MAX32652 ran the application. The nRF52840 ran BLE. The AFE was a MAX86171. A MAX77818 handled power and fuel gauge. A MAX6631MTT read temperature [TechInsights WS40]. Its Sila cell gained 17 percent energy density, not 20 (corrected) [TechInsights Sila].
- Whoop 5.0 moved to one Ambiq Cortex-M4 MCU with integrated BLE at about US$2.67 ASP ⚠ (secondary), a TDK 6-axis IMU and an ADI PPG/ECG AFE on its own flex [TechInsights WG50] [RBA Ambiq memo]. That bought 14+ days and ECG without a bigger cell.
- Ultrahuman Ring AIR runs a lone nRF52840 on a 24 mAh cell [Nordic Ultrahuman]. Polar Loop lists a 64 MHz processor, 1.3 MB memory and 16 MB storage, consistent with an nRF52840-class SoC plus external flash (inference) [Polar Loop manual].

Recommended v1 stack (estimate): nRF52840 or nRF54L15 + BMI270 + integrated PPG module at 25 Hz + NTC + 150-200 mAh cell + BQ25180 or nPM1100 + 8 MB QSPI NOR + LRA. Zephyr ships in-tree drivers for BMI270, BMI323, BMA4xx, ICM-42688, LSM6DSO, MAX30101 and TMP11x [Zephyr BMI270]. No in-tree driver exists for ADPD4100, AFE4900, MAX86171/86176 or PAH8013. A premium AFE needs a vendor driver port (verified negative search) [Zephyr sensors].

Power budget (estimate): MCU + BLE 0.15-0.40 mA; accel at 50-100 Hz 0.02-0.10 mA; PPG at 25 Hz 0.4-1.0 mA; workout boost 0.3-0.8 mA for 1-2 h per day; SpO2 spot checks 5-10 mAh per night. Result 0.8-1.3 mA. At 1.0 mA, 5 days needs 120 mAh and 7 days needs 168 mAh. With 80 percent usable depth and ageing margin, spec 150 mAh for 5 days and 180-200 mAh for 7 days. Field check: Helio Strap 232 mAh / 240 h = 0.97 mA; Polar Loop 170 mAh / 192 h = 0.89 mA (estimate from verified capacities) [Amazfit FAQ] [Polar Loop manual]. Radio peaks: nRF52840 4.8 mA TX at 0 dBm and 4.6 mA RX with DC/DC at 3 V; the v3.0 brief lists 6.40 / 6.26 mA under other conditions [nRF52840 brief].

### 3.2 Verified price anchors

| Part | Price | Tier | Source | Confidence |
|---|---|---|---|---|
| nRF52840-QIAA-R | US$6.78 qty 1; US$4.07 on a 3,000 reel | Digi-Key, not re-observed | [Digi-Key nRF52840] | ⚠ unverifiable |
| nRF52840-QIAA-R7 / -T | US$7.50 / US$7.35 | qty 1, Mouser | [Mouser nRF52840] | verified |
| Bosch BMI270 | US$4.23 | qty 1, Digi-Key | [Digi-Key BMI270] | verified |
| Goodix GH3220 PPG/ECG AFE | US$2.53 | JLCPCB list; second seller CNY 17.33 | [JLCPCB GH3220] | verified |
| Goodix GH3026 | about US$3 ⚠; one Shenzhen snippet CNY 7.94, about US$1.10 | single qty | [threkir BOM] [SZYJC GH3026] | ⚠ unverifiable |
| PixArt PAH8011 | about US$2 ⚠ (threkir) versus "from US$4.8972" on a stale Mbed listing ⚠ | single qty | [threkir BOM] [Mbed PAH8011] | ⚠ conflicting |
| MAX86171ENI+ | from US$2.16 ⚠ tier unconfirmed | LCSC | [LCSC MAX86171] | ⚠ secondary |
| MAX86177 | about US$6 ⚠ | single qty | [threkir BOM] | ⚠ unverifiable |
| TI BQ25180YBGR | US$3.01 qty 1; tiers US$2.253 / 1.854 / 1.723; Mouser down to US$1.58 | Digi-Key, Mouser | [Digi-Key BQ25180] | verified |
| Ambiq MCU in Whoop 5.0 | about US$2.67 ASP ⚠ | teardown-cited | [RBA Ambiq memo] | secondary |
| 601520 150 mAh Li-Po | US$2-3 | single piece retail | [YDL 601520] | verified small qty |
| JLCPCB SMT | US$0.0017 per joint, US$7-8 setup, US$1.50 stencil, US$3 per extended part | economic assembly | [JLCPCB assembly] | verified |
| nPM1100, MAX86176/86178, curved cells, straps | not found | | | not found |

### 3.3 Minimum-viable band BOM (USD per unit, ex-works)

Method: two verified anchors interpolated to 1k / 10k / 100k. Every other line is a commodity estimate. Excludes NRE, tooling, certification, duties, yield and logistics.

| Line | Candidate part | 1k | 10k | 100k | Basis | Confidence |
|---|---|---|---|---|---|---|
| BLE SoC | nRF52840-QIAA-R | 5.50-6.50 | 3.80-4.10 | 2.75-3.50 | from US$6.78 / 4.07 | estimate |
| IMU | BMI270 | 3.00-3.80 | 2.20-2.80 | 1.50-2.20 | from verified US$4.23 | estimate |
| PPG | integrated module, MAX86171 / GH3220 / PAH8013 class | 3.00-6.00 | 2.50-4.50 | 1.80-3.50 | GH3220 US$2.53 anchor; PAH8011 anchors conflict ⚠ | estimate |
| Skin temp | NTC 0402 | 0.05-0.15 | 0.04-0.10 | 0.03-0.08 | commodity | estimate |
| Battery | 150 mAh Li-Po | 1.50-3.00 | 1.20-2.00 | 0.90-1.50 | US$2-3 retail anchor | estimate |
| Charger / PMIC | BQ25180 or nPM1100 | 0.80-1.50 ⚠ | 0.60-1.10 ⚠ | 0.45-0.90 ⚠ | distributor tiers show US$1.58-1.72; line is 10-50 percent low | estimate |
| Passives, crystals, antenna, LDO | | 1.00-2.00 | 0.80-1.50 | 0.60-1.20 | commodity | estimate |
| External flash | 8-16 MB QSPI NOR | 0.50-1.00 | 0.40-0.80 | 0.30-0.60 | commodity | estimate |
| Haptics | LRA + driver | 0.80-1.50 | 0.60-1.20 | 0.50-1.00 | commodity | estimate |
| PCB | 4-6 layer HDI + flex | 2.00-4.00 | 1.20-2.50 | 0.80-1.80 | JLCPCB rates | estimate |
| SMT + test | EMS | 2.50-4.00 | 1.50-2.50 | 1.00-1.80 | JLCPCB per-joint anchor | estimate |
| Enclosure | 2-shot PC/silicone, window, pogo | 2.50-5.00 | 1.50-3.00 | 1.00-2.00 | tooling separate | estimate |
| Strap | textile or silicone + buckle | 2.00-4.00 | 1.50-3.00 | 1.00-2.00 | China MOQ 1,000 for custom straps | estimate |
| Dock / cable | USB-C to pogo | 2.00-3.50 | 1.50-2.50 | 1.00-1.80 | commodity | estimate |
| Packaging | box, inserts, manual | 0.80-1.50 | 0.60-1.00 | 0.40-0.80 | commodity | estimate |
| Sum of lines | | 27.95-47.45 | 19.94-32.60 | 14.03-24.68 | arithmetic | estimate |
| File total (rounded) and likely | | 28-47, likely 36 | 20-33, likely 25 | 14-25, likely 18 | [Hardware lens] | estimate |

Arithmetic check at 1k low: 5.50 + 3.00 + 3.00 + 0.05 + 1.50 + 0.80 + 1.00 + 0.50 + 0.80 + 2.00 + 2.50 + 2.50 + 2.00 + 2.00 + 0.80 = 27.95. The other five sums follow the same lines. The rounded file totals match. If the charger line is raised to the BQ25180 tier of US$1.58-1.72, the 1k total rises by about US$0.2-0.8.

### 3.4 Premium band BOM (ECG + SpO2 + skin-temp IC + gyro)

Changes versus the MVP table, USD per unit at 1k / 10k / 100k, all estimates from the hardware lens:

| Change | 1k | 10k | 100k |
|---|---|---|---|
| Discrete PPG/ECG AFE (MAX86176 or ADPD4100 class) | 5.00-9.00 replaces 3.00-6.00 | 4.00-7.00 replaces 2.50-4.50 | 3.00-5.00 replaces 1.80-3.50 |
| Multi-LED and photodiode optics | +1.50-3.00 | +1.20-2.20 | +0.90-1.60 |
| ECG electrodes and contacts | +0.80-1.50 | +0.60-1.00 | +0.40-0.80 |
| Digital skin-temp IC (TMP117 / MAX30208 class) | 1.50-3.00 replaces 0.05-0.15 | 1.20-2.20 replaces 0.04-0.10 | 0.80-1.60 replaces 0.03-0.08 |
| Higher-density cell | +1.00-2.00 | +1.00-2.00 | +1.00-2.00 |
| Premium enclosure | +2.00-4.00 | +2.00-4.00 | +2.00-4.00 |
| Sum of lines (arithmetic) | 36.70-63.80 | 27.40-46.40 | 20.30-36.10 |
| File total and likely | 38-68, likely 50 | 28-47, likely 36 | 20-35, likely 26 |

Arithmetic at 1k low: 27.95 - 3.00 + 5.00 + 1.50 + 0.80 - 0.05 + 1.50 + 1.00 + 2.00 = 36.70. At 1k high: 47.45 - 6.00 + 9.00 + 3.00 + 1.50 - 0.15 + 3.00 + 2.00 + 4.00 = 63.80. The file's 1k and 10k totals sit US$0.6-4.2 above the itemised lines. Its 100k total sits US$0.3-1.1 below them. The file did not itemise the difference. An optional Ambiq MCU was assumed at US$5-8 with no price found. Treat the itemised sums as the defensible numbers.

Sanity check: US$99.99 (Helio Strap) and US$199.99 (Polar Loop) fit a US$15-30 landed BOM at scale under Bolt's 2.5-4x MSRP multiple (corrected) [Bolt Part 4].

### 3.5 Placement, enclosure and water

- Placement: identical Whoop units on the upper arm beat the forearm and wrist. Burpees were the worst case and the upper-arm unit held up best [PMC12788198]. Wrist motion and contact-pressure changes drive artefacts [JMIR Cardio 2025]. Accuracy dips during weight training [PMC13358589].
- Options: one upper-arm sleeve (best PPG, bicep IMU sees most compound and curl reps); a wrist band with PPG gated off during sets; or two pods (highest cost). v1 takes the sleeve.
- Materials: Polar Loop uses a textile band with a stainless buckle at 29 g [Polar Loop manual]. Knit breathes under a sleeve. Silicone is cheaper to mould and easier to seal.
- Water: IP68 is enough for a gym band and cheaper to certify than 5 ATM. Helio Strap carries 5 ATM [Amazfit FAQ]. Polar Loop carries 30 m [Polar Loop manual]. Whoop 5.0's rating was not verified.
- Charging: a pogo dock on USB-C is the lowest-cost sealed option (Polar). Inductive adds a coil and about US$1-2 (estimate).

## 4. India manufacturing (primary path)

### 4.1 Who builds wearables in India

| Company | Location | What is known | Fit for a 5k-25k program | Confidence |
|---|---|---|---|---|
| Dixon Technologies | Noida, B-14/15 Phase-II | 50:50 JV with boAt (Califonix): 30M units/yr audio capacity, 13.44M units in FY25 at 44.80 percent utilisation [BS 21 Nov 2025]. Smartwatches added for the existing customer. Wearables and hearables revenue Rs 175 crore, about US$18.3M, in Q1 FY26 with "healthy operating margin" [Dixon Q1 FY26]. | Brand-anchored, high volume. Fit unclear. | verified |
| Optiemus Electronics | Noida, two plants | Designs and builds hearables for Noise; dedicated wearables plant serving Noise, boAt, Truke; Realme contract for 5M IoT units/yr; Rs 150 crore, about US$15.7M, ramp for laptops, wearables, hearables [EFY Optiemus]. The ">10M units/yr" target is a smartphone-plant figure (corrected). | ODM-capable. Best design-plus-build candidate. | secondary |
| VVDN Technologies | Manesar (7 plants), Pollachi, Vizag | Nine plants with SMT, injection moulding, tooling, HPDC, paint, reliability labs and FATP. Concept-to-market ODM [EE Times VVDN]. No wearable line seen. | Full mechanical stack in-house. | verified |
| Syrma SGS | listed EMS | PCBA and box build; a paid-report blurb says Dixon and Syrma run module-level smartwatch chipset lines ⚠; on the Aug 2026 ECMS approval list [BS 17 Aug 2026]. | Quote source; no wearables record found. | secondary |
| East India Technologies | Greater Noida | Advertises OEM/ODM smartwatch manufacturing (vendor page) [EIT]. | Quote source. | secondary |
| Kaynes Technology | listed EMS | No wearables programme found [BusinessToday EMS]. | Quote source only. | secondary |

Market proof: the domestic-manufacturing share of India smartwatch shipments reached 82 percent in Q3 2023, from 4 percent a year earlier [Counterpoint Q3 2023]. That datum is three years old. boAt's UDRHP puts 75.83 percent of its units made in India in Q1 FY26, from 39.65 percent in FY23 [BS 21 Nov 2025].

### 4.2 What they charge

No public per-unit India EMS conversion or box-build quote for a wearable exists. Two lenses ran 16 targeted searches and found none. No Indian ODM was found selling a stock screenless band design, at any MOQ or price. The owner's "generic tracker sourced from India" question therefore has no priced answer today. The only triangulation is the verifier's own inference: Dixon's Rs 175 crore quarterly wearables and hearables revenue against Califonix's 3.19M units in the same quarter caps EMS revenue near Rs 550 per unit, about US$5.75, including materials if Dixon buys the BoM ⚠ (estimate). Caveat: Califonix is an audio JV, and Rs 175 crore covers Dixon's whole mixed segment, so the cap is an upper bound on an audio-heavy blend, not a band figure. Per-unit numbers must come from RFQs to Dixon, Optiemus, VVDN, Syrma SGS and East India Technologies.

Design-services rates were not found. A derivation from Tata Elxsi's FY25 revenue of Rs 3,729 crore, about US$390M, on about 12,878 staff gives about Rs 29 lakh per employee, about US$30k, or a blended US$15-18 per billable hour ⚠ (verifier derivation) [Tata Elxsi FY25]. Upwork's global embedded median is US$35/hr with a US$25-50 range [Upwork]. A crowdsourced US freelance average is US$104/hr [contractrates].

### 4.3 Schemes

| Scheme | Status | What it means for a band | Confidence |
|---|---|---|---|
| Wearables/hearables PLI | Never found as notified. Only 2021-22 "in the works" coverage with a 7-8 percent industry ask [Business Journal PLI]. | Assume no production subsidy. | estimate |
| PMP for wearables, Budget 2022-23 | Notification 11/2022-Customs, amended by 33/2023. Finished smart watches carry 20 percent BCD under HS 8517 62 90, plus 10 percent SWS on BCD and 18 percent IGST, about 44 percent all-in [CusBuzz] [TaxTMI 33/2023]. Components graded 0-15 percent across FY23-FY26 ⚠ (ladder not retrieved). Scope names "smart rings, shoulder bands, neck bands or ankle bands", so a screenless band is inside PMP. | Finished imports into India are penalised. CKD assembly in India is favoured. The FY27 ladder is not found. Smartwatch display assemblies were excluded from new BCD exemptions: Budget 2026-27 (1 Feb 2026) per one verification pass, CBIC notifications of 8 Jul 2026 per the other ⚠ (date unresolved) [India Briefing customs]. | verified structure; ⚠ rates |
| ECMS | Cabinet approval 28 Mar 2025. Outlay Rs 22,919 crore, about US$2.4B. Six-year tenure plus one-year gestation; capex incentive over five years. Targets Rs 59,350 crore investment (about US$6.2B), Rs 4,56,500 crore production (about US$47.7B), 91,600 jobs [PIB ECMS]. Milestones: 75 projects worth Rs 61,000 crore (about US$6.4B) by 30 Mar 2026 [News On AIR ECMS]; 106 projects by 17 Aug 2026 from 249 applications worth Rs 1.15 lakh crore, about US$12.0B (corrected). The 17 Aug 2026 tranche: 31 proposals, Rs 7,877 crore (about US$823M) across 10 states, Rs 82,243 crore (about US$8.6B) expected production, about 10,000 jobs; approvals named Syrma SGS, Centum Electronics, Sensata, GX Group, Rosenberger, Globe Capacitors and Britannia RFID [BS 17 Aug 2026]. | A band brand is a user of ECMS components, not a beneficiary. The named firms are the first candidate local suppliers to ask. Which projects make cells, HDI PCBs or sensors is not listed. | verified |
| RoDTEP export rebate | Rates generally 0.3-4.3 percent of FOB [Afleo]. Extended only to 30 Sep 2026 by DGFT Notification 74/2025-26 (corrected). The 8517.62 line rate is not found. | Treat as zero after 30 Sep 2026 until renewed. | secondary |
| Duty drawback | AIR rate for 8517 not found. | Brand-rate drawback remains a fallback. | not found |

### 4.4 Local value-add

Not found as a percentage. SMT, moulding, tooling, coating and FATP exist in-house at VVDN and OEL. ECMS is framed around import-dependent components. The BLE SoC, PPG AFE, IMU and cell are imported. Conversion is local; silicon is not. The 82 percent localisation figure measures assembly location, not value-add [Counterpoint Q3 2023].

### 4.5 Compliance for sale in India

| Item | Requirement | Fee and time | Confidence |
|---|---|---|---|
| BIS CRS, device | IS 13252 (Part 1):2010 for smart watches; migration to IS/IEC 62368-1:2023 by 1 Nov 2028 [SIQ BIS] [BIS Annexure]. Start date: consultancy consensus says 23 May 2018; another pass cites S.O. 2742(E) of 17 Aug 2017, effective 17 Feb 2018 ⚠ (unresolved until the gazette is read) [Aleph India BIS]. A screenless band needs a BIS scope confirmation. | Application Rs 1,000 (about US$10); registration up to Rs 53,000 plus GST (about US$554); lab test Rs 20,000-75,000 (about US$209-784) per model; 20-30 working days; valid two years, renewable to five; MSME, startup and women-entrepreneur fee concessions exist ⚠ (consultancy grade) [Corpbiz BIS]. The "Rs 10,000 application + Rs 1 lakh annual licence" figure on one site is the ISI-mark (Scheme I) structure, not CRS. Do not budget it. | verified standard; ⚠ fees |
| BIS CRS, cell | IS 16046 (Part 2):2018 for the Li-ion cell or pack ⚠ (not re-verified) [Standphill IS 16046] | not found | secondary |
| WPC ETA | Self-declaration on Saral Sanchar for 2.4 GHz BLE; DoT OM of 9 Sep 2024; CBIC Instruction 24/2024 tells customs to accept it [Bureau Veritas WPC] [CBIC ETA instruction] | Rs 10,000 per model, about US$104, via Bharatkosh; 1-3 working days ⚠ | secondary (consultancy consensus; one pass found no fee) |
| E-waste EPR | CPCB registration under E-Waste Rules 2022; targets 60 percent FY24-25, 70 percent FY26-27, 80 percent from FY28 (corrected) [CPCB FAQ] | floor price not checked | verified |
| Legal Metrology | Packaged-commodity declarations, MRP, importer LMPC registration | not found | estimate |
| DPDP | Rules notified 13 Nov 2025; tranches 14 Nov 2025, 14 Nov 2026, 14 May 2027; penalties up to Rs 250 crore, about US$26.1M ⚠ (Act schedule, not re-verified) [PIB DPDP] [S&R DPDP] | engineering cost, not a fee | verified dates |

### 4.6 Ultrahuman case study

- Factory model: the first UltraFactory is in Bengaluru, opened 2022 with the debut ring (corrected; Indore is unsupported by any source) [Wikipedia Ultrahuman] [BioSpectrum]. The US UltraFactory in Plano, Texas runs with EMS partner SVtronics, operational since Nov 2024. It opened at 200,000 rings/yr and targets more than 500,000/yr [Ultrahuman Plano]. India capacity, output and unit cost: not found.
- Rationale: COVID-era China volatility and chip shortages left consignments stuck for months ⚠ (partisan investor blog) [Blume]. Revenue about Rs 1,000 crore, about US$104M ⚠ (blog title only) [ajuniorvc].
- Timeline: Ultrahuman bought LazyCo in Apr 2022 and shipped from Aug 2022 ⚠ (about 4 months, company release only). LazyCo had already Kickstarted the ring, so this measures finishing a design, not a design cycle [Fitt Insider LazyCo].
- The ITC lesson: the ITC found Ultrahuman and RingConn infringed an Oura patent on how internal components are arranged inside a ring. Exclusion orders took effect 21 Oct 2025 [Oura ITC blog]. RingConn settled with a royalty licence. Ultrahuman lost its stay bids, redesigned, and re-entered the US with the Ring Pro in Mar 2026 after CBP cleared it [Law360 Ultrahuman] [TechCrunch Ultrahuman Pro]. The winning claim was mechanical packaging, not an algorithm. Freedom-to-operate on form-factor patents must precede tooling. Section 337 hits India-built goods at the US border exactly as it hits China-built goods.

### 4.7 India unit-cost table, 5k / 25k / 100k

The China lens derived the India total as the China JDM BOM plus 15-25 percent at 5k, narrowing to 10-15 percent at 100k, for imported-component logistics, duties and lower line utilisation [China lens]. USD per unit, ex-works, estimates unless tagged.

| Line | 5k | 25k | 100k | Tag |
|---|---|---|---|---|
| China JDM base (GH3026-class PPG, 6-axis IMU, Nordic/Realtek BLE, custom firmware) | 18-28 | 14-22 | 11-17 | estimate [China lens] |
| India uplift factor | x1.15-1.25 (lens) | x1.10-1.20 (interpolated by this brief) | x1.10-1.15 (lens) | estimate |
| India own-design total, the lens row (use this one) | 22-35 | 17-26 | 13-20 | estimate; its floor sits US$1-2 above the uplift arithmetic of 20.7-35.0 / 15.4-26.4 / 12.1-19.6 |
| Imported actives inside the total (SoC, AFE, IMU, cell) | see MVP table tiers | | | estimate |
| EMS conversion charge | not found; RFQ | not found; RFQ | not found; RFQ | not found |
| Component BCD under PMP | FY27 rate not found; assume 0-15 percent ⚠ | | | ⚠ secondary |
| WPC ETA per model, amortised | US$104 / 5,000 = 0.02 | 0.004 | 0.001 | secondary fee |
| Tooling, 3-5 tools at Rs 2-30 lakh each ⚠ | Rs 6-150 lakh = US$6,300-156,700; per unit 1.25-31.3 | 0.25-6.3 | 0.06-1.6 | brief arithmetic on ⚠ inputs (blog range, unsourced tool count) |
| Jigs and fixtures, Rs 60,000-6 lakh each ⚠ | US$627-6,270 each | | | ⚠ marketplace |

Reading: at 5k units the tooling amortisation alone can swing the unit cost by up to US$30. India's edge is not ex-works cost. Its edge is the US duty line and origin marking. Section 5.3 shows that arithmetic.

### 4.8 NRE, MOQ and lead time

- NRE: injection-mould tooling Rs 2-30 lakh per tool, about US$2,100-31,300 ⚠ (single vendor blog). The same blog claims India tooling is 40-60 percent cheaper than EU or US tooling and quotes moulded part cost at Rs 1-60+ per piece ⚠ [Moldrite]. Jigs Rs 60,000-6 lakh, about US$627-6,270 ⚠ [IndiaMART jigs]. Design labour: US$100-500k for a "simple" product per Bolt (c.2015, not inflation-adjusted); a band sits above simple [Bolt make-money]. Parametric: 4,000 h x US$25-50 = US$100-200k ⚠ (illustrative hours, not sourced) [Upwork].
- MOQ: not found for any Indian EMS. The Bolt prior is 5,000 at Chinese CMs [Bolt Part 2]. Chinese ODM MOQ is 1,000 for a custom logo (corrected) [Alibaba OEM/ODM]; J-Style's bulk page puts the first bulk order at 10,000-20,000 units (secondary) [Jointcorp bulk].
- Lead time: not found for India. iSmarch quotes samples 2-4 weeks, pilot 4-6 weeks, mass production 8-12 weeks in Shenzhen [iSmarch].
- Certification labs in India: TUV SUD Bengaluru (10 m semi-anechoic chamber), UL Solutions Bengaluru, STQC labs. Prices not published [TUV SUD Bengaluru].

### 4.9 How a US-based founder engages an Indian EMS

1. No JV is required. Optiemus designs and builds for brands. VVDN sells ODM. Dixon's known wearables work is JV-anchored.
2. Start with the RFQ in Appendix A. Ask for conversion cost, tooling, MOQ, lead time and who holds the BIS and WPC registrations.
3. Entity and registration mechanics (IEC, GST, DGFT, merchant-exporter route) were not found. Exports are zero-rated under IGST section 16 with ITC refund (estimate, statute knowledge) [CBIC GST].
4. Populate the PCBA in India. CBP's Whoop origin determination shows the logic: China assembled the sensor, PCBA, battery and housing, and US band attachment plus firmware loading did not change origin [Federal Register Whoop origin]. Casing and flashing alone in India risk a China origin finding (estimate, origin doctrine).
5. Pull Notification 11/2022-Customs as amended from cbic.gov.in before modelling India import duty on the SoC, AFE, IMU and cell. The FY27 ladder is not in any file.
6. Budget WPC US$104 per model and consultancy-grade BIS fees of about US$770-1,350 per model plus lab time only if the band will be sold in India. Export-only production needs neither.
7. RoDTEP lapses on 30 Sep 2026 unless renewed. Do not model it.

## 5. China manufacturing (secondary path)

### 5.1 Three tiers

| Tier | What you get | Unit cost, USD ex-works, 5k / 25k / 100k | NRE and MOQ | Confidence |
|---|---|---|---|---|
| White-label (Alibaba stock design) | Single-channel PPG (Vcare VC30F or PAH8011 class), 3-axis accel, no gyro, Realtek RTL8762 or Jieli SoC, stock firmware, closed OTA, vendor app (Da Fit class). No raw data. | 9-13 / 8-11 / 7-9 | Logo and packaging US$1-3k; MOQ 1-100 pieces listed ⚠ | ⚠ estimate on a single Alibaba page; sibling page says US$9.80-26.00 [Alibaba screenless] [moyoung-watch] |
| ODM / JDM with SDK (J-Style, iSmarch, Staranb, Starmax) | Goodix GH3026-class multichannel PPG, 6-axis IMU, Nordic or Realtek BLE, custom firmware, raw BLE stream, FCC/CE bundled. | 18-28 / 14-22 / 11-17 | Alibaba guide: ODM MOQ 1,000 at US$25-45 per unit, branding setup US$12-28k, minor firmware US$0-15k (corrected). J-Style OEM MOQ 1,000 with SDK; first bulk 10,000-20,000 (secondary) [Jointcorp bulk]. iSmarch MOQ 2,000-3,000, EXW, samples 2-4 weeks, mass production 8-12 weeks. Staranb about US$15-25 ⚠ with 1-piece samples. Deeper firmware customisation US$30-150k ⚠ (extrapolated). | estimate [Alibaba OEM/ODM] [Jointcorp] [iSmarch] [PulseLoop survey] |
| Ground-up OEM | Own design built by a Shenzhen CM | Alibaba guide: US$18-32 per unit at 5,000 MOQ | NRE US$150-400k, certification US$50-120k, tooling US$30k+ (Alibaba marketing) | ⚠ secondary [Alibaba OEM/ODM] |

Firmware source access is reported to need MOQs up to 50,000 ⚠ (single Alibaba source) [Alibaba smartwatch guide]. Goodix ships its HR/HRV/SpO2 algorithms as a binary library under licence, even inside Core Devices' open PebbleOS [PebbleOS Goodix]. "Raw PPG plus own algorithms" means licensing Goodix or Maxim libraries or writing your own DSP.

Component floor in Shenzhen: JLCPCB economic SMT US$0.0017 per joint, US$7-8 setup, US$1.50 stencil, US$3 per extended part type [JLCPCB assembly]. A 150-200 joint band board costs about US$0.25-0.35 to place at volume (estimate). Rigid-flex is about 6x rigid ⚠ (single note). A JLCPCB 4-layer rate of US$70.6/m2 was unverifiable.

Zepp Health, the accessible large ODM behind the Xiaomi Mi Band line, printed Q3 2025 revenue of US$75.8M, up 78.5 percent, gross margin 38.2 percent and adjusted operating income of US$0.4M (Q3 2025; later quarters not checked) [Zepp Q3 2025]. Goertek and Luxshare are tier-1 and out of reach for a 5k program (estimate) [Foxconn notes].

### 5.2 Like-for-like unit-cost table

| Option | 5k | 25k | 100k | NRE |
|---|---|---|---|---|
| China white-label | 9-13 | 8-11 | 7-9 | US$1-3k |
| China JDM, custom firmware, raw data | 18-28 | 14-22 | 11-17 | US$12-43k platform customisation (corrected) to US$150-400k plus certs plus tooling for ground-up |
| India EMS, own design | 22-35 | 17-26 | 13-20 | design NRE similar; tooling Rs 6-150 lakh ⚠ |
| India white-label (stock band from an Indian ODM) | not found | not found | not found | not found; RFQ to East India Technologies and Optiemus |

All priced rows are estimates from the China lens. No JDM quote with NRE and 5k / 25k / 100k unit prices was found. The 1688 domestic marketplace could not be searched.

### 5.3 Landed cost and tariff comparison into the US, September 2026

Verification resolved the tariff stack. The earlier China-lens stack of about 20 percent for China and 10 percent for India is superseded (corrected).

Timeline (verified): the Supreme Court held on 20 Feb 2026 that IEEPA does not authorise tariffs [Justia SCOTUS]. IEEPA duties stopped on 24 Feb 2026 [White & Case IEEPA]. HTS 8517.62.00 had sat on the 11 Apr 2025 electronics exemption (CSMS 64724565, code 9903.01.32), so wearables in that line never paid the IEEPA reciprocal duty; whether EO 14329's India penalty honoured that exemption is unresolved and matters only for refund claims [CSMS 64724565]. A Section 122 surcharge of 10 percent ran from 24 Feb to 24 Jul 2026 under Proclamation 11012 [FR 2026-03824]. The Court of International Trade struck the Section 122 surcharge down in May 2026; an appeal is pending and Feb-Jul 2026 entries carry refund exposure [Skadden S122]. From 24 Jul 2026, Section 301 forced-labor duties of 10 or 12.5 percent apply to about 60 economies, at 91 FR 47318 [USTR 301 fact sheet]. India sits in the 10 percent tier [PIB India tier]. China sits in the 12.5 percent tier. HTS 8517.62.00 is indexed on the U.S. Note 52(b) exemption list, reported under 9903.05.86, so a band in that line pays no forced-labor duty from either origin; the verifier did not read the annex line by line, so confirm the 8517.62.00 line in the CBP PDF before filing [CBP forced-labor HTS list] [CSMS 69326983]. The 15 and 18 percent India figures in the policy files are wrong: 18 percent was an IEEPA rate void since 24 Feb 2026 and 15 percent appears in no government document (corrected). De minimis is suspended for all countries and survived the ruling [FR 2026-12670].

Classification is the swing factor. Fitbit trackers went to 8517.62.00 on the Bluetooth transceiver's essential character [CBP H279898]. A Suunto smart watch from China went to 8517.62.0090 with List 4A 7.5 percent [CBP N311614]. But Whoop bands from China went to 9031.90.9195 with List 1 25 percent, which implies CBP treats the Whoop device as a heading-9031 measuring instrument [CBP N339661]. 9031.80.80 is not on the exemption list. Its MFN rate is 1.7 percent or Free, unresolved.

| Origin and heading | MFN | Section 301 China lists | Forced-labor 301 | Stack | Confidence |
|---|---|---|---|---|---|
| India, 8517.62.00 | Free | none | exempt | 0 percent | secondary; confirm 8517.62.00 in the CBP Note 52(b) PDF |
| China, 8517.62.00 | Free | List 4A 7.5 percent | exempt | 7.5 percent | secondary; same confirmation |
| India, 9031.80.80 | 1.7 percent ⚠ | none | 10 percent | about 11.7 percent | estimate |
| China, 9031.80.80 | 1.7 percent ⚠ | List 1 25 percent | 12.5 percent | about 39.2 percent | estimate |

Worked landed cost, USD per unit (estimate, policy-lens assumptions): customs value US$20, 150 g shipped, US$6/kg freight = US$0.90, MPF 0.3464 percent = US$0.07, broker US$150 per entry = US$0.15 at 1,000 units. Air freight India to US runs about US$3-5/kg for 150-500 kg consignments (secondary, Sept 2026) [Freightos India-US]. FY2026 MPF minimum is US$33.58 and maximum US$651.50 [FR MPF]. Samples from an Indian EMS travel by courier: DHL Express India to US about INR 3,700 for 1 kg (about US$39), INR 6,500-7,000 for 5 kg (about US$68-73), INR 9,500-12,500 for 10 kg (about US$99-131), plus 18 percent GST and a 15-25 percent fuel surcharge (secondary, April 2026 aggregators) [DHL India-US].

| Case | Duty | Landed at 1,000 units | Arithmetic |
|---|---|---|---|
| India, 8517.62.00 | 0.00 | 21.12 | 20 + 0.90 + 0 + 0.07 + 0.15 |
| China, 8517.62.00 | 1.50 | 22.62 | 20 + 0.90 + 1.50 + 0.07 + 0.15 |
| India, 9031.80.80 | 2.34 | 23.46 | 20 + 0.90 + 2.34 + 0.07 + 0.15 |
| China, 9031.80.80 | 7.84 | 28.96 | 20 + 0.90 + 7.84 + 0.07 + 0.15 |

At 25k units with the lens midpoints (China JDM US$18, India US$21; per-entry fees about US$0.08): under 8517.62.00 China lands at 18 + 1.35 + 0.90 + 0.08 = 20.33 and India at 21 + 0 + 0.90 + 0.08 = 21.98. Under 9031.80.80 China lands at 18 + 7.06 + 0.98 = 26.04 and India at 21 + 2.46 + 0.98 = 24.44. Conclusion: China wins by about US$1.65 if the band is telecom apparatus. India wins by about US$1.60 if the band is a measuring instrument. Freight is a rounding error at 150 g. A binding ruling under 19 CFR 177 is cheap insurance and decides the country question.

### 5.4 Risk column

| Risk | Evidence | Confidence |
|---|---|---|
| IP | Whoop sued a Chinese rival over a US$100 look-alike (Oct 2025) ⚠ [the5krunner Whoop suit]. Oura's ITC win excluded Ultrahuman and RingConn [Oura ITC blog]. Shenzhen reference designs are resold to other brands. Protect the app and algorithm layer, not the shell. | secondary |
| Firmware black box | Da Fit / MoYoung OTA is Realtek's closed signed channel [moyoung-watch]. Helio Strap runs Zepp OS with ECDH-authenticated BLE; per-minute data is recoverable, raw PPG/IMU is not [zepp-os-esphome]. Whoop streams raw 24-bit PPG unencrypted and computes SpO2 in the cloud [openwhoop]. The vendor owns raw data unless you own the firmware. | secondary |
| Sensor quality | PAH8011 is single-LED and worse in low perfusion [threkir BOM]. No peer-reviewed validation of any Vcare, PAH8011 or Goodix white-label band was found. Whoop 4.0 nocturnal rMSSD CCC 0.94, Oura Gen 4 0.99, Garmin 0.87, Polar 0.82 against Polar H10 [Dial 2025]. | verified for Dial; not found for white-label |
| Tariff drift | Section 232 semiconductor Phase 2 was "confirmed" by Commerce in Sept 2026 but not proclaimed; derivative scope unknown [FR 2026-01052]. Section 301 List 4A survived the IEEPA ruling. | secondary |
| Supply | Nordic flagged nRF52 as superseded by nRF54; dev-kit lead times run 4 weeks at Avnet and 20 weeks at Mouser [Nordic Q3 2025] [Mouser NRF52-DK]. | verified |

## 6. Software integration

### 6.1 Three-stage architecture

Stage 0, aggregator and vendor APIs, no hardware, 2-4 focused weeks (estimate).

- Direct OAuth integrations beat aggregators at FitForge's scale. Terra Quick Start costs US$499 per month on an annual plan with 100,000 credits (corrected) [Terra pricing]. Junction charges a flat US$300 per month for up to 500 connected users (corrected) [Junction pricing]. ROOK starts at US$399 per month; its own page says Core supports up to 5,000 active users (corrected) [ROOK pricing].
- WHOOP API v2 lives at api.prod.whoop.com/developer/v2 with cycles, recovery, sleep, workouts, body measurements and webhooks. Limits are 100 requests per minute and 10,000 per day per client [WHOOP rate limits]. Third parties translate that to 60-80 connected users ⚠. Recovery carries HRV as RMSSD, not SDNN.
- Oura v2, Polar AccessLink v3, Garmin Health, Ultrahuman Partner API and Fitbit endpoints were read from client code only ⚠ (unverifiable this pass) [mirobody] [polar-stream] [wearipedia].
- A Cloudflare Worker must hold the OAuth client secret. `workers/coach` verifies Firebase ID tokens and CORS-allow-lists origins but has no KV binding and no per-uid rate limit (`workers/coach/wrangler.toml:19-21`; `workers/coach/src/index.ts:2011-2016`) [FitForge repo]. Contract Law 2 forbids health payloads through the worker, so it may broker tokens only.

Stage 1, prototype on off-the-shelf sensors.

- Polar Verity Sense streams accelerometer at 52 Hz, gyro at 52 Hz, PPG at 55 Hz 22-bit, PP intervals, and records offline from firmware 2.1.0 via the official SDK [Polar Verity Sense docs]. It is the arm-band form factor the science recommends.
- Bangle.js 2 (nRF52840) is programmable from Chrome through a Web Bluetooth app loader with zero native code [BangleApps].
- Movesense runs an nRF52832 with ECG and 9-axis IMU. Price, MOQ and licence are not published; dev kits are business-only (unverifiable) [Movesense shop].
- Codebase: `apps/web/lib/band/` with a `BandTransport` interface, a `WebBluetoothTransport` for Android Chrome and desktop, and a `BridgeTransport` for the iOS shell.

Stage 2, custom band: Zephyr firmware on a modular-approved nRF52840 or nRF54L15 module; GATT per 6.2; on-band log of 14 days; on-band classifier emitting SetEvents with confidence; native Android companion writing Health Connect `ExerciseSessionRecord` and `ExerciseSegment`; iOS shell writing `HKWorkout` once the shell contract lifts its HealthKit-write fence.

### 6.2 BLE profile design

- Standard services: Heart Rate 0x180D so any HR app can read the band, Battery 0x180F, Device Information 0x180A. Zephyr ships `samples/bluetooth/peripheral_hr` [Zephyr HR sample]. Nordic UART 6e400001-b5a3-f393-e0a9-e50e24dcca9e for debug streams [Zephyr NUS].
- Skip the Bluetooth SIG Physical Activity Monitor Service. PAMS v1.0 is adopted but a GitHub search found 445 UUID-table hits and zero firmware implementations [Bluetooth PAMS].
- Custom Set-Event service (estimate): SetEvent notify characteristic of 15 bytes: u16 seq, u32 device_ts, u16 exercise_id (0 = unknown), u8 reps, u16 concentric_ms, u16 eccentric_ms, u8 confidence 0-100, u8 flags. One 244-byte payload carries about 16 events. ControlPoint write: set_clock, sync_from(seq), ack(seq), start and stop session. LogStatus read: oldest_seq, newest_seq, unsynced_count. Every event is append-only and idempotent by (deviceId, seq).
- Whoop's own pattern is one 128-bit custom service, 61080001-8d6d-82b8-614a-1c8cb0f8dcc6, with command and data characteristics and a "sync batch data" kind; the strap ships with its RTC unset until the phone sets it ⚠ (community reverse engineering) [gowhoop] [OpenStrap].
- Bandwidth never decides the architecture. A 6-axis int16 stream at 50 Hz is 600 B/s, 4.8 kbps, under 0.4 percent of Nordic's measured 1,504 kbps at 2M PHY [Nordic throughput]. Battery, latency and privacy decide it. Real phone sync is slow: Whoop says 24 hours of strap data takes 45-60 minutes (corrected, replaces the 14 s and 97 s drain estimates) [WHOOP catching up].
- OTA: MCUboot plus MCUmgr SMP DFU over BLE [sdk-nrf FOTA]. Nordic's DFU libraries have 859 and 587 GitHub stars; Capacitor wrappers have 1-2 stars, so vendor Nordic's native libraries inside the shell [Nordic DFU].

### 6.3 FitForge codebase touch-points

Read at HEAD 542f932. Line numbers are from that checkout [FitForge repo].

Data model:

- Workout log key `fitforge.workoutlog.v1` (`apps/web/components/features/shared/workoutLog.ts:21`). `LoggedSet { reps, weight_kg }` and nothing else (lines 23-26). `WorkoutSession { id, dayId, dayName, finishedAt, exercises[] }` stored newest-first as one mutable JSON document. `MAX_SESSIONS = 200` (line 102). `normalizeSet` (lines 106-116) rebuilds every set as `{reps, weight_kg}` and drops any device field on load. `logSession` (lines 326-331) prepends and slices to 200.
- Session ids are `sess-<epoch ms>` (`WorkoutPlayer.tsx:694`). `mergeSessions` unions by id (`store.ts:1238-1242`). Device sessions need globally unique ids.
- Active session key `fitforge.activeSession.v1`, 12-hour TTL (`apps/web/lib/workout/activeSession.ts:35,42`). `ActiveSetSnapshot { reps, weight_kg, rpe, done }`.
- Health store key `fitforge.health.v1` (`apps/web/lib/health/store.ts:40-46`): per-metric `DailyMetricPoint {date, value, unit}` arrays plus hkUuid-keyed `HealthSample` rows. `MAX_DAYS = 400`, `MAX_SAMPLES = 1600`. `ingestBatch` (lines 267-288) is idempotent by (metric, date) and by hkUuid. `HEALTH_METRICS` v1 (`apps/web/lib/native/forgeBridge.ts:40-56`): sleep, restingHeartRate, hrvSdnn, bodyMass, bodyFatPercentage, steps, activeEnergy, workouts. No temperature, SpO2, respiratory rate or sleep stages exist.
- Readiness engine (`apps/web/lib/readiness/engine.ts:73-98,126-151`) deducts 11 points at RHR delta >= +5 bpm and 8 points at HRV delta <= -20 percent. Baselines are trailing medians needing 14 RHR days and 30 HRV days (`apps/web/lib/health/selectors.ts:22-23,40-48`). Temperature plays no role.
- The player always knows `current`, `activeSetIdx` and `SetTarget { reps, repsLow, repsHigh, loadPct, rpe, role }` (`WorkoutPlayer.tsx:578-602,749-761,1131-1137`; `packages/shared/src/rules/progression.ts:245-268,719-733`). `completeSet` fires `haptic('confirm')` and starts the rest timer. A device hook fits as `applyDeviceSet(reps, ...)` aimed at `activeSetIdx`.

Bridge:

- ForgeBridge v1 is a 9-message additive envelope `{v:1, id, type, payload}` (`forgeBridge.ts:142-163,203-225,442-473`). Swift mirror in `apps/ios/FitForge/Bridge/ForgeBridge.swift:12,111-131`. Capabilities are the literal `['health', 'storageMirror', 'backupExport']` (line 12). Twelve frozen fixtures under `fixtures/forgebridge/` round-trip in both suites; `forgeBridge.test.ts:51` asserts at least 12 and line 99 asserts the exact capabilities array.
- A band adds a `device` capability, page-to-native `device/scan`, `device/connect {id}`, `device/forget`, `device/context {exerciseId, pattern, targetReps, restSeconds}`, and native-to-page `device/status {connected, battery, firmware, lastSeen}`, `device/setEvent {eventId, at, reps, durationMs, confidence, exerciseGuess?}`. `health/batch` is reused unchanged for band-derived RHR, HRV and sleep.
- iOS: `Device/BleEngine.swift` as a CoreBluetooth central adopting `BridgeOutput` like `HealthKitEngine.swift` (596 lines), with a restore identifier, `NSBluetoothAlwaysUsageDescription` and `UIBackgroundModes: [bluetooth-central]` in `apps/ios/project.yml`. HealthKit backfill is 90 days and background delivery hourly, sleep daily (`HealthKitEngine.swift:270-295,314-316`). Anchors commit only after the page acks a batch (lines 228-235). That ack-gated queue pattern suits a band that buffers and dumps on connect.

Sync and privacy rules:

- Cloud sync is one Firestore document per user, whole-bundle last-write-wins, `MAX_BYTES = 900_000` (`apps/web/lib/auth/sync.ts:62`) and `bundle.size() < 950 KiB` (`firestore.rules:42`). Cloud mirror debounce is 4 seconds (`sync.ts:547-553`).
- `SYNC_DENYLIST_PREFIXES` = `fitforge.health.`, `fitforge.cycle.`, `fitforge.readiness.`, `fitforge.activeSession.` (`store.ts:1058-1066`). These never ride cloud sync but still ride the deliberate file export (`syncDenylist.test.ts:32-60`). Extras are capped at 32 keys of 512 KiB (`store.ts:1044-1045`).
- Retention is 180 days, warning at 150 (`apps/web/lib/demo/retention.ts:30-32`). A 6-exercise x 4-set session serialises to about 2,078 bytes; 180 days at four sessions a week is about 209 KB; the 200-session cap is about 406 KB (estimate). Per-set timestamps fit. Per-rep IMU streams must never enter the synced log.
- The AI boundary is real: the adapt request carries only `sleepHours, soreness, energy, stress, unwell` (`apps/web/lib/readiness/context.ts:39,71-79`; `workers/coach/src/index.ts:1285-1340`). RHR and HRV deltas never leave the device.
- Rule for the band: create `fitforge.band.v1` as an append-only event log keyed by (deviceId, seq), union-merged on every import path, added to `SYNC_DENYLIST_PREFIXES`, included in file export. Promote accepted events into normal sessions through the existing logging path. Tag band health points with a source and keep per-source baselines because HealthKit gives SDNN and bands give RMSSD.
- Size (estimate): 2,000-2,800 new lines, about 1,100-1,500 TypeScript, 500-700 Swift, 5-7 fixtures, touching about 10 existing files and 12-15 test files. Stale docs to fix: `README.md:379-382` still calls `apps/ios` an untouched MVP scaffold; `README.md:12` says 100 e2e tests and `PRODUCT.md:41` says 205, while the tree holds 53 spec files and 258 tests. Capacitor is not installed; zero `@capacitor` entries exist in `package-lock.json`.

### 6.4 Platform limits: Web Bluetooth versus Capacitor versus native

| Path | Reach | Background | Verdict | Confidence |
|---|---|---|---|---|
| Web Bluetooth | Chromium only, about 76 percent of global usage; no Safari on iOS, iPadOS or macOS through iOS 26 [TestMu] | None; tab must be foreground | Android Chrome and desktop bench logging only | secondary |
| WKWebView in the FitForge shell | Locked to goforge.fit with app-bound domains (`apps/ios/FitForge/App/RootView.swift:26-27`); no `navigator.bluetooth` | n/a | Not a BLE path | verified |
| Capacitor bluetooth-le | Needs `NSBluetoothAlwaysUsageDescription` and `bluetooth-central`; no CoreBluetooth state restoration; about 5-6 s to respond to a wake before termination [Capacitor #679] | Weak | Reject | verified |
| Native CoreBluetooth in the existing SwiftUI shell | Opt-in state restoration; iOS relaunches the app to finish Bluetooth tasks [Apple CoreBluetooth] | Yes | Adopt for iOS | verified |
| Android native companion | Android 12+ runtime `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`; `neverForLocation` avoids the location prompt [Android BT perms]; background scans need a foreground service | Yes with foreground service | Stage 2 | verified |

Health-platform sinks: Health Connect `ExerciseSegment` carries startTime, endTime, segmentType, repetitions, weight, setIndex and rateOfPerceivedExertion; `EXERCISE_SEGMENT_TYPE_BENCH_PRESS = 5`, `EXERCISE_TYPE_STRENGTH_TRAINING = 70` [androidx HC]. Weight, setIndex and RPE shipped in health-connect-client 1.2.0-alpha and must be gated on `FEATURE_EXPANDED_EXERCISE_RECORD` (corrected) [androidx releases]. Google Fit APIs end with 2026 [Google Fit]. HealthKit offers only `HKWorkoutActivityTypeTraditionalStrengthTraining` and `FunctionalStrengthTraining` with no per-set schema [HKWorkout.h].

### 6.5 Regulatory classification

- FDA: the revised "General Wellness: Policy for Low Risk Devices" issued 6 Jan 2026 and supersedes the 2019 version [Covington FDA] [FDA town hall]. Non-invasive sensing wearables stay outside device regulation if they make no diagnosis, treatment or clinical-management claim and mimic no cleared-device output without validation. HR, HRV, sleep, skin-temperature trend, strain and readiness fit. SpO2 or blood-pressure outputs framed clinically do not. Whoop's Blood Pressure Insights drew a warning letter on 14 Jul 2025; FDA closed it on 17 Jun 2026 after labeling changes [FDA warning letter] [FDA closeout]. A class action followed [ArentFox Schiff].
- FTC Health Breach Notification Rule: amended rule at 89 FR 47028, effective 29 Jul 2024, covers non-HIPAA health apps and connected devices [FR HBNR]. FitForge inherits that posture the moment a Worker holds tokens or a band syncs health data.
- India DPDP: Rules notified 13 Nov 2025; Board provisions immediate; consent-manager provisions 14 Nov 2026; substantive obligations 14 May 2027 [PIB DPDP] [S&R DPDP].
- Apple 5.1.3: no advertising or data-mining use of health data, no false HealthKit writes, no personal health information in iCloud ⚠ (quoted via a third-party doc) [Apple 5.1.3].
- FCC: a modular-approved nRF52840 module (Raytac MDBT50Q, FCC ID SH6MDBT50Q) leaves the host with Part 15B SDoC at about US$1.5-4k per SKU and "Contains FCC ID" labeling [eCFR 15.212] [Hardwario MDBT50Q]. Bluetooth SIG: Adopter dues US$0; Contributing Adopter small (revenue under US$100M) US$3,500 per year, large US$16,500; Declaration ID US$12,000 from 1 Mar 2026, up from US$11,040 (Jan 2024 to 28 Feb 2026) (corrected) [BT SIG fee change]. Contributing Adopters earn a discount on their first product-qualification fee each year; the amount was not captured. The US$2,500 Innovation Incentive discount ended in Feb 2020 (refuted) [Ezurio].

## 7. Rep-detection science

### 7.1 Summary table

| Paper | Placement | # exercises | Accuracy | Rep error | Year | URL | Confidence |
|---|---|---|---|---|---|---|---|
| RecoFit (Morris et al., CHI) | one arm-worn IMU, 50 Hz | 4 / 7 / 13 circuits; 114 participants, 146 sessions | 99 / 98 / 96 percent; segmentation P/R > 95 percent | within ±1 rep 93 percent of the time (corrected) | 2014 | https://dl.acm.org/doi/10.1145/2556288.2557116 | verified |
| MiLift (Shen et al., IEEE TMC) | wrist smartwatch, 22 users | machine and free-weight types | > 90 percent P/R | mean 1.12 reps on a mean 9.65-rep set (corrected: mean) | 2018 | https://ieeexplore.ieee.org/document/8118128/ | verified |
| MM-Fit (Strombäck et al., IMWUT) | 2 wrists at 100 Hz, phones, earbud | 10 | 94 percent watch-only; 96 percent multimodal; unseen subjects | baseline provided, not captured | 2020 | https://dl.acm.org/doi/10.1145/3432701 | verified |
| StrengthControl on Apple Watch (Sensors) | wrist | 3 barbell lifts, 363 sets, 30 athletes | 88.4 percent of sets | valid for squat (p = 0.68) and deadlift (p = 0.09); not bench | 2021 | https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8471343/ | verified |
| MyoGym + CNN-ResBiGRU | forearm armband, IMU + EMG, 50 Hz | 30 | 97.29 percent accuracy, 92.68 F1 with EMG | n/a | 2017 / 2024 | https://www.mdpi.com/2571-5577/7/4/59 | secondary |
| RecGym | wrist, pocket, calf, 20 Hz | 12 incl. leg press, leg curl, adductor | benchmark for few-shot work | n/a | 2022 | https://zhaxidele.github.io/RecGym/ | verified |
| Wristband CNN+LSTM (LNCS) | wrist band | 4 | 98 percent | MAE < 0.2 progression | 2023 | https://link.springer.com/chapter/10.1007/978-3-031-48306-6_7 | verified |
| Few-shot rep counting (arXiv 2410.00407) | single IMU | unseen exercises | n/a | about 0.7 reps MAE, 74 percent exact ⚠ unattributed | 2024 | https://arxiv.org/abs/2410.00407 | ⚠ unverifiable |
| WEAR (Bock et al., IMWUT) | both wrists and ankles, 50 Hz | 18 outdoor, 22 participants | inertial F1 86.20, mAP 88.36 with four sensors; wrist-only F1 58-67, mAP 28-35; wrist + ankle F1 68-75, mAP 46-51 (corrected) | n/a | 2024 | https://dl.acm.org/doi/10.1145/3699776 | verified |
| ST MLC gym example | wrist, accel 26-30 Hz, in-sensor tree | 3 + none | not published | n/a | 2020 / 2022 | https://github.com/STMicroelectronics/STMems_Machine_Learning_Core | verified config |
| Bosch BHI260AP Klio | any, sensor hub | user-taught pattern | not published | float rep count output | 2023 | https://github.com/boschsensortec/BHY2-Sensor-API | verified API |

Related physiology: WHOOP versus PSG 2-stage agreement 89 percent with wake specificity 51 percent, and 4-stage agreement 64 percent, in a WHOOP-sponsored study that required manual bedtimes [PubMed 32713257]. WHOOP-AUTO reached 86 and 63 percent [PMC8226553]. Six wrist trackers including WHOOP 4.0 detected more than 90 percent of sleep epochs with wake specificity of only 29-52 percent [SLEEP Advances]. Total sleep time is overestimated on fragmented nights.

Load and velocity: 22 studies and 8 IMU models; 7 valid against linear transducers [PMC8038306]. Vmaxpro ICC 0.91-0.96 with LoA under 0.12 m/s, but between-day reliability ICC only 0.55-0.91 (verification caveat) [PMC8431394]. GymAware most valid; Beast Sensor and Bar Sensei least valid [PMC7404723]. No peer-reviewed validation of Garmin or Amazfit auto rep counting was found in either pass.

### 7.2 The plan-aware design argument

FitForge knows the next exercise, the target reps and the prescribed load. The band therefore verifies, segments and counts. It does not classify the open world.

- Small candidate sets are easier. RecoFit: 99 percent at 4 candidates versus 96 percent at 13 [RecoFit MSR]. The LNCS wristband study: 98 percent on 4 exercises [LNCS 2023].
- Placement: upper forearm or upper arm sees the same arm kinematics as a wrist with fewer grip artefacts, and it is the better optical site during gripping [PMC12788198].
- Sampling: keep the recognition stream at about 50 Hz. WEAR's models lost accuracy at 25 and 10 Hz [WEAR repo].
- Compute split: an in-sensor decision tree costs about 3.1 uA of MLC overhead [ST MLC gym]. A 20 KB TFLite Micro gesture model runs on Zephyr [Zephyr magic_wand]. Stream compact set summaries live; store raw windows on the band; upload raw only with consent.
- Personalisation: self-supervised pretraining lifted PAMAP2 F1 from 0.605 to 0.789 and WISDM from 0.684 to 0.810 [ssl-wearables]. LIMU-BERT-X runs 7.5 billion on-device predictions per day for 500,000 couriers at more than 90 percent accuracy, self-reported [LIMU-BERT-X arXiv]. Bosch Klio is the commercial proof that "record one set, then count" runs on a sensor hub [Bosch BHY2].
- Data: WEAR is CC BY-NC-SA and cannot train a commercial model [WEAR repo]. RecoFit's licence is unreviewed. Every confirmed set in FitForge is a free label, so the model improves with use.
- Precedents for using a prior: process-instruction factory HAR (IMWUT 2019), ZeroHAR (AAAI 2025), on-device few-shot personalisation on RecGym (arXiv 2508.15413) [Awesome-IMU-Sensing].

Product rules: calibrate one set per exercise on first use; confirm-first in the player, never silent auto-commit; leave leg machines and isometrics tap-to-confirm; label rep-to-rep slowdown as a trend, never as velocity.

## 8. Total program cost and timeline

### 8.1 Certification inputs (US market)

| Item | Cost | Confidence |
|---|---|---|
| FCC, pre-certified module route, host Part 15B | US$3-10k [MarkReady] | secondary |
| FCC, custom radio | testing US$1-4k; TCB review US$120-500 (Jettest) or US$2-8k (IB-Lenhardt); SAR US$2.5-6k if required; working range US$1.5-12k, up to US$18k (corrected) [Jettest] | secondary |
| Bluetooth SIG Declaration ID | US$12,000 from 1 Mar 2026 (corrected); Adopter dues US$0; Contributing Adopter small US$3,500 per year with a first-declaration discount of uncaptured size [BT SIG fee change] | verified |
| Small-business US$2,500 listing | refuted; programme ended Feb 2020 [Ezurio] | refuted |
| UN38.3 | US$300-7,000 by lab and scope (corrected); a bought-in cell usually carries its maker's report [JJR UN38.3] | secondary |
| IEC 62133-2 | US$1,000-1,500 at Chinese labs; US$4,000-6,000 at TUV or SGS; above US$20,000 only for UL listing programmes (corrected) [DNK IEC 62133] | secondary |
| US certification stack | US$15.5-49k; central case US$20-25k (corrected) | estimate |
| CE RED, ISED, RoHS | not found; SparkFun paid US$12,200 for FCC + ISED + CE on one module in 2019 [SparkFun FCC] | secondary |
| India: WPC ETA (sale in India only) | US$104 per model [Bureau Veritas WPC] | secondary (consultancy consensus) |
| India: BIS CRS (sale in India only) | about US$770-1,350 per model plus lab time ⚠ [Corpbiz BIS] | ⚠ consultancy |
| Predictable Designs anchor | a few thousand dollars to about US$50,000, driven by module versus custom radio [Predictable Designs] | secondary |

### 8.2 Three strategies

Inputs: Bolt's rule of US$100-500k and 6-9 months for a simple product, from a c.2015 post and not inflation-adjusted (corrected), so it is a floor; and 5,000-unit MOQs with US$1M of BOM per year expected by Chinese CMs [Bolt make-money] [Bolt Part 2]. A biosensing band with a classifier sits above "simple". Labour: Upwork median US$35/hr, range US$25-50 [Upwork]. Hardware unit cost uses one bracket per volume for S1 and S3: US$25-45 at 1,000 units (Alibaba ODM bracket at MOQ 1,000, marketing content) and US$18-28 at 5,000 [Alibaba OEM/ODM] [China lens]. The 5k tier is applied to 10,000 units as a conservative choice; the 25k tier is US$14-22. Staranb's about US$15-25 is a single-vendor sample estimate and is not used ⚠ [PulseLoop survey]. All cash figures are estimates.

| Strategy | Cash to first 1,000 units | Cash to 10,000 units | Months | Arithmetic |
|---|---|---|---|---|
| S1: SDK-tier band + FitForge app (J-Style, iSmarch class) | US$26-60k plus integration labour | US$181-295k plus labour | 3-9 (estimate; lower bound rests on the unverified Ultrahuman 4-month datum) | 1,000 x US$25-45 = 25-45k; branding US$1-3k (logo and packaging); certification US$0-12k if the vendor's FCC grant and Declaration cannot be reused (reuse rules unverified). Labour = hours x US$25-50 or owner time; hours not sourced. 10k: 10,000 x US$18-28 = 180-280k plus the same fixed items. |
| S3: China JDM + custom firmware | US$53-137k | US$208-372k | 12-24 (estimate) | 1,000 x US$25-45 = 25-45k; platform NRE US$12-43k; US certification US$15.5-49k. 10k: 10,000 x US$18-28 = 180-280k plus fixed US$28-92k. Firmware labour hours not sourced. |
| S2: India EMS, own design | US$232-881k | US$342k-1.06M | 12-24 (estimate; no India EMS lead time found) | Development US$100-500k (floor, c.2015 figure); tooling US$6-157k ⚠; US certification US$15.5-49k; inventory 5,000 x US$22-35 = 110-175k because the MOQ prior is 5,000 and no Indian MOQ was found. India-sale approvals are optional: WPC US$104 plus BIS US$770-1,350 ⚠ per model. 10k: 10,000 x US$22-35 = 220-350k plus fixed US$122-706k. |

The white-label US$9-13 tier is excluded from S1. It has no gyro and no raw IMU, so set detection is impossible on it [China lens].

### 8.3 Convexity read

- S1: bounded downside of a few tens of thousands plus labour. It buys demand data and a working detector on real users. Upside is capped by the vendor's firmware. The first screen is the BLE data contract: raw IMU at 50 Hz or nothing.
- S3: moderate NRE. It keeps raw data and OTA keys. Irreversible spend is NRE plus inventory plus certification, US$53-137k from the 8.2 inputs, plus US$30k+ if custom tooling is ordered [Alibaba OEM/ODM]. It carries the 7.5 percent China duty and the black-box risks in 5.4. A first bulk order of 10,000-20,000 units at J-Style class vendors (secondary) [Jointcorp bulk] would be US$180-560k of working capital at the 5k tier.
- S2: the largest fixed cost and the longest timeline. It is convex only if the duty gap holds (0 versus 7.5 percent, or 11.7 versus 39.2 percent under heading 9031) and if a Section 232 derivative expansion hits China-origin electronics. IP exposure is identical: Section 337 does not care about origin.
- Optionality: S1 then S3, with S2 exercised on volume or on a tariff shock. The sequence keeps every irreversible dollar behind a demand signal.
- Working capital, not NRE, breaks first runs. Bolt's CMs want US$1M of BOM per customer per year; 10,000 units at a US$20 BOM is US$200k, a low-priority account [Bolt Part 2].

### 8.4 Unit-economics model

Assumptions: retail US$149 DTC working assumption; India duty 0 percent and China 7.5 percent under 8517.62.00 (secondary); freight US$0.90 per unit; per-entry fees about US$0.10 at 5,000 units (MPF 0.07 ad valorem plus broker US$150 / 5,000 = 0.03), so the landed adder is US$1.00; gross margin at MSRP before channel fees, marketing, warranty and returns; warranty base rate 2-3 percent of revenue from Fitbit's FY2015 10-K [Fitbit 10-K 2015]; e-commerce return rate about 11 percent ⚠ (blog-grade proxy). Amazon referral fees and App Store commissions were not researched.

| Strategy at 5,000 units | Ex-works | Landed (arithmetic) | COGS as share of US$149 | Gross profit per unit at MSRP | Check against Bolt 2.5-4x |
|---|---|---|---|---|---|
| S1 SDK band, priced at the US$99.99 floor | 18-28 | 18 x 1.075 + 1.00 = 20.35; 28 x 1.075 + 1.00 = 31.10 | 20-31 percent of US$99.99 | US$69-80 | pass |
| S3 China JDM | 18-28 | 20.35; 31.10 | 14-21 percent | US$118-129 | pass |
| S2 India | 22-35 | 22 + 1.00 = 23.00; 35 + 1.00 = 36.00 | 15-24 percent | US$113-126 | pass |
| S3 if classified 9031.80.80 | 18-28 | 18 x 1.392 + 1.00 = 26.06; 28 x 1.392 + 1.00 = 39.98 | 17-27 percent | US$109-123 | pass |
| S2 if classified 9031.80.80 | 22-35 | 22 x 1.117 + 1.00 = 25.57; 35 x 1.117 + 1.00 = 40.10 | 17-27 percent | US$109-123 | pass |

Fully loaded reality check: scaled public hardware businesses print far lower margins. Fitbit's GAAP gross margin ran about 42.7 percent in 2017, 39.9 percent in 2018 and 29.8 percent in 2019 after smartwatch mix, promotions and tariffs [Fitbit 10-K 2019] [Fitbit 10-K 2018]. Zepp printed 38.2 percent in Q3 2025 (later quarters not checked) [Zepp Q3 2025]. Oura prints 55 percent with an 89 percent membership margin [Oura S-1]. The gap between MSRP gross profit and those figures is channel discount, promotion, warranty, returns and tooling amortisation. Plan on a fully loaded hardware margin of 30-43 percent (the Fitbit GAAP range) or 38 percent (Zepp), not 80 (estimate, judged from Fitbit and Zepp).

Subscription sensitivity (estimate): two-year revenue per unit with 85 percent 12-month retention from Oura's S-1 [Oura S-1]. Hardware only: US$149. Plus US$80 per year (FORT's price): 80 + 80 x 0.85 = US$148 extra. Plus US$199 per year (Whoop One): 199 + 199 x 0.85 = US$368 extra. At an 89 percent membership margin, an US$80 per year plan adds about US$132 of gross profit per unit over two years, roughly equal to the hardware gross profit. The segment norm is no subscription. A subscription needs a feature nobody else ships. Automatic rep and exercise detection is that feature, if it works.

## 9. Risks and kill criteria

| Risk | Evidence | Kill or gate signal |
|---|---|---|
| Detection accuracy on compound lifts | Bench press failed rep-count validity on Apple Watch [PMC8471343]; wrist-only F1 58-67 on WEAR [WEAR repo]; Atlas died on accuracy [Wareable Atlas] | Kill hardware if closed-set recognition < 90 percent or rep error beyond ±1 on more than 20 percent of sets after per-user calibration, measured on 30 users over 90 days. |
| Incumbent zero-marginal-cost entry | Helio Strap, Fitbit Air, Polar Loop, Helio Strap Pro, FORT all launched in 12 months; Whoop promises automatic 1RM estimation in Nov 2026 and an AI builder that parses sets and reps [Whoop what's new] | Kill if Fitbit Air, Helio Strap 2, Whoop or FORT ship validated automatic rep counting before FitForge's Stage 1 proves out. |
| Tariff classification | Whoop bands sit in heading 9031 with List 1 25 percent [CBP N339661] | Gate: no country decision before a CBP binding ruling. |
| IP and Section 337 | Oura excluded Ultrahuman and RingConn [Oura ITC blog]; Whoop sued a clone maker ⚠ | Gate: freedom-to-operate opinion on packaging and form-factor patents before any tooling. |
| Firmware black box | Da Fit closed OTA; Zepp OS auth; Goodix binary algorithms | Kill any vendor that will not stream raw 50 Hz IMU and hand over OTA keys. |
| Medical-claim drift | Whoop FDA letter 14 Jul 2025 [FDA warning letter] | Rule: no SpO2 or BP threshold alerts. Wellness copy only. |
| Hardware-refresh promises | Whoop's US$49 / US$79 upgrade fee reversed within 48 hours [Android Authority] | Rule: never promise free future hardware. |
| Working capital and MOQ | 5,000-unit MOQ norm; CM wants US$1M BOM per year [Bolt Part 2]; first bulk 10,000-20,000 at J-Style class ⚠ [Jointcorp bulk] | Gate: no MOQ order without 1,000 paid pre-orders. |
| Sync clobber | Whole-bundle LWW at 900 KB [FitForge repo] | Rule: band events never enter the bundle. |
| Component supply | nRF52 superseded by nRF54; 4 versus 20 week dev-kit lead times [Nordic Q3 2025] [Mouser NRF52-DK] | Gate: second-source SoC and AFE before DVT. |
| RoDTEP lapse | Extended only to 30 Sep 2026 [DGFT RoDTEP] | Model it at zero. |

Base rate: standalone strength-tracking wearables have failed at Atlas and Halo scale. The feature-inside-an-app base rate is unmeasured. Treat the hardware as a call option with a capped premium.

## 10. Recommended next 90 days

All steps are cheap and reversible.

1. Weeks 1-2. Buy two Polar Verity Sense units and two Bangle.js 2 units. Log raw 52 Hz IMU during real FitForge sessions through the Polar SDK and the Bangle.js loader [Polar Verity Sense docs] [BangleApps]. Prices were not researched; check polar.com and shop.espruino.com.
2. Weeks 1-4. Build `apps/web/lib/band/` with the `BandTransport` interface and the Web Bluetooth adapter for Android Chrome. Add `fitforge.band.v1` to `SYNC_DENYLIST_PREFIXES`. Extend `syncDenylist.test.ts` and `cloud-restore.spec.ts`.
3. Weeks 2-8. Train a plan-aware classifier on FitForge-labelled sets. Report recognition and rep error per exercise. Use the kill thresholds in section 9.
4. Weeks 2-4. Send the Appendix A RFQ to Optiemus, VVDN, Dixon and Syrma SGS, and to iSmarch and J-Style. Ask for MOQ, NRE, conversion cost at 5k / 25k / 100k, raw-data SDK terms, and whether any stock screenless band exists in India.
5. Weeks 2-6. File a CBP binding-ruling request under 19 CFR 177 for a screenless upper-arm band. Ask for 8517.62.0090 versus 9031.80.80. Before filing, confirm the 8517.62.00 line in the CBP Note 52(b) forced-labor exemption PDF.
6. Weeks 3-8. Commission a freedom-to-operate search on screenless band packaging patents held by Whoop, Oura, Google and Apple.
7. Weeks 4-8. Ship Stage 0: a `workers/connect` Worker with KV and per-uid rate limits, WHOOP and Polar adapters into `fitforge.health.v1`, and a source tag on HRV. Publish the consent copy that names the Worker hop.
8. Weeks 6-10. Put a native `BleEngine.swift` into the iOS shell with a restore identifier and `bluetooth-central`. Add the `device` capability and 5-7 fixtures.
9. Weeks 8-12. Run a 30-user pilot on Verity Sense with the confirm-first chip in the player. Measure acceptance rate of suggested reps.
10. Week 12. Decision memo: proceed to S3 RFQ samples, hold, or kill hardware. Spend to date should stay under the S1 hardware floor of US$26k plus sensor units and labour.

## Appendix A: one-page RFQ spec sheet

Send to Indian EMS (Optiemus, VVDN, Dixon, Syrma SGS, East India Technologies) and Shenzhen JDMs (iSmarch, J-Style, Staranb, Starmax).

| Field | Requirement |
|---|---|
| Product | Screenless upper-arm health and strength band, "FitForge Band v1" |
| Quantities to quote | 500 EVT, 2,000 pilot, 5,000, 25,000, 100,000 per year |
| MCU / radio | Nordic nRF52840 or nRF54L15; state whether you use a modular-approved module (FCC ID) or chip-down |
| PPG | Multi-wavelength green + red + IR, at least 2 LEDs and 4 photodiodes; AFE part number; 25 Hz continuous, 100 Hz burst; raw FIFO access |
| IMU | 6-axis with gyro, 50-100 Hz, raw FIFO access; BMI270, ICM-42688 or LSM6DSO class |
| Temperature | NTC minimum; quote TMP117 or MAX30208 option |
| Battery | 150-200 mAh Li-Po with IEC 62133-2 and UN38.3 reports; 5-7 days at 1.0 mA average; state cell maker |
| Charging | Pogo dock with USB-C; BQ25180 or nPM1100 class; quote inductive as option |
| Memory | 8 MB QSPI NOR minimum; 14 days of aggregates and set events |
| Enclosure | 2-shot PC and silicone, optical window, IP68; textile sleeve strap; under 30 g module |
| Firmware | Zephyr or nRF Connect SDK; source delivered to buyer; MCUboot + MCUmgr SMP DFU; buyer holds signing keys |
| BLE GATT | HRS 0x180D, BAS 0x180F, DIS 0x180A, buyer's custom Set-Event service, NUS; BLE 5, 2M PHY, DLE 251 |
| Algorithms | State licence terms for HR/HRV/SpO2 libraries; buyer runs its own rep classifier on raw IMU |
| Certification | FCC (Part 15B via module or full 15C plus SAR), Bluetooth Declaration ID, CE RED; BIS CRS and WPC ETA only if the band is sold in India; state who holds each registration |
| Stock designs | State whether a stock screenless band design exists, with MOQ and price (India: none found in public sources) |
| Deliverables | Unit price ex-works at each quantity; NRE by phase (ID, EE, ME, FW, DFM); tooling count and cost per tool; test-jig cost; MOQ and first-bulk minimum; lead time for samples, pilot and mass production; yield assumption; warranty terms |
| Origin | For India: PCBA populated in India; confirm "Made in India" marking support |
| IP | Buyer owns design files, firmware and app; no resale of the enclosure or firmware to other brands |
| Data | Raw IMU and PPG over BLE to the buyer's app; no vendor cloud in the data path |

## Appendix B: verification log

Every check from the eight verification files. Verdicts: confirmed / corrected / unverifiable / refuted. Totals, recounted from each file: 135 checks; 86 confirmed, 32 corrected, 16 unverifiable, 1 refuted.

### B.1 Hardware architecture (14 checks: 9 confirmed, 3 corrected, 2 unverifiable)

| # | Claim | Verdict | Corrected value or note |
|---|---|---|---|
| H1 | Whoop 4.0 runs on the nRF52840 as its MCU; AFE, IMU, temp parts not found | corrected | Two-processor design: MAX32652 app MCU, nRF52840 for BLE, MAX86171 AFE, MAX77818 PMIC, MAX6631MTT temp. IMU still not found. |
| H2 | Whoop 5.0: Ambiq Cortex-M4 + BLE, TDK 6-axis, ADI buck-boost and PPG/ECG AFE | confirmed | Ambiq SKU unknown; about US$2.67 ASP (secondary). |
| H3 | Whoop 5.0 PPG about 26 Hz | confirmed | Whoop adds 14+ days battery. |
| H4 | nRF52840 US$6.78 qty 1, US$4.07 reel; MVP BOM totals 28-47 / 20-33 / 14-25 | unverifiable | Mouser US$7.50 reel, US$7.35 tray at qty 1. Charger line 10-50 percent below distributor tiers. |
| H5 | BMI270 US$4.23 | confirmed | qty-1 price; no volume tier seen. |
| H6 | BMI270 about 685 uA at full performance | corrected | 685 uA is Normal; Performance 970 uA; Low Power 420 uA at 25 Hz. |
| H7 | nRF52840 4.8 mA TX, 4.6 mA RX; CPU 52 uA/MHz; sleep 1.5 / 0.4 uA | confirmed | Radio figures hold with DC/DC at 3 V; brief v3.0 lists 6.40 / 6.26 mA; CPU and sleep not re-read. |
| H8 | Ultrahuman Ring AIR: nRF52840, 24 mAh, up to 5 days | confirmed | Now marketed as up to 6 days after a firmware update (secondary). |
| H9 | Oura Ring 4 battery 26 mAh | unverifiable | Secondary only; ring cells scale with size. |
| H10 | Helio Strap 232 mAh, 10 days, BioTracker 6.0, BLE only | confirmed | Adds gyro, temp, BT 5.2, 5 ATM, 20 g. |
| H11 | Polar Loop 170 mAh, 8 days, 42 x 27 x 9 mm, 29 g, WR30 | confirmed | Manual: 64 MHz, 1.3 MB memory, 16 MB storage, BT 5.1. |
| H12 | 638 mAh figure is the Battery Pack 4.0; Whoop grantee code 2AJ2X | confirmed | |
| H13 | Sila anode gives about 20 percent energy density | corrected | 17 percent; WS40 cell 258 Wh/kg at 2.8 g implies about 185-195 mAh (derived). |
| H14 | GH3220 US$2.5298 at JLCPCB | confirmed | Second seller CNY 17.33. |

### B.2 India manufacturing (16 checks: 10 confirmed, 3 corrected, 3 unverifiable)

| # | Claim | Verdict | Corrected value or note |
|---|---|---|---|
| I1 | ECMS Rs 22,919 crore; Cabinet 28 Mar 2025; notified 8 Apr 2025; 6 + 1 years; Rs 59,350 crore; 91,600 jobs | confirmed | Adds Rs 4,56,500 crore production target; capex incentive 5 years; PIB PRID 2116172. |
| I2 | ECMS: 31 proposals, Rs 7,877 crore as of 17 Aug 2026 | corrected | One tranche; cumulative 106 projects; 249 applications worth Rs 1.15 lakh crore; 75 projects at Rs 61,000 crore by 30 Mar 2026. |
| I3 | PMP: 20 percent BCD on finished smartwatches | confirmed | HS 8517 62 90; plus 10 percent SWS and 18 percent IGST, about 44 percent all-in. |
| I4 | PMP component ladder 0-15 percent FY23-FY26 | unverifiable | Notification 11/2022 amended by 33/2023 confirmed; rate table not retrieved; bands in scope. |
| I5 | BIS CRS IS 13252 (Part 1):2010; migration to IS/IEC 62368-1:2023 by 1 Nov 2028 | confirmed | Smart watches under CRS since 23 May 2018 (consultancy consensus). |
| I6 | WPC ETA Rs 10,000; 1-3 working days | confirmed | Fee confirmed by consultancies; processing time consultancy-only. |
| I7 | boAt UDRHP localisation and Califonix figures | confirmed | Wearables revenue Rs 330.41 crore not re-verified. |
| I8 | Dixon wearables and hearables Rs 175 crore in Q1 FY26 | confirmed | Consolidated revenue Rs 12,838 crore; PAT Rs 280 crore. |
| I9 | IDC 2025: 114.2M units, 28.9M smartwatches, ASP US$26.5 | confirmed | Overall ASP US$20.3 not seen. |
| I10 | Counterpoint 82 percent localisation Q3 2023; Q2 2025 -27 percent | confirmed | Q1 2025 -33 percent not re-verified. |
| I11 | Ultrahuman Plano: SVtronics, Nov 2024, 200k to >500k rings/yr | confirmed | 400/day and 1,350/day not re-verified. |
| I12 | Ultrahuman first factory in Indore (2023) | unverifiable | No source names Indore; only Bengaluru is named. |
| I13 | VVDN nine plants with in-house tooling and FATP | confirmed | Older listings show seven. |
| I14 | Optiemus targets >10M units/yr by end-2025 | corrected | Smartphone-plant figure; wearables plant serves Noise, boAt, Truke; Realme 5M IoT units/yr. |
| I15 | FX Rs 85 per USD | corrected | About Rs 95.7-95.8 on 14 Sep 2026. |
| I16 | Tooling Rs 2-30 lakh per tool; jigs Rs 60,000-6 lakh | unverifiable | Single vendor blog (also claims 40-60 percent cheaper than EU/US) and a marketplace listing; 3-5 tool count unsourced. |

### B.3 China manufacturing (17 checks: 11 confirmed, 2 corrected, 4 unverifiable)

| # | Claim | Verdict | Corrected value or note |
|---|---|---|---|
| C1 | Alibaba screenless bands US$8.80-12.55, MOQ 1-100; Da Fit watches about US$7 | unverifiable | Sibling Alibaba page says US$9.80-26.00; single sources. |
| C2 | Alibaba guide: OEM NRE US$150-400k, certs US$50-120k, tooling US$30k+, OEM MOQ 5,000, ODM MOQ 2,000-3,000 | corrected | ODM MOQ is 1,000 at US$25-45 per unit; OEM US$18-32 at 5,000; branding US$12-28k; firmware tweaks US$0-15k. |
| C3 | Firmware source needs MOQ up to 50,000; ODM US$34 versus OEM US$29 plus US$210k | unverifiable | Single Alibaba marketing source. |
| C4 | J-Style MOQ 1,000 with SDK; iSmarch MOQ 2,000-3,000 EXW | confirmed | iSmarch: samples 2-4 weeks, pilot 4-6, mass production 8-12. |
| C5 | Helio Strap US$99, BioTracker 6.0, accel, gyro, temp, 25 movements | confirmed | Adds geomagnetic sensor. |
| C6 | Helio Strap Pro shipped June 2026; price not found | corrected | US$199.99, announced 18 Jun 2026; two-sensor system. |
| C7 | Zepp gross margin about 38-39 percent; breakeven Q3 2025 | confirmed | 38.2 percent; revenue US$75.8M; adjusted operating income US$0.4M; later quarters not checked. |
| C8 | Whoop 4.0 MAX86171, MAX32652, MAX6631; 5 LEDs, 4 photodiodes | confirmed | Adds MAX77818 PMIC. |
| C9 | Section 301 List 4A 7.5 percent for 8517.62.0090 | confirmed | Reported under 9903.88.15. |
| C10 | 2026 sequence: IEEPA struck 20 Feb; Section 122 10 percent 24 Feb to 24 Jul; forced-labor 301 from 24 Jul at 12.5 / 10 percent | confirmed | CIT struck Section 122 in May 2026; appeal pending. |
| C11 | JLCPCB SMT US$0.0016-0.0017 per joint, US$8 setup, US$1.50 stencil, US$3 per extended part | confirmed | Setup US$7 on JLCPCB's page, US$8 in 2026 guides. |
| C12 | JLCPCB 4-layer about US$70.6/m2 | unverifiable | Single GitHub note. |
| C13 | 150 mAh 601520 cells US$2-4; ultra-thin US$3-8 | confirmed | US$2-3 at single piece; volume quote-only. |
| C14 | Ultrahuman Bengaluru first, then Plano with SVtronics | confirmed | |
| C15 | GH3026 about US$3; PAH8011 about US$2; MAX86177 about US$6 | unverifiable | One Shenzhen snippet puts GH3026 at about CNY 7.94. |
| C16 | WHOOP tiers US$199 / 239 / 359 | confirmed | |
| C17 | Dial 2025: WHOOP 4.0 rMSSD CCC 0.94, Oura Gen 4 0.99, Garmin 0.87, Polar 0.82 | confirmed | Reference is a Polar H10 chest strap. |

### B.4 Competitors and business (17 checks: 12 confirmed, 5 corrected)

| # | Claim | Verdict | Corrected value or note |
|---|---|---|---|
| K1 | Whoop Series G US$575M at US$10.1B, Mar 2026; US$1.1B bookings; 2.5M members | confirmed | Announced 31 Mar 2026; "bookings run rate". |
| K2 | Whoop US$199 / 239 / 359 per year | confirmed | Unbundled test in Australia from May 2026 (AUD 139 + AUD 300/yr). |
| K3 | FDA letter 14 Jul 2025; closeout reported 23 Jun 2026 | corrected | Close-out letter is a primary fda.gov document dated 17 Jun 2026. |
| K4 | May 2025 upgrade fees US$49 / 79 reversed 10 May 2025 | confirmed | |
| K5 | Oura: >US$500M 2024, about US$1B 2025, US$900M at US$11B, 5.5M rings | confirmed | Superseded by the S-1 of 3 Sep 2026. |
| K6 | Helio Strap US$99 | corrected | MSRP US$99.99. |
| K7 | Polar Loop US$199.99, 3 Sep 2025 | confirmed | |
| K8 | Garmin Index Sleep Monitor US$169.99, 18 Jun 2025 | confirmed | |
| K9 | Fitbit gross margin 43 / 40 / 29.8 percent | corrected | FY2018 39.9 percent GAAP, 40.9 non-GAAP; 43 percent is the 2017 non-GAAP figure (about 42.7 GAAP). |
| K10 | Amazon Halo killed 26 Apr 2023; data deleted; refunds | confirmed | Refunds covered 12-month purchases and prepaid fees. |
| K11 | Atlas Wristband >US$500K Indiegogo; Peloton buyout; successor cancelled | confirmed | Buyout late 2020, confirmed Mar 2021. |
| K12 | IDC Q1 2025 wrist-worn 45.6M, smartwatches 34.8M | confirmed | Wristbands 10.8M. |
| K13 | Rings about 4.4M units, +77 percent in 2025; Oura 74 percent | corrected | IDC about 4.3M and +49 percent; Counterpoint +77 percent. |
| K14 | India rings are the bright spot; Ultrahuman 30.4 percent | corrected | India ring shipments fell 30.6 percent in 2025; ASP down to US$160. |
| K15 | CBP N339661: Whoop bands 9031.90.9195 + 9903.88.01 | confirmed | |
| K16 | IDC India 114.2M units, -4.0 percent; boAt 29.2 percent | confirmed | |
| K17 | Whoop total raised about US$979M | confirmed | Secondary only. |

### B.5 Rep-detection science (14 checks: 10 confirmed, 3 corrected, 1 unverifiable)

| # | Claim | Verdict | Corrected value or note |
|---|---|---|---|
| R1 | RecoFit >95 percent segmentation; 99 / 98 / 96 percent; 114 participants | confirmed | |
| R2 | RecoFit rep count "accurate to ±1" | corrected | Within ±1 rep 93 percent of the time. |
| R3 | MiLift median error 1.12 of 9.65 reps | corrected | Mean, not median; battery life 8.25x extended. |
| R4 | MM-Fit 96 / 94 / 85 / 82 percent | confirmed | |
| R5 | WEAR wrist-only F1 58-67 versus 68-77 with ankle; mAP 28-35 versus 47-61 | corrected | Wrist + ankle F1 68-75, mAP 46-51; all four sensors F1 65-77, mAP 52-61. |
| R6 | Apple Watch StrengthControl 88.4 percent; squat p = 0.68; deadlift p = 0.09 | confirmed | |
| R7 | VBT review 22 studies, 7 of 8 IMUs valid; Vmaxpro ICC 0.91-0.96; GymAware best | confirmed | Vmaxpro between-day reliability ICC 0.55-0.91. |
| R8 | ST MLC gym example config; 3.1 uA MLC overhead | confirmed | |
| R9 | Nordic 1,504 kbps; IMU stream 4.8 kbps | confirmed | Phone links are far slower but still ample. |
| R10 | WHOOP versus PSG 2020 and 2021 figures | confirmed | 2020 result required manual bedtimes. |
| R11 | Six-device PSG study: >90 percent sleep sensitivity; wake specificity 29-52 percent | confirmed | |
| R12 | ssl-wearables F1 gains | confirmed | Matches the author README table. |
| R13 | LIMU-BERT-X deployment figures | confirmed | Primary is arXiv 2509.24303; self-reported. |
| R14 | Few-shot rep counting 0.7 reps MAE, 74 percent exact | unverifiable | Not in the abstract. |

### B.6 Software integration (19 checks: 11 confirmed, 5 corrected, 3 unverifiable)

| # | Claim | Verdict | Corrected value or note |
|---|---|---|---|
| S1 | Web Bluetooth Chromium-only, about 76 percent; none in Safari | confirmed | Secondary corroboration. |
| S2 | Capacitor bluetooth-le lacks state restoration; 5-6 s wake | confirmed | |
| S3 | Android 12+ runtime BLE permissions; neverForLocation | confirmed | |
| S4 | 1,373 kbps DK-to-DK; 14-day HR log drains in 14 s or 97 s | corrected | Link-rate ceiling only; Whoop syncs 24 h of data in 45-60 min. |
| S5 | Whoop stores 14 days unsynced | confirmed | Older articles say 3 days. |
| S6 | WHOOP API 100 per minute, 10,000 per day | confirmed | Official page. |
| S7 | Health Connect ExerciseSegment fields | confirmed | weight, setIndex, RPE gated on FEATURE_EXPANDED_EXERCISE_RECORD. |
| S8 | Google Fit APIs end with 2026 | confirmed | |
| S9 | Terra Quick Start US$399 per month | corrected | US$499 per month annual; 100,000 credits. |
| S10 | Junction US$0.50 per user, US$300 minimum | corrected | Flat US$300 per month up to 500 users. |
| S11 | ROOK Core US$399 for 750 users plus add-ons | corrected | ROOK's page says up to 5,000 users; add-ons are Sahha's figures. |
| S12 | Bluetooth Declaration US$12,000 Adopter, US$6,000 Associate | unverifiable | Fee increase confirmed; amounts not extracted in this pass. |
| S13 | Innovation Incentive US$2,500 declaration | corrected | Programme stopped Feb 2020. |
| S14 | FCC module route leaves Part 15B SDoC US$1.5-4k | confirmed | |
| S15 | FTC HBNR 89 FR 47028, effective 29 Jul 2024 | confirmed | |
| S16 | DPDP Rules 13 Nov 2025; compliance by 13 May 2027 | confirmed | Tranches 14 Nov 2025, 14 Nov 2026, 14 May 2027. |
| S17 | FDA General Wellness reissued 6 Jan 2026 | confirmed | |
| S18 | Movesense price, MOQ, origin | unverifiable | Not published; new Flash product line. |
| S19 | Fitbit, Oura, Garmin, Polar, Ultrahuman, Spike API claims | unverifiable | Search budget. |

### B.7 Startup cost and timeline (14 checks: 6 confirmed, 6 corrected, 1 refuted, 1 unverifiable)

| # | Claim | Verdict | Corrected value or note |
|---|---|---|---|
| T1 | Bolt: simple product US$100-500k, 6-9 months | confirmed | From "Will Your Hardware Startup Make Money?", c.2015, not inflation-adjusted. |
| T2 | Bolt: MOQ 5,000; US$1M BOM per customer per year | confirmed | |
| T3 | Retail 2-5x manufacturing cost | corrected | 2.5-4x. |
| T4 | SIG Adopter US$0; Contributing Adopter small US$3,500 | confirmed | Large US$16,500; first-declaration discount exists, amount not captured. |
| T5 | Declaration fee US$11,040 | corrected | US$12,000 from 1 Mar 2026; US$11,040 applied Jan 2024 to 28 Feb 2026. |
| T6 | US$2,500 listing for firms under US$1M revenue | refuted | No such tier; programme ended Feb 2020. |
| T7 | FCC module route US$3-10k | confirmed | |
| T8 | Custom FCC US$3-12k | corrected | TCB sources differ 10x; SAR US$2.5-6k; US$1.5-12k, up to US$18k. |
| T9 | UN38.3 US$5-7k | corrected | US$300-7,000 by lab and scope. |
| T10 | IEC 62133 / UL above US$20k | corrected | US$1,000-1,500 China labs; US$4,000-6,000 TUV or SGS; US$20k+ is UL listing. |
| T11 | Upwork median US$35, range US$25-50 | confirmed | US freelance average about US$104 (contractrates.fyi). |
| T12 | NRF52-DK 4-week lead time; Nordic recovery | confirmed | Mouser shows 20 weeks; nRF52 superseded by nRF54. |
| T13 | Ultrahuman about 4 months acquisition-to-ship | unverifiable | Company release only; measures finishing a Kickstarted ring. |
| T14 | US certification stack US$10.5-48k | corrected | US$15.5-49k; central US$20-25k. |

### B.8 India policy and trade (24 checks: 17 confirmed, 5 corrected, 2 unverifiable)

| # | Claim | Verdict | Corrected value or note |
|---|---|---|---|
| P1 | SCOTUS 20 Feb 2026, 6-3, IEEPA does not authorise tariffs | confirmed | |
| P2 | IEEPA duties ceased 24 Feb 2026 | confirmed | |
| P3 | Section 122 10 percent, 24 Feb to 24 Jul 2026 | confirmed | Proclamation 11012; FR 2026-03824; CIT struck it in May 2026, appeal pending. |
| P4 | Section 301 10 / 12.5 percent from 24 Jul 2026 | confirmed | 91 FR 47318; CSMS 69326983. |
| P5 | India pays 15 percent (blog) or 18 percent (deal) | corrected | 10 percent tier, and 8517.62.00 is exempt; 18 percent was IEEPA; 15 percent appears nowhere. |
| P6 | Whether 8517.62 is exempt from forced-labor 301 | corrected | Yes, Note 52(b), 9903.05.86; annex not read line by line; 9031.80.80 is not exempt. |
| P7 | China 7.5 percent List 4A plus 12.5 percent tier | confirmed | For 8517.62.00 the total is 7.5 percent; under 9031.80.80 about 39.2 percent. |
| P8 | MFN 8517.62.00 Free | confirmed | |
| P9 | 9031.80 MFN rate and 301 status | unverifiable | 1.7 percent or Free; List 1 25 percent for China. |
| P10 | US-India deal 18 percent; penalty removed 7 Feb 2026 | confirmed | 18 percent void since 24 Feb 2026. |
| P11 | HQ H279898 Fitbit 8517.62.00 | confirmed | |
| P12 | NY N291933 trackers 8517.62.0090; bands separate | corrected | Dated 28 Nov 2017; 8517.62.0050 then; bands 9113.90.8000. |
| P13 | NY N311614 smart watch 8517.62.00 + 7.5 percent | confirmed | Suunto 7; 27 May 2020. |
| P14 | NY N339661 Whoop bands | confirmed | 9031.90.9195 + 9903.88.01, List 1 25 percent. |
| P15 | Section 232 semis: 25 percent narrow scope; reviews | confirmed | Phase 2 not proclaimed as of 14 Sep 2026. |
| P16 | De minimis suspended 29 Aug 2025; status after ruling open | confirmed | Survived via EO 14388 and CBP interim rules of 24 Jun 2026. |
| P17 | FDA wellness guidance 6 Jan 2026 | confirmed | |
| P18 | RoDTEP 0.3-4.3 percent; 8517.62 rate not found | corrected | Operative only to 30 Sep 2026 under Notification 74/2025-26. |
| P19 | PMP ladder for wearable inputs | unverifiable | FY27 rates not found; Budget 2026-27 excluded smartwatch display assemblies. |
| P20 | DPDP Rules Nov 2025; 12-18 months; Rs 250 crore | confirmed | Tranches 14 Nov 2026 and 14 May 2027. |
| P21 | BIS CRS covers smart watches under IS 13252 | confirmed | S.O. 2742(E) of 17 Aug 2017, effective 17 Feb 2018 (secondary); migration guidelines 9 Mar 2026. |
| P22 | WPC ETA self-declaration; no import licence | confirmed | DoT OM 9 Sep 2024; CBIC Instruction 24/2024; fee amount not found in this pass. |
| P23 | E-waste targets 60 / 60 / 70 / 80 percent from FY27 | corrected | 70 percent for FY26 and FY27; 80 percent from FY28. |
| P24 | MPF 0.3464 percent; FY2026 min US$33.58, max US$651.50 | confirmed | |

## Sources

Grouped by lens. Each key in square brackets is the cite key used in the text.

### Hardware architecture

- [Nordic 2022] Nordic, WHOOP 4.0 uses nRF52840. https://www.nordicsemi.com/Nordic-news/2022/07/The-WHOOP-4-uses-Nordics-nRF52840-SoC
- [TechInsights WS40] TechInsights, WHOOP 4.0 teardown DDT-2111-806. https://www.techinsights.com/products/ddt-2111-806
- [TechInsights WG50] TechInsights, WHOOP 5.0 teardown. https://www.techinsights.com/blog/whoop-50-wg50-deep-dive-teardown
- [Electronics360 WG50] Electronics360, WHOOP 5.0 teardown summary. https://electronics360.globalspec.com/article/23159/techinsights-teardown-whoop-5-0
- [TechInsights Sila] TechInsights, WHOOP 4.0 Sila anode. https://www.techinsights.com/blog/teardown/fitness-wearable-whoop-40-leverages-next-generation-battery-anode-technology
- [RBA Ambiq memo] RBA Equity, Ambiq memo (16 Mar 2026). https://rbaequity.org/AMBQ_Investment_Memo.pdf
- [the5krunner 4.0 vs 5.0] the5krunner, WHOOP 4.0 vs 5.0 sensors. https://the5krunner.com/2025/06/16/whoop-4-0-vs-whoop-5-0-sensor-architecture-changes-detailed-technical-content/
- [WHOOP 5.0 support] WHOOP Support, Unlock New with WHOOP 5.0. https://support.whoop.com/s/article/Unlock-New-with-WHOOP-5-0?language=en_US
- [fccid 2AJ2X] fccid.io, Whoop WP40. https://fccid.io/2AJ2X-WP40
- [Ambiq Apollo4] Ambiq, Apollo4 Blue Plus. https://ambiq.com/product/apollo4-blue-plus/
- [EDN Oura] EDN, Oura Ring 4 teardown. https://www.edn.com/the-oura-ring-4-does-one-more-deliver-much-if-any-more/
- [TechInsights Oura] TechInsights, Oura Ring Gen 4 teardown. https://www.techinsights.com/blog/oura-ring-gen-4-teardown
- [Nordic Ultrahuman] Nordic, Ultrahuman Ring Air uses nRF52840. https://www.nordicsemi.com/Nordic-news/2023/09/The-Ultrahuman-Ring-Air-employs-nRF52840-SoC
- [Ultrahuman battery blog] Ultrahuman, ring battery life. https://blog.ultrahuman.com/blog/maximizing-your-ultrahuman-ring-battery-life/
- [Amazfit FAQ] Amazfit India FAQ, Helio Strap battery. https://in.amazfit.com/pages/faq/what-is-the-battery-capacity-of-the-amazfit-helio-strap
- [Helio Strap 2] Notebookcheck, Helio Strap 2 FCC filing. https://www.notebookcheck.net/Amazfit-Helio-Strap-2-New-FCC-filing-proves-the-rumored-Fitbit-Air-rival-is-on-its-way.1308631.0.html
- [Polar Loop manual] Polar Loop manual, specifications. https://support.polar.com/e_manuals/polar-loop/polar-loop-user-manual-english/technical-specifications.htm
- [Garmin Index manual] Garmin Index Sleep Monitor manual. https://www8.garmin.com/manuals/webhelp/GUID-4462687B-8DF5-4719-872E-E16754F9D4B0/EN-US/Index_Sleep_OM_EN-US.pdf
- [Digi-Key nRF52840] Digi-Key, NRF52840-QIAA-R. https://www.digikey.com/en/products/detail/nordic-semiconductor-asa/NRF52840-QIAA-R/7725407
- [Mouser nRF52840] Mouser, nRF52840-QIAA-R7. https://www.mouser.com/en/ProductDetail/Nordic-Semiconductor/nRF52840-QIAA-R7?qs=AQlKX63v8RsCBZQshXcHUQ%3D%3D
- [Digi-Key BMI270] Digi-Key, BMI270. https://www.digikey.com/en/products/detail/bosch-sensortec/BMI270/9974488
- [Bosch BMI270 DS] Bosch, BMI270 datasheet rev 1.6. https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmi270-ds000.pdf
- [LCSC MAX86171] LCSC, MAX86171ENI+. https://www.lcsc.com/product-detail/C3678802.html
- [Digi-Key BQ25180] Digi-Key, BQ25180YBGR. https://www.digikey.com/en/products/detail/texas-instruments/BQ25180YBGR/15857374
- [nRF52840 brief] Nordic, nRF52840 product brief. https://nsscprodmedia.blob.core.windows.net/prod/software-and-other-downloads/product-briefs/nrf52840-soc-product-brief.pdf
- [nRF52840 PS] Nordic, nRF52840 PS v1.11 (mirror). https://mm.digikey.com/Volume0/opasdata/d220001/medias/docus/6469/NRF52840-DK.pdf
- [Zephyr BMI270] Zephyr, bmi270 Kconfig. https://github.com/zephyrproject-rtos/zephyr/blob/main/drivers/sensor/bosch/bmi270/Kconfig
- [Zephyr sensors] Zephyr, drivers/sensor tree. https://github.com/zephyrproject-rtos/zephyr/tree/main/drivers/sensor
- [Zephyr HR sample] Zephyr, peripheral_hr sample. https://github.com/zephyrproject-rtos/zephyr/blob/main/samples/bluetooth/peripheral_hr/README.rst
- [sdk-nrf FOTA] sdk-nrf, FOTA over BLE. https://github.com/nrfconnect/sdk-nrf/blob/main/doc/nrf/app_dev/device_guides/nrf52/fota_update.rst
- [tflite-micro] tflite-micro, cortex_m_generic makefile. https://github.com/tensorflow/tflite-micro/blob/main/tensorflow/lite/micro/tools/make/targets/cortex_m_generic_makefile.inc
- [gowhoop] cs-balazs/gowhoop. https://github.com/cs-balazs/gowhoop
- [PMC12788198] Placement and wearable HR accuracy. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12788198/
- [JMIR Cardio 2025] JMIR Cardio, wrist and arm wearables HR. https://cardio.jmir.org/2025/1/e67110/
- [PMC13358589] PPG HR accuracy across exercise intensities. https://pmc.ncbi.nlm.nih.gov/articles/PMC13358589/
- [JLCPCB GH3220] JLCPCB, Goodix GH3220. https://jlcpcb.com/partdetail/GoodixTechnology-GH3220/C2942337
- [Mbed PAH8011] Mbed, PAH8011ET listing. https://os.mbed.com/components/PAH8011ET-Ultra-Low-Power-PPG-Sensor/
- [YDL 601520] YDL Battery, 601520 150 mAh. https://ydlbattery.com/products/ydl-601520-150mah-3-7v-lithium-polymer-battery-6x15x22mm-with-ph2-0-connector
- [Hardware lens] Research file hardware-arch.json (session scratchpad).

### India manufacturing and supplement

- [BS 21 Nov 2025] Business Standard, boAt local production 76 percent. https://www.business-standard.com/companies/news/boat-s-local-production-up-from-40-to-76-hits-3x-localisation-in-2-years-125112101139_1.html
- [boAt Dixon JV] Dixon NSE announcement, boAt JV. https://nsearchives.nseindia.com/corporate/DIXON_18012022090552_AnnouncementBoat.pdf
- [Dixon Q1 FY26] Dixon Q1 FY26 call highlights. https://finance.yahoo.com/news/dixon-technologies-india-ltd-bom-070551175.html
- [EFY Optiemus] EFY, Optiemus Rs 150 crore ramp. https://www.electronicsforyou.biz/headlines/optiemus-electronics-looking-to-invest-rs-150-cr-to-ramp-up-production-of-laptops-wearables-hearables/
- [Mobility India Noise] Mobility India, Noise and Optiemus. https://www.mobilityindia.com/noise-partners-with-optiemus-electronics-to-aid-the-domestic-production-of-consumer-electronics/
- [EE Times VVDN] EE Times India, VVDN expansion. https://www.eetindia.co.in/vvdn-expands-manufacturing-footprint-to-meet-increased-global-business/
- [VVDN] VVDN, manufacturing. https://www.vvdntech.com/manufacturing
- [BusinessToday EMS] BusinessToday, YES Securities on EMS. https://www.businesstoday.in/markets/stocks/story/kaynes-tech-pg-electroplast-syrma-sgs-cyient-dlm-what-yes-sec-says-on-ems-players-516404-2026-02-17
- [EIT] East India Technologies, smartwatch manufacturing. https://eitplems.com/smartwatch-manufacturer-in-india/
- [Counterpoint Q3 2023] Counterpoint, India Q3 2023 smartwatches, 82 percent local. https://www.counterpointresearch.com/research_portal/india-q3-smartwatch-shipments-hit-fresh-high/
- [Counterpoint Q2 2025] Counterpoint, India smartwatches Q2 2025. https://counterpointresearch.com/en/insights/india-smartwatch-market-q2-2025
- [FoneArena IDC] FoneArena, IDC India wearables 2025. https://www.fonearena.com/blog/476987/indian-wearable-shipments-2025.html
- [IDC 2Q25] IDC, India wearables 2Q25. https://my.idc.com/getdoc.jsp?containerId=prAP53747725
- [PIB ECMS] PIB, ECMS Cabinet approval (PRID 2116172). https://www.pib.gov.in/PressReleasePage.aspx?PRID=2116172&reg=3&lang=2
- [BS 17 Aug 2026] Business Standard, 31 ECMS proposals. https://www.business-standard.com/economy/news/govt-approves-31-proposals-for-7-877-cr-investment-under-ecms-it-secy-126081700883_1.html
- [News On AIR ECMS] News On AIR, 75 ECMS projects (30 Mar 2026). https://www.newsonair.gov.in/75-projects-worth-rs-61000-cr-approved-under-ecms-programme-ashwini-vaishnaw
- [Manorama ECMS] Manorama Yearbook, ECMS explained. https://www.manoramayearbook.in/current-affairs/india/2026/08/18/electronics-component-manufacturing-scheme-ecms-explained.html
- [Business Journal PLI] Business Journal, wearables PLI by April 2022. https://business-journal.in/industry/pli-scheme-for-wearable-devices-by-april-2022-business-journal/
- [CusBuzz] CusBuzz, smart watch duty HS 85176290. https://www.cusbuzz.com/custom-duty-india-smart-watch-hs-85176290
- [TaxTMI 33/2023] TaxTMI, Notification 33/2023-Customs. https://www.taxtmi.com/notifications?id=140054
- [GTA 62058] Global Trade Alert, PMP smart watches. https://globaltradealert.org/state-act/62058
- [India Briefing customs] India Briefing, customs exemptions till 2029. https://www.india-briefing.com/news/india-customs-duty-exemption-electronics-till-2029-45983.html/
- [SIQ BIS] SIQ, BIS transition to IS/IEC 62368-1. https://www.siq.si/en/news/34962/
- [Corpbiz BIS] Corpbiz, BIS CRS fees. https://corpbiz.io/bis-crs-registration
- [Aleph India BIS] Aleph India, smart watches under CRS. https://alephindia.in/product/smart-watches.php
- [Compliance Calendar BIS] Compliance Calendar, BIS for smart watches. https://www.compliancecalendar.in/learn/bis-certification-for-smart-watches-under-is-13252-part-1-2010
- [Standphill IS 16046] Standphill, BIS IS 16046. https://www.standphillindia.in/bis-certification-battery-operated-devices-is-16046.php
- [Bureau Veritas WPC] Bureau Veritas, WPC ETA self-declaration. https://www.cps.bureauveritas.com/newsroom/india-wpc-wing-introduce-equipment-type-approval-eta-through-self-declaration-saral
- [DoT ETA] DoT eServices, ETA. https://eservices.dot.gov.in/equipment-type-approval-eta
- [Moldrite] Moldrite, injection moulding cost India 2026. https://www.moldrite.in/blog/injection-molding-cost-india
- [IndiaMART jigs] IndiaMART, jigs and fixtures. https://m.indiamart.com/tool-machinetech/jigs-fixture.html
- [TUV SUD Bengaluru] TUV SUD Bengaluru lab. https://www.tuvsud.com/en-in/landing/asmea/bangalore-lab
- [UL Bengaluru] UL Solutions India IoT CoE. https://india.ul.com/iotcentreofexcellence/
- [Tata Elxsi FY25] PRNewswire, Tata Elxsi FY25 revenue. https://www.prnewswire.com/news-releases/tata-elxsi-operating-revenue-at-rs-3-729-crores-for-fy25-with-full-year-pbt-at-26-3-302431764.html
- [Nalanda] Nalanda Enterprises, smartwatches under Rs 2,000. https://www.nalandaenterprises.com/blogs/nalanda-blog/best-smartwatch-under-2000-india-2026-guide
- [BookMyForex] BookMyForex, USD to INR. https://www.bookmyforex.com/currency-converter/usd-to-inr/forecast/
- [Trading Economics] Trading Economics, rupee. https://tradingeconomics.com/india/currency
- [Fed H.10] Federal Reserve H.10, India. https://www.federalreserve.gov/releases/h10/hist/dat00_in.htm
- [Ultrahuman Plano] Ultrahuman, US factory capacity. https://cyborg.ultrahuman.com/press-releases/ultrahuman-expands-its-american-factorys-manufacturing-capacity
- [Ultrahuman USA] Ultrahuman, UltraFactory USA. https://cyborg.ultrahuman.com/press-releases/made-in-the-usa-ultrahuman-plants-flag-in-us-with-manufacturing-facility-ultrafactory-to-make-first-wearable-rings-in-the-country
- [Wikipedia Ultrahuman] Wikipedia, Ultrahuman. https://en.wikipedia.org/wiki/Ultrahuman
- [BioSpectrum] BioSpectrum India, Ultrahuman US plant. https://www.biospectrumindia.com/news/90/24537/ultrahuman-plants-flag-in-us-with-manufacturing-facility-to-make-wearable-rings.html
- [Blume] Blume Ventures, Lord of the Rings. https://blume.vc/commentaries/the-lord-of-the-rings-the-quest-for-ultimate-well-being
- [ajuniorvc] ajuniorvc, Ultrahuman case study. https://www.ajuniorvc.com/ultrahuman-unicorn-case-study-product-performance-hardware-oura-ring-review
- [Oura ITC blog] Oura, ITC ruling. https://ouraring.com/blog/oura-itc-case/
- [Businesswire ITC] Businesswire, ITC rules for Oura. https://www.businesswire.com/news/home/20250909387922/en/U.S.-International-Trade-Commission-Rules-in-Favor-of-URA-in-Patent-Case-Against-Ultrahuman-and-RingConn
- [Law360 Ultrahuman] Law360, Ultrahuman loses stay bids. https://www.law360.com/articles/2422599/ultrahuman-loses-bids-to-halt-itc-order-in-oura-patent-case

### China manufacturing

- [Alibaba screenless] Alibaba, screenless fitness bands. https://electronics.alibaba.com/product/fitness-band-without-screen
- [Alibaba OEM/ODM] Alibaba guide, OEM vs ODM wearables. https://electronics.alibaba.com/buyingguides/oem-vs-odm-wearables-which-fits-your-brand
- [Alibaba smartwatch guide] Alibaba guide, smartwatch manufacturer. https://electronics.alibaba.com/buyingguides/smartwatch-manufacturer-guide-oem-vs-odm-selection
- [Alibaba seller blog] Alibaba seller blog, OEM vs ODM wearables 2026. https://seller.alibaba.com/blogs/2026/southeast-asia/smart-wearables/oem-vs-odm-manufacturing-guide-alibaba-b2b
- [Jointcorp] Jointcorp, ECG band ODM/OEM partner. https://www.jointcorp.com/ecg-smart-band-manufacturer-how-to-choose-the-right-odm-oem-partner/
- [Jointcorp bulk] Jointcorp, fitness band bulk pricing and MOQ. https://www.jointcorp.com/fitness-band-wholesale-bulk-pricing-moq-for-businesses/
- [iSmarch] iSmarch, smartwatch manufacturer. https://ismarch.com/smartwatch-manufacturer/
- [PulseLoop survey] foureight84/PulseLoopAndroid, band survey. https://github.com/foureight84/PulseLoopAndroid
- [moyoung-watch] jphein/moyoung-watch. https://github.com/jphein/moyoung-watch
- [zepp-os-esphome] kevdagoat/zepp-os-esphome. https://github.com/kevdagoat/zepp-os-esphome
- [openwhoop] hunterchen7/openwhoop. https://github.com/hunterchen7/openwhoop
- [PebbleOS Goodix] coredevices/PebbleOS, GH3x2x driver. https://github.com/coredevices/PebbleOS
- [AuroraOS] JenTsao/AuroraOS, Mi Band 8 port. https://github.com/JenTsao/AuroraOS
- [threkir BOM] Absence0760/threkir, BOM notes. https://github.com/Absence0760/threkir
- [SZYJC GH3026] SZYJC, Goodix GH3026 listing. https://www.szyjc.com/en/product/C009592877
- [JLCPCB assembly] JLCPCB, assembly price. https://jlcpcb.com/help/article/pcb-assembly-price
- [DC Rainmaker] DC Rainmaker, Helio Band review. https://www.dcrainmaker.com/2025/06/amazfit-helio-band-in-depth-review-99-no-sub-fee-but-worth-it.html
- [BusinessWire Helio Pro] BusinessWire, Helio Strap Pro (18 Jun 2026). https://www.businesswire.com/news/home/20260618031434/en/Amazfit-Introduces-Helio-Strap-Pro-Bringing-Body-Worn-Movement-Intelligence-to-HYROX-and-Hybrid-Training
- [Zepp Q3 2025] PR Newswire, Zepp Health Q3 2025. https://www.prnewswire.com/news-releases/zepp-health-corporation-reports-third-quarter-2025-unaudited-financial-results-302604324.html
- [Foxconn notes] dadachundan/financial_agent, supply chain notes. https://github.com/dadachundan/financial_agent
- [CBP N308565] CBP N308565, Bluetooth earbuds. https://rulings.cbp.gov/ruling/N308565
- [HK Law] Holland & Knight, tariff beat goes on (Jul 2026). https://www.hklaw.com/en/insights/publications/2026/07/and-the-tariff-beat-goes-on
- [the5krunner Whoop suit] the5krunner, WHOOP sues Chinese rival. https://the5krunner.com/2025/10/19/why-whoop-is-suing-a-chinese-rival-over-a-wholesale-imitation-tracker-design/
- [EO 14324] White House, de minimis suspension. https://www.whitehouse.gov/presidential-actions/2025/07/suspending-duty-free-de-minimis-treatment-for-all-countries/
- [Dial 2025] Dial et al. 2025, nocturnal HRV validation. https://physoc.onlinelibrary.wiley.com/doi/10.14814/phy2.70527
- [China lens] Research file china-manufacturing.json (session scratchpad).

### Competitors and business

- [Whoop Series G] BusinessWire, WHOOP Series G. https://www.businesswire.com/news/home/20260331399622/en/WHOOP-Raises-$575-Million-at-$10.1-Billion-Valuation-to-Advance-Global-Health-Platform
- [Whoop Life] WHOOP Life plan. https://www.whoop.com/us/en/life/
- [Whoop membership] WHOOP membership options. https://www.whoop.com/us/en/membership/
- [TrackerVS] TrackerVS, WHOOP pricing 2026. https://trackervs.com/pricing/whoop-pricing/
- [FDA warning letter] FDA warning letter, WHOOP, 14 Jul 2025. https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/whoop-inc-709755-07142025
- [FDA closeout] FDA close-out letter, WHOOP, 17 Jun 2026. https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/whoop-inc-709755-06172026
- [ArentFox Schiff] ArentFox Schiff, Whoop class action. https://www.afslaw.com/perspectives/longevity-lens/whoop-there-it-fda-warning-letter-now-anchors-class-action-against
- [Android Authority] Android Authority, Whoop free upgrade. https://www.androidauthority.com/whoop-free-upgrade-backlash-3556183/
- [Whoop Strength Trainer] BusinessWire, WHOOP Strength Trainer (2023). https://www.businesswire.com/news/home/20230425005456/en/5429321/WHOOP-Introduces-Strength-Trainer-Becomes-First-Wearable-to-Measure-Muscular-Load
- [Whoop 2026 update] the5krunner, Strength Trainer update (28 Feb 2026). https://the5krunner.com/2026/02/28/new-whoop-strength-trainer-update/
- [Whoop what's new] WHOOP, 2026 what's new. https://www.whoop.com/us/en/thelocker/2026-whats-new/
- [G&W Whoop pricing] Gadgets & Wearables, Whoop price testing (25 May 2026). https://gadgetsandwearables.com/2026/05/25/whoop-price-testing/
- [Federal Register Whoop origin] Federal Register, Whoop strap origin determination (14 Dec 2020). https://www.federalregister.gov/documents/2020/12/14/2020-26342/notice-of-issuance-of-final-determination-concerning-a-whoop-strap-device
- [CBP N339661] CBP N339661, Whoop bands from China. https://rulings.cbp.gov/ruling/n339661
- [CNBC Oura] CNBC, Oura US$11B valuation. https://www.cnbc.com/2025/10/14/oura-ringmaker-valuation-fundraise.html
- [Oura S-1] SEC EDGAR, Oura Form S-1 (3 Sep 2026). https://www.sec.gov/Archives/edgar/data/2133022/000119312526381855/d119865ds1.htm
- [the5krunner Oura S-1] the5krunner, Oura S-1 revenue. https://the5krunner.com/2026/09/04/oura-ipo-s1-revenue/
- [BusinessWire Helio] BusinessWire, Helio Strap launch (24 Jun 2025). https://www.businesswire.com/news/home/20250624910772/en/Amazfit-Introduces-Balance-2-Smartwatch-and-Helio-Strap-for-Smarter-Training-Better-Recovery-and-Peak-Performance
- [Polar Loop PR] Polar, Polar Loop launch. https://www.polar.com/en/media-room/polar-launches-polar-loop-first-screen-free-subscription-free-wearable
- [Garmin Index] Garmin newsroom, Index Sleep Monitor. https://www.garmin.com/en-US/newsroom/press-release/sports-fitness/rest-easy-with-the-index-sleep-monitor-smart-sleep-band-from-garmin/
- [Fitbit Air] Android Central, Fitbit Air launch. https://www.androidcentral.com/wearables/fitbit/google-fitbit-air-launch-specs-price
- [FORT] The Gadgeteer, FORT strength band (25 Jul 2026). https://the-gadgeteer.com/2026/07/25/fort-wearable-screenless-strength-band/
- [FORT YC] Y Combinator, FORT. https://www.ycombinator.com/companies/fort
- [Smartprix Ultrahuman] Smartprix, Ring Air price. https://www.smartprix.com/smart_rings/ultrahuman-ring-air-ppd15b9fnrb5
- [Ultrahuman buy] Ultrahuman, Ring AIR India. https://www.ultrahuman.com/in/ring/buy/
- [TechCrunch India rings] TechCrunch, Oura enters India (17 Mar 2026). https://techcrunch.com/2026/03/17/oura-enters-indias-smart-ring-market-with-the-ring-4/
- [TechCrunch Ultrahuman Pro] TechCrunch, Ultrahuman Ring Pro (24 Mar 2026). https://techcrunch.com/2026/03/24/ultrahuman-ramps-up-u-s-push-with-ring-pro-as-oura-tightens-grip/
- [Bloomberg rings] Bloomberg, smart rings 2026. https://www.bloomberg.com/news/articles/2026-01-05/smart-rings-poised-for-2026-growth-oura-set-to-lead
- [Counterpoint rings] Counterpoint, smart rings report. https://counterpointresearch.com/en/reports/from-niche-to-necessity-smart-rings-and-the-next-phase-of-health-tech-evolution
- [IDC Q1 2025] IDC, wrist-worn Q1 2025. https://my.idc.com/getdoc.jsp?containerId=prAP53613925
- [IDC forecast] IDC, wearables forecast. https://my.idc.com/getdoc.jsp?containerId=prUS52615024
- [Fitbit 10-K 2019] SEC EDGAR, Fitbit 10-K FY2019. https://www.sec.gov/Archives/edgar/data/1447599/000144759920000016/fit-20191231.htm
- [Fitbit 10-K 2018] SEC EDGAR, Fitbit 10-K FY2018. https://www.sec.gov/Archives/edgar/data/1447599/000162828019002374/fitbit1231201810-k.htm
- [Fitbit 10-K 2015] SEC EDGAR, Fitbit 10-K FY2015. https://www.sec.gov/Archives/edgar/data/0001447599/000144759916000018/fitbit1231201510k.htm
- [Amazon Halo] Amazon, Halo discontinued. https://www.aboutamazon.com/news/company-news/amazon-halo-discontinued
- [Wareable Atlas] Wareable, Peloton acquires Atlas. https://www.wareable.com/wearable-tech/peloton-acquires-atlas-wearables-8366
- [Tracxn] Tracxn, Whoop funding. https://tracxn.com/d/companies/whoop/__mG8pDMm_crUH9HckmN4Kw7ZEHu-NiVNU_cywdWMo-aA/funding-and-investors
- [Garmin rep blog] Alibaba Wellness blog, Garmin strength accuracy. https://wellness.alibaba.com/fitlife/is-garmin-strength-training-accurate-

### Rep-detection science

- [RecoFit MSR] Microsoft Research, RecoFit page. https://www.microsoft.com/en-us/research/publication/recofit-using-wearable-sensor-find-recognize-count-repetitive-exercises/
- [RecoFit PDF] Morris et al., RecoFit CHI 2014 PDF. https://www.microsoft.com/en-us/research/wp-content/uploads/2016/11/Morris_Workout_CHI_2014.pdf
- [RecoFit ACM] ACM DL, RecoFit. https://dl.acm.org/doi/10.1145/2556288.2557116
- [RecoFit dataset] Microsoft, exercise recognition dataset. https://github.com/microsoft/Exercise-Recognition-from-Wearable-Sensors
- [MiLift] Shen et al., MiLift, IEEE TMC 2018. https://ieeexplore.ieee.org/document/8118128/
- [MM-Fit] Strombäck et al., MM-Fit, IMWUT 2020. https://dl.acm.org/doi/10.1145/3432701
- [RecGym] RecGym dataset. https://zhaxidele.github.io/RecGym/
- [WEAR repo] mariusbock/wear. https://github.com/mariusbock/wear
- [WEAR ACM] Bock et al., WEAR, IMWUT 2024. https://dl.acm.org/doi/10.1145/3699776
- [MyoGym] MDPI, gym recognition with EMG and IMU. https://www.mdpi.com/2571-5577/7/4/59
- [LNCS 2023] LNCS 2023, sets and reps with IMU wristbands. https://link.springer.com/chapter/10.1007/978-3-031-48306-6_7
- [PMC8471343] Sensors 2021, smartwatch workout analysis validation. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8471343/
- [arXiv 2410.00407] Few-shot repetition counting. https://arxiv.org/abs/2410.00407
- [PMC8038306] Sensors 2021, IMU barbell velocity review. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8038306/
- [PMC8431394] IJERPH 2021, barbell velocity with an IMU. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8431394/
- [PMC7404723] Sports 2020, barbell velocity technologies. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7404723/
- [ST MLC gym] ST, MLC gym activity example. https://github.com/STMicroelectronics/STMems_Machine_Learning_Core/tree/master/application_examples/lsm6dsox/Gym%20activity%20recognition
- [Bosch BHY2] Bosch, BHY2 Sensor API (Klio). https://github.com/boschsensortec/BHY2-Sensor-API
- [Zephyr magic_wand] Zephyr, TFLite Micro magic_wand. https://github.com/zephyrproject-rtos/zephyr/tree/main/samples/modules/tflite-micro/magic_wand
- [Nordic throughput] nRF Connect SDK, throughput sample. https://nrfconnectdocs.nordicsemi.com/ncs/latest/nrf/samples/bluetooth/throughput/README.html
- [ssl-wearables] OxWearables/ssl-wearables. https://github.com/OxWearables/ssl-wearables
- [LIMU-BERT-X arXiv] MobiCom 2025 experience paper, arXiv 2509.24303. https://arxiv.org/html/2509.24303
- [Awesome-IMU-Sensing] rh20624/Awesome-IMU-Sensing. https://github.com/rh20624/Awesome-IMU-Sensing
- [PubMed 32713257] Miller et al. 2020, WHOOP vs PSG. https://pubmed.ncbi.nlm.nih.gov/32713257/
- [PMC8226553] Miller et al. 2021, WHOOP-AUTO. https://pmc.ncbi.nlm.nih.gov/articles/PMC8226553/
- [SLEEP Advances] SLEEP Advances 2025, six trackers vs PSG. https://academic.oup.com/sleepadvances/article/6/2/zpaf021/8090472
- [Polar Verity Sense docs] Polar BLE SDK, Verity Sense. https://github.com/polarofficial/polar-ble-sdk/blob/master/documentation/products/PolarVeritySense.md

### Software integration

- [TestMu] TestMu AI, Web Bluetooth support. https://www.testmuai.com/learning-hub/web-bluetooth-browser-support/
- [caniuse] Can I use, Web Bluetooth. https://caniuse.com/web-bluetooth
- [WebBluetoothCG] WebBluetoothCG implementation status. https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md
- [Capacitor #679] capacitor-community/bluetooth-le discussion 679. https://github.com/capacitor-community/bluetooth-le/discussions/679
- [Apple CoreBluetooth] Apple, Core Bluetooth background. https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/CoreBluetooth_concepts/CoreBluetoothBackgroundProcessingForIOSApps/PerformingTasksWhileYourAppIsInTheBackground.html
- [Android BT perms] Android Developers, Bluetooth permissions. https://developer.android.com/develop/connectivity/bluetooth/bt-permissions
- [Zephyr NUS] Zephyr, nus.h. https://github.com/zephyrproject-rtos/zephyr/blob/6275de3e4eac3620d31ba118eafadf6098ee4c24/include/zephyr/bluetooth/services/nus.h
- [Bluetooth PAMS] Bluetooth SIG, PAMS 1.0. https://www.bluetooth.com/specifications/specs/pams-1-0/
- [Nordic DevZone 121341] Nordic DevZone, 2M PHY throughput. https://devzone.nordicsemi.com/f/nordic-q-a/121341/how-to-reach-maximum-ble-throughput-at-2m-phy-with-nrf5340dk-peripheral-and-nrf52-dongle-central
- [WHOOP catching up] WHOOP Support, catching up. https://support.whoop.com/hc/en-us/articles/4414916912027-Why-is-my-WHOOP-Catching-Up-
- [OpenStrap] OpenStrap/protocol README. https://github.com/OpenStrap/protocol/blob/fe1464db98b84ac4d3ce6175d54ada11356d6c62/README.md
- [androidx HC] androidx, ExerciseSegment.kt. https://github.com/androidx/androidx/blob/32a9938c2dd380e9c16873c921d46cfd8d45308c/health/connect/connect-client/src/main/java/androidx/health/connect/client/records/ExerciseSegment.kt
- [androidx releases] androidx Health Connect releases. https://developer.android.com/jetpack/androidx/releases/health-connect
- [Google Fit] Google for Developers, Google Fit. https://developers.google.com/fit
- [HKWorkout.h] HKWorkout.h header mirror. https://github.com/phracker/MacOSX-SDKs/blob/041600eda65c6a668f66cb7d56b7d1da3e8bcc93/MacOSX11.3.sdk/System/iOSSupport/System/Library/Frameworks/HealthKit.framework/Versions/A/Headers/HKWorkout.h
- [Apple 5.1.3] App Store Review Guidelines 5.1.3. https://developer.apple.com/app-store/review/guidelines/#health-and-health-research
- [WHOOP rate limits] WHOOP for Developers, rate limiting. https://developer.whoop.com/docs/developing/rate-limiting/
- [mirobody] thetahealth/mirobody, WHOOP provider. https://github.com/thetahealth/mirobody/blob/33b138770cc851590be3f35f5ea596b4dcf97c13/mirobody/pulse/providers/mirobody_whoop/provider_whoop.py
- [wearipedia] Stanford-Health/wearipedia, Oura fetch. https://github.com/Stanford-Health/wearipedia/blob/28ad9261337ef9ffe3b52121b3b1b597414b022d/wearipedia/devices/oura/oura_ring3_fetch.py
- [polar-stream] hols-zhaw/polar-stream, AccessLink notes. https://github.com/hols-zhaw/polar-stream/blob/c293f2f1e7b3965deeed5fa687bbdb25923ec365/docs/polar_dashboard_project.md
- [Terra pricing] Terra API pricing. https://tryterra.co/pricing
- [Junction pricing] Junction pricing. https://www.junction.com/pricing
- [ROOK pricing] ROOK pricing. https://www.tryrook.io/pricing
- [Nordic DFU] nordicsemi/Android-DFU-Library. https://github.com/nordicsemi/Android-DFU-Library
- [FR HBNR] Federal Register, HBNR final rule 2024-10855. https://www.federalregister.gov/documents/2024/05/30/2024-10855/health-breach-notification-rule
- [S&R DPDP] S&R Associates, DPDP regime. https://www.snrlaw.in/indias-digital-personal-data-protection-regime-takes-effect/
- [Covington FDA] Covington, revised general wellness guidance. https://www.cov.com/en/news-and-insights/insights/2026/01/fda-issues-revised-guidance-on-general-wellness-products
- [FDA town hall] FDA, general wellness town hall (11 Feb 2026). https://www.fda.gov/medical-devices/medical-devices-news-and-events/town-hall-refresh-general-wellness-policy-low-risk-devices-02112026
- [BT SIG fee change] Bluetooth SIG, fee changes effective 1 Mar 2026. https://support.bluetooth.com/hc/en-us/articles/360058202612-Bluetooth-SIG-Schedule-of-Dues-and-Fee-Changes-Effective-01-March-2026
- [BT SIG fees] Bluetooth SIG, fee schedule. https://www.bluetooth.com/fee-schedule/
- [Ezurio] Ezurio, Bluetooth SIG changes. https://www.ezurio.com/resources/blog/bluetooth-sig-changes-everyone-pays
- [eCFR 15.212] eCFR, 47 CFR 15.212. https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-15/subpart-C/section-15.212
- [Hardwario MDBT50Q] Hardwario, CHESTER certification. https://github.com/hardwario/website-hardwario-docs/blob/687e29134252339b7947fcd264a7f04bbfcbf52f/chester/product-certification.md
- [Movesense shop] Movesense shop. https://www.movesense.com/shop/
- [BangleApps] espruino/BangleApps. https://github.com/espruino/BangleApps
- [InfiniTime] InfiniTimeOrg/InfiniTime. https://github.com/InfiniTimeOrg/InfiniTime
- [ZSWatch] ZSWatch README. https://github.com/ZSWatch/ZSWatch/blob/2d93427ba620241d84b87ea8d68bc5fccca5f4d6/README.md

### Startup cost and timeline

- [Bolt make-money] Bolt, Will your hardware startup make money? https://blog.bolt.io/make-money/
- [Bolt Part 2] Bolt, Hardware by the numbers Part 2. https://blog.bolt.io/hardware-financing-manufacturing/
- [Bolt Part 4] Bolt, Hardware by the numbers Part 4. https://blog.bolt.io/hardware-retail-exits/
- [MarkReady] MarkReady, FCC certification cost 2026. https://markready.io/learn/fcc-certification-cost
- [Jettest] Jettest, FCC cost breakdown 2026. https://www.jettest.net/blog/explained-what-is-fcc-certification-cost-breakdown-2026
- [IB-Lenhardt] IB-Lenhardt, FCC requirements. https://ib-lenhardt.com/kb/fcc-requirements
- [SparkFun FCC] SparkFun, module FCC certification (2019). https://www.sparkfun.com/news/3124
- [JJR UN38.3] JJR Lab, UN38.3 cost. https://www.jjrlab.com/news/how-much-does-un383-testing-cost.html
- [Ufine] Ufine Battery, certification 2026. https://www.ufinebattery.com/blog/essential-guide-to-battery-certification-types-costs-timeframes-and-standards/
- [Epec] Epec, battery pack certifications. https://www.epectec.com/batteries/battery-pack-certifications.html
- [DNK IEC 62133] DNK Power, IEC 62133. https://www.dnkpower.com/battery-iec-62133/
- [Upwork] Upwork, embedded engineer rates. https://www.upwork.com/hire/embedded-systems-engineers/cost/
- [contractrates] contractrates.fyi, freelance embedded rates 2026 (cited in verification; URL not captured).
- [Nordic Q3 2025] Investing.com, Nordic Q3 2025 call transcript. https://www.investing.com/news/transcripts/earnings-call-transcript-nordic-semiconductor-q3-2025-sees-strong-revenue-growth-93CH-4320415
- [Avnet NRF52-DK] Avnet, NRF52-DK. https://www.avnet.com/americas/product/nordic-semiconductor/nrf52-dk/evolve-36594030/
- [Mouser NRF52-DK] Mouser, NRF52-DK. https://www.mouser.com/ProductDetail/Nordic-Semiconductor/NRF52-DK
- [Fitt Insider LazyCo] Fitt Insider, Ultrahuman acquires LazyCo. https://insider.fitt.co/ultrahuman-acquires-smart-ring-maker-lazyco/
- [Ultrahuman ring PR] Ultrahuman, new Ring release. https://cyborg.ultrahuman.com/press-releases/the-new-ring-that-gives-you-ultrahuman-power
- [Predictable Designs] Predictable Designs, certification cost. https://predictabledesigns.com/certification-costs-what-it-really-takes/

### India policy and trade

- [Justia SCOTUS] Justia, Learning Resources v. Trump (2026). https://supreme.justia.com/cases/federal/us/607/24-1287/
- [CRS LSB11398] CRS Legal Sidebar LSB11398. https://www.congress.gov/crs-product/LSB11398
- [White & Case IEEPA] White & Case, IEEPA tariffs terminated. https://www.whitecase.com/insight-alert/united-states-terminates-ieepa-based-tariffs-following-supreme-court-decision
- [FR 2026-03824] Federal Register, Proclamation 11012 surcharge. https://www.federalregister.gov/documents/2026/02/25/2026-03824/imposing-a-temporary-import-surcharge-to-address-fundamental-international-payments-problems
- [Skadden S122] Skadden, CIT strikes Section 122 tariffs (May 2026). https://www.skadden.com/insights/publications/2026/05/us-trade-court-strikes-down-section-122-tariffs
- [USTR 301 fact sheet] USTR, Section 301 forced-labor fact sheet (Jul 2026). https://ustr.gov/about/policy-offices/press-office/fact-sheets/2026/july/fact-sheet-ustr-section-301-action-response-failure-60-economies-ban-imports-produced-forced-labor
- [PIB India tier] PIB, India in the 10 percent tier (26 Jul 2026). https://www.pib.gov.in/PressReleasePage.aspx?PRID=2289348&reg=3&lang=1
- [CBP forced-labor HTS list] CBP, forced-labor HTS list (CSMS 69326983 attachment). https://content.govdelivery.com/attachments/USDHSCBP/2026/07/23/file_attachments/3723786/Forced%20Labor%20HTS%20LIST.pdf
- [CSMS 69326983] CBP CSMS 69326983. https://content.govdelivery.com/accounts/USDHSCBP/bulletins/421d887
- [CSMS 64724565] CBP CSMS 64724565, reciprocal tariff exclusion (Apr 2025). https://content.govdelivery.com/accounts/USDHSCBP/bulletins/3db9e55
- [Flexport 301] Flexport, Section 301 forced-labor tariffs. https://www.flexport.com/blog/new-section-301-forced-labor-tariffs-what-importers-need-to-know/
- [USITC HTS] USITC HTS search, 8517.62. https://hts.usitc.gov/search?query=8517.62
- [White House US-India] White House, US-India trade deal (Feb 2026). https://www.whitehouse.gov/fact-sheets/2026/02/fact-sheet-the-united-states-and-india-announce-historic-trade-deal/
- [FR 2025-16419] Federal Register, duties on India under EO 14329. https://www.federalregister.gov/documents/2025/08/27/2025-16419/notice-of-implementation-of-additional-duties-on-products-of-india-pursuant-to-the-presidents
- [CBP H279898] CBP HQ H279898, Fitbit trackers. https://rulings.cbp.gov/ruling/H279898
- [CBP N291933] CBP NY N291933, fitness trackers (mirror). https://www.customsmobile.com/rulings/docview?doc_id=NY+N291933&highlight=9113.90*
- [CBP N311614] CBP NY N311614, smart watch. https://rulings.cbp.gov/ruling/N311614
- [FR 2026-01052] Federal Register, Proclamation 11002 semiconductors. https://www.federalregister.gov/documents/2026/01/20/2026-01052/adjusting-imports-of-semiconductors-semiconductor-manufacturing-equipment-and-their-derivative
- [FR 2026-12670] Federal Register, de minimis suspension. https://www.federalregister.gov/documents/2026/06/24/2026-12670/indefinite-suspension-of-the-de-minimis-exemption-for-merchandise-arriving-through-all-modes-other
- [FR MPF] Federal Register, FY2026 customs user fees. https://www.federalregister.gov/documents/2025/07/23/2025-13869/customs-user-fees-to-be-adjusted-for-inflation-in-fiscal-year-2026-cbp-dec-25-10
- [DGFT RoDTEP] DGFT, RoDTEP. https://www.dgft.gov.in/CP/?opt=RoDTEP
- [Afleo] Afleo, RoDTEP 2026. https://afleo.com/rodtep-scheme/
- [GTA 62057] Global Trade Alert, PMP hearables. https://globaltradealert.org/state-act/62057/india-phased-manufacturing-program-for-the-manufacture-of-hearable-devices-budget-2022-2023
- [PIB DPDP] PIB, DPDP Rules 2025. https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190014&reg=3&lang=2
- [BIS Annexure] BIS, compulsory registration list (Mar 2025). https://www.bis.gov.in/wp-content/uploads/2025/03/temp_2131689472.pdf
- [CBIC ETA instruction] CBIC Instruction 24/2024-Customs (mirror). https://worldtradescanner.com/24-CBIC%20Instruction-22.10.2024.htm
- [CPCB FAQ] CPCB, E-Waste Rules 2022 FAQ. https://cpcb.nic.in/uploads/Projects/E-Waste/FAQ_ewaste_23012024.pdf
- [CBIC GST] CBIC GST portal (not fetched). https://www.cbic-gst.gov.in/
- [Freightos India-US] Freightos India to US route page, Sept 2026 (cited in verification; URL not captured).
- [DHL India-US] DHL and FedEx India-US parcel rates, April 2026 aggregators (cited in verification; URL not captured).
- [dutiable] dutiable.io, smartwatch HS 8517.62. https://dutiable.io/hs-code/watches-clocks/smartwatch

### FitForge codebase

- [FitForge repo] Local checkout /home/user/FitForge at HEAD 542f932. https://github.com/girnarholdings/fitforge
- [IOS-SHELL-CONTRACT] docs/IOS-SHELL-CONTRACT.md. https://github.com/girnarholdings/fitforge/blob/main/docs/IOS-SHELL-CONTRACT.md
- [PREWALK-IOS-HEALTH] docs/PREWALK-IOS-HEALTH.md. https://github.com/girnarholdings/fitforge/blob/main/docs/PREWALK-IOS-HEALTH.md
- [workoutLog.ts] apps/web/components/features/shared/workoutLog.ts. https://github.com/girnarholdings/fitforge/blob/main/apps/web/components/features/shared/workoutLog.ts
- [forgeBridge.ts] apps/web/lib/native/forgeBridge.ts. https://github.com/girnarholdings/fitforge/blob/main/apps/web/lib/native/forgeBridge.ts
- [health store] apps/web/lib/health/store.ts. https://github.com/girnarholdings/fitforge/blob/main/apps/web/lib/health/store.ts
- [readiness engine] apps/web/lib/readiness/engine.ts. https://github.com/girnarholdings/fitforge/blob/main/apps/web/lib/readiness/engine.ts
- [demo store] apps/web/lib/demo/store.ts. https://github.com/girnarholdings/fitforge/blob/main/apps/web/lib/demo/store.ts
- [sync.ts] apps/web/lib/auth/sync.ts. https://github.com/girnarholdings/fitforge/blob/main/apps/web/lib/auth/sync.ts
- [WorkoutPlayer.tsx] apps/web/components/features/workout/WorkoutPlayer.tsx. https://github.com/girnarholdings/fitforge/blob/main/apps/web/components/features/workout/WorkoutPlayer.tsx
- [HealthKitEngine.swift] apps/ios/FitForge/Health/HealthKitEngine.swift. https://github.com/girnarholdings/fitforge/blob/main/apps/ios/FitForge/Health/HealthKitEngine.swift
- [ForgeBridge.swift] apps/ios/FitForge/Bridge/ForgeBridge.swift. https://github.com/girnarholdings/fitforge/blob/main/apps/ios/FitForge/Bridge/ForgeBridge.swift
- [coach worker] workers/coach/src/index.ts. https://github.com/girnarholdings/fitforge/blob/main/workers/coach/src/index.ts
- [firestore.rules] firestore.rules. https://github.com/girnarholdings/fitforge/blob/main/firestore.rules

