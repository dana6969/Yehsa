# Build the offline radio reference assets.
#   python tools/radio/build_radio_data.py <ccl-data.js> <fema_pep.html> assets/radio
# ccl-data.js : https://www.weather.gov/source/nwr/JS/ccl-data.js (NWS NOAA Weather Radio transmitters, public domain)
# fema_pep.html: FEMA "Broadcasters and Wireless Providers" page, National Public Warning System table
#                (fetched from a web.archive.org copy because fema.gov blocks scripted requests)
import json, re, sys, datetime
ccl, fema, out = sys.argv[1:4]
s = open(ccl).read(); s = s[s.index("["):s.rindex("]") + 1]
data = json.loads(s)
rows = []
for x in data:
    if not x["callsign"] or not x["freq"] or not x["sitestate"]: continue
    try: lat, lon = round(float(x["lat"]), 3), round(float(x["lon"]), 3)
    except ValueError: continue
    counties = {}
    for c in x["counties"]:
        same = c["same"]
        key = (c["county"], c["st"])
        counties.setdefault(key, set()).add(same)
    rows.append([x["callsign"], x["sitename"], x["sitestate"], float(x["freq"]), lat, lon,
                 0 if x["status"] == "NORMAL" else 1,
                 sorted(f"{k[0]}|{k[1]}|{'/'.join(sorted(v))}" for k, v in counties.items())])
rows.sort(key=lambda r: (r[2], r[1]))
json.dump({"source": "NWS NOAA Weather Radio station listing (ccl-data.js)", "sourceUrl": "https://www.weather.gov/nwr/station_listing",
           "fetched": datetime.date.today().isoformat(),
           "note": "Rows: call sign, site, state, MHz, lat, lon, status (0 normal, 1 degraded or out of service when listed), counties as name|state|SAME codes",
           "stations": rows}, open(out + "/nwr_stations.json", "w"), separators=(",", ":"))
h = open(fema, errors="ignore").read()
pep = []
for r in re.findall(r"<tr[^>]*>(.*?)</tr>", h, re.S):
    c = [re.sub(r"<[^>]+>", "", x).strip().lstrip("\ufeff") for x in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", r, re.S)]
    if len(c) == 4 and c[0] != "CALL SIGN": pep.append(c)
json.dump({"source": "FEMA National Public Warning System (Primary Entry Point) stations", "sourceUrl": "https://www.fema.gov/emergency-managers/practitioners/integrated-public-alert-warning-system/broadcasters-wireless",
           "fetched": datetime.date.today().isoformat(), "stations": pep}, open(out + "/pep_stations.json", "w"), separators=(",", ":"))
print(len(rows), len(pep))
