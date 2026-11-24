# Radio and Compass (Field)

## What Radio does, and does not, do

Yehsa never claims a phone can tune AM or FM. What ships:

| Feature | Works | Needs signal? | Notes |
|---|---|---|---|
| NOAA Weather Radio guide | yes | no | Seven channels (WX1 162.550 to WX7 162.525 MHz), SAME county codes, and a county/area lookup from `assets/radio/nwr_stations.json`. This is a list to read, not a tuner. |
| Emergency stations by area | yes | no | FEMA Primary Entry Point (PEP) stations from `assets/radio/pep_stations.json`. |
| Open the phone's own FM app | where the maker ships one | no | `expo-intent-launcher` plus a `<queries>` list (`plugins/withFmAppQueries.js`). Yehsa only launches it. Many phones have no FM app, or the chip is disabled. Yehsa cannot detect the FM chip from JavaScript, so the button is offered as "try", never as "your phone can". |
| Internet radio | yes | **yes (data or Wi-Fi)** | Directory is radio-browser.info. Playback through `expo-audio` with `shouldPlayInBackground`. On Android a media-playback foreground service (`plugins/withRadioBackground.js`, `modules/yehsa-radio-playback`) keeps the stream going when the phone is locked, with play, pause, and stop on the notification and lock screen. |
| USB RTL-SDR dongle | **not shipped** | n/a | See below. |

### Why FM and AM are not tuned in-app

* Android has no public API for the FM chip. Some Qualcomm and MediaTek phones had hidden system FM services, and those are closed to apps on modern Android. Most phones sold in North America have the FM chip disabled in software.
* AM has no phone hardware at all.

### Why RTL-SDR is skipped

* Expo has no maintained module that streams an RTL-SDR's samples to JavaScript. It would need an untested native module.
* A dongle on Android needs USB-OTG and the separate `rtl_tcp_andro` driver app, and a demodulator written in JS, which is heavy on battery and CPU.
* AM broadcast sits below the dongle's range without an upconverter.
* None of it can be verified here (no hardware, no APK build allowed for this task).
It is mentioned in the guide only as something to try with third-party apps.

### Data provenance

* NOAA/NWS: weather radio transmitter and county data. U.S. Government work, public domain.
* FEMA IPAWS PEP station table (public domain), recovered from a web.archive.org copy because fema.gov blocks automated fetches. The fetch date is in each JSON file (`fetched`).
* Rebuild: `python tools/radio/build_radio_data.py`.

## Compass

Heading is from the magnetometer plus accelerometer, tilt-compensated, low-pass filtered with wrap-safe smoothing. Declination comes from NOAA WMM2025 evaluated on the phone (`src/phone/wmm.js`), valid 2025 to 2030, checked against NOAA's published test values (`tools/compass/WMM2025_TEST_VALUES.txt`, `test_compass.mjs`). Calibration is a figure-8 prompt, with a sphere fit for the hard-iron offset. The accuracy indicator comes from the field strength and the spread of readings, not from a guess. If the phone has no magnetometer, the screen falls back to the manual bearing tools.
