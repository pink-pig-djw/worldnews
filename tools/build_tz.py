"""Build src/data/timezones.json: the IANA time zones of every country (from the tz database's
zone.tab, public domain) and which one is the capital's, so the site can show live local time.

Format: {"CC": ["Main/Zone", lat, lng, "Capital", "首都"]}, plus for countries with several zones a
        sixth element [["Zone/A", lat, lng], ...] (lat/lng of each zone's reference city).
        lat/lng/names are the capital's (or the main zone's reference city when there is none).

Usage: python3 tools/build_tz.py [path/to/zone.tab]
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ZONE_TAB = Path(sys.argv[1] if len(sys.argv) > 1 else "/usr/share/zoneinfo/zone.tab")
# Official single-zone countries where zone.tab also lists a local or unofficial zone.
SKIP = {"Asia/Urumqi"}
# Natural Earth spellings that read oddly in the panel ("Washington,  D.C.") or are outdated.
NAME_FIX = {"US": ("Washington", "华盛顿"), "KZ": ("Astana", "阿斯塔纳")}


def coord(s, deg_len):
    """ISO 6709 ±DDMM[SS] / ±DDDMM[SS] -> degrees."""
    sign = -1 if s[0] == "-" else 1
    s = s[1:]
    d, rest = int(s[:deg_len]), s[deg_len:]
    m = int(rest[:2])
    sec = int(rest[2:4]) if len(rest) >= 4 else 0
    return sign * (d + m / 60 + sec / 3600)


def parse_zone_tab(path):
    zones = {}
    for line in path.read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        cc, pos, tz = line.split("\t")[:3]
        if tz in SKIP:
            continue
        i = max(pos.rfind("+"), pos.rfind("-"))
        lat = coord(pos[:i], 2)
        lng = coord(pos[i:], 3)
        zones.setdefault(cc, []).append([tz, round(lat, 2), round(lng, 2)])
    return zones


def dist(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    return math.acos(min(1, math.sin(la1) * math.sin(la2) + math.cos(la1) * math.cos(la2) * math.cos(lo1 - lo2)))


def main():
    zones = parse_zone_tab(ZONE_TAB)
    gaz = json.loads((ROOT / "scripts/data/gazetteer.json").read_text())
    capitals = {}
    for p in gaz["places"]:
        if p.get("cap") and (p["cc"] not in capitals or p["r"] > capitals[p["cc"]]["r"]):
            capitals[p["cc"]] = p
    out = {}
    for cc, zs in sorted(zones.items()):
        cap = capitals.get(cc)
        main = min(zs, key=lambda z: dist((cap["lat"], cap["lng"]), (z[1], z[2]))) if cap else zs[0]
        en, zh = NAME_FIX.get(cc, (cap["en"], cap["zh"]) if cap else ("", ""))
        entry = [main[0], round(cap["lat"], 2), round(cap["lng"], 2), en, zh] if cap else [main[0], main[1], main[2], "", ""]
        if len(zs) > 1:
            entry.append(zs)
        out[cc] = entry
    path = ROOT / "src/data/timezones.json"
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(out)} countries, {sum(len(z) for z in zones.values())} zones -> {path.relative_to(ROOT)} ({path.stat().st_size // 1024} KB)")
    for cc in ("US", "RU", "CN", "AU", "BR", "CA", "UA", "IN", "ID", "KZ", "MX"):
        e = out.get(cc)
        print(cc, e[0], e[3], e[4], len(e[5]) if len(e) > 5 else 1)


if __name__ == "__main__":
    main()
