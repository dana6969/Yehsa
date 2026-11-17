# Ballistics preset sources

Every preset in `symbolic/hunt/ballistics.js` is a named factory load. The figures are the maker's published box data, read from the maker's own page on 2026-11-17. Each preset carries its source in the code, and the Ballistics screen shows it under the selected preset.

Verification level: **full** means the weight, ballistic coefficient and muzzle velocity were all read on the maker's page. **bc-listing** means the weight and velocity were read there, but the page text does not print the ballistic coefficient. For those, the BC is the maker's published figure for that bullet and the screen says so.

The solver is a G1 point-mass model. It is a field estimate. Your own ammo, barrel and sight height change the answer, so zero and check at the range.

| Preset | Load | Weight (gr) | G1 BC | Muzzle (fps) | Level | Source |
|---|---|---|---|---|---|---|
| .243 Win | Winchester Super-X 100 gr Power-Point (X2432) | 100 | 0.356 | 2960 | full | https://winchester.com/Products/Ammunition/Rifle/Power-Point |
| 6.5 Creedmoor | Hornady Precision Hunter 143 gr ELD-X (81499) | 143 | 0.625 | 2700 | bc-listing | https://www.hornady.com/ammunition/rifle/6-5-creedmoor-143-gr-eld-x-precision-hunter |
| .270 Win | Winchester Super-X 130 gr Power-Point | 130 | 0.372 | 3060 | full | https://winchester.com/Products/Ammunition/Rifle/Power-Point |
| 7mm-08 | Winchester Super-X 140 gr Power-Point (X708) | 140 | 0.36 | 2800 | full | https://winchester.com/Products/Ammunition/Rifle/Power-Point |
| .308 Win | Winchester Super-X 150 gr Power-Point (X3085) | 150 | 0.294 | 2820 | full | https://winchester.com/Products/Ammunition/Rifle/Power-Point |
| .30-06 | Winchester Super-X 150 gr Power-Point | 150 | 0.294 | 2920 | full | https://winchester.com/Products/Ammunition/Rifle/Power-Point |
| 7mm Rem Mag | Winchester Super-X 150 gr Power-Point (X7MMR1) | 150 | 0.373 | 3090 | full | https://winchester.com/Products/Ammunition/Rifle/Power-Point |
| .300 Win Mag | Winchester Super-X 180 gr Power-Point | 180 | 0.438 | 2960 | full | https://winchester.com/Products/Ammunition/Rifle/Power-Point |
| .350 Legend | Winchester Super-X 180 gr Power-Point (X3501) | 180 | 0.221 | 2100 | full | https://winchester.com/Products/Ammunition/Rifle/Power-Point |
| .450 Bushmaster | Winchester Super-X 260 gr Power-Point (X4501) | 260 | 0.191 | 2110 | full | https://winchester.com/Products/Ammunition/Rifle/Power-Point |
| .30-30 Win | Hornady LEVERevolution 160 gr FTX (82730) | 160 | 0.33 | 2400 | bc-listing | https://www.hornady.com/ammunition/rifle/30-30-win-160-gr-ftx-leverevolution |
| 12 ga rifled slug | Federal Power-Shok Rifled Slug, 2-3/4 in, 1 oz (F127 RS) | 438 | 0.11 | 1610 | full | https://www.federalpremium.com/shotshell/power-shok-rifled-slug/11-F127+RS.html |
| .50 cal muzzleloader | Hornady 50 Cal SST-ML Speed Sabot 250 gr (67270) | 250 | 0.21 | 2250 | full | https://www.hornady.com/muzzleloading/browse/50-cal-lock-n-load-low-drag-with-45-cal-250-gr-sst-bullet |

Screen text: "From the maker’s published box data. Check your own ammo"

- .270 Win: The page lists 3060 fps and 2702 ft-lb, which is 130 gr.
- 12 ga rifled slug: Federal tested in a 30 in barrel with sights 0.5 in above the bore.
- .50 cal muzzleloader: Hornady's velocity is from a T/C Omega with 150 gr charges. Yours depends on your charge.
