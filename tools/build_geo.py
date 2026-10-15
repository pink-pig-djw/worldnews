#!/usr/bin/env python3
"""Build the geographic data used by the site and the news pipeline.

Inputs: Natural Earth (public domain) vector data, downloaded on first run into .cache/ne/.
Outputs:
  public/geo/countries-110m.json   simplified country polygons for the globe (code, en, zh)
  src/data/countries.json          compact metadata for every country code (names, label point)
  scripts/data/gazetteer.json      place-name index used to geolocate headlines (en + zh)

Boundaries follow Natural Earth's default (de facto) view, except Crimea, which is shown
as part of Ukraine in line with UN General Assembly resolution 68/262.

Usage: python3 tools/build_geo.py   (requires opencc-python-reimplemented for zh conversion)
"""
import json
import math
import re
import unicodedata
import urllib.request
from pathlib import Path

from opencc import OpenCC

from gazetteer_extra import (
    ADMIN1_COUNTRIES,
    COUNTRY_ALIASES,
    DEMONYMS,
    EN_DENY,
    MANUAL_PLACES,
    PSEUDO_COUNTRIES,
    ZH_ALIASES,
    ZH_DENY,
    ZH_PAIRS,
    ZH_SHORT,
    ZH_STOP,
)

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "ne"
NE_BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
t2s = OpenCC("t2s").convert

KIND_RANK = {"country": 9.0, "region": 6.5, "sea": 6.5, "city": 0.0, "admin1": 4.5,
             "org": 3.0, "actor": 3.0, "macro": 2.0}
KIND_WEIGHT = {"country": 1.0, "region": 1.0, "sea": 0.9, "city": 1.0, "admin1": 0.95,
               "org": 0.35, "actor": 0.55, "macro": 0.3, "demonym": 0.8}
CRIMEA_CITIES = {"Sevastopol", "Sevastapol", "Simferopol", "Kerch", "Yalta", "Feodosiya", "Yevpatoriya"}


def ne(name):
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{name}.geojson"
    if not path.exists():
        print("downloading", name)
        urllib.request.urlretrieve(NE_BASE + f"{name}.geojson", path)
    return json.loads(path.read_text(encoding="utf-8"))


def code_of(p):
    for key in ("ISO_A2_EH", "ISO_A2"):
        v = p.get(key)
        if v and v != "-99":
            return v
    return p["ADM0_A3"]


def fold(s):
    """ASCII-fold diacritics: Türkiye -> Turkiye."""
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def norm_en(name):
    """Tokenise a name the same way scripts/lib/geo.mjs tokenises text."""
    s = name.replace("’", "'").replace("‘", "'")
    s = re.sub(r"\bSt\.", "St", s)
    s = s.replace("U.S.", "US").replace("U.K.", "UK").replace("U.N.", "UN").replace("D.C.", "DC")
    toks = re.findall(r"[0-9A-Za-zÀ-ÖØ-öø-ÿĀ-ž]+(?:'[0-9A-Za-zÀ-ÖØ-öø-ÿĀ-ž]+)*", s)
    return " ".join(toks)


def clean_zh(s):
    if not s:
        return None
    s = t2s(s).strip()
    s = s.replace("(", "（").replace(")", "）")
    return s or None


ZH_SUFFIXES = ["维吾尔自治区", "壮族自治区", "回族自治区", "特别行政区", "自治共和国", "联邦直辖市",
               "自治区", "自治州", "联邦区", "边疆区", "直辖市", "共和国", "省", "州", "邦", "市", "县", "郡", "府", "区"]


def zh_variants(s):
    out = [s]
    for suf in ZH_SUFFIXES:
        if s.endswith(suf) and len(s) - len(suf) >= 2:
            out.append(s[: -len(suf)])
            break
    return out


def r2(x):
    return round(float(x), 3)


class Gazetteer:
    def __init__(self):
        self.places = []
        self.by_id = {}
        self.en = {}
        self.zh = {}

    def add_place(self, pid, kind, cc, lat, lng, en, zh, rank, weight=None, extra=None):
        if pid in self.by_id:
            return self.by_id[pid]
        idx = len(self.places)
        rec = {"id": pid, "k": kind, "cc": cc, "en": en, "zh": zh or en,
               "lat": r2(lat), "lng": r2(lng), "r": round(rank, 2),
               "w": weight if weight is not None else KIND_WEIGHT.get(kind, 1.0)}
        if extra:
            rec.update(extra)
        self.places.append(rec)
        self.by_id[pid] = idx
        return idx

    def add_en(self, name, idx, deny=True):
        if not name:
            return
        for variant in {name, fold(name)}:
            key = norm_en(variant)
            if not key or len(key) < 2:
                continue
            if deny and key in EN_DENY:
                continue
            lst = self.en.setdefault(key, [])
            if idx not in lst:
                lst.append(idx)

    def add_zh(self, name, idx, variants=True):
        if not name:
            return
        names = zh_variants(name) if variants else [name]
        for n in names:
            if len(n) < 2 or n in ZH_DENY:
                continue
            if re.search(r"[A-Za-z]", n) and not re.search(r"[一-鿿]", n):
                continue
            lst = self.zh.setdefault(n, [])
            if idx not in lst:
                lst.append(idx)


def build():
    g = Gazetteer()
    countries50 = ne("ne_50m_admin_0_countries")
    countries110 = ne("ne_110m_admin_0_countries")
    cities = ne("ne_10m_populated_places")
    admin1 = ne("ne_10m_admin_1_states_provinces")

    # ---------- countries ----------
    meta = {}
    chosen = {}
    for f in countries50["features"]:
        p = f["properties"]
        code = code_of(p)
        prev = chosen.get(code)
        if prev is None or (p.get("POP_EST") or 0) > (prev.get("POP_EST") or 0):
            chosen[code] = p
    for code, p in sorted(chosen.items()):
        zh = ZH_SHORT.get(code) or clean_zh(p.get("NAME_ZH")) or p["NAME"]
        en = p["NAME_LONG"] if "." in p["NAME"] else p["NAME"]
        if code == "US":
            en = "United States"
        meta[code] = {"en": en, "zh": zh, "lat": r2(p["LABEL_Y"]), "lng": r2(p["LABEL_X"]),
                      "cont": p.get("CONTINENT"), "sub": p.get("SUBREGION"), "pop": int(p.get("POP_EST") or 0)}
    for code, m in PSEUDO_COUNTRIES.items():
        meta[code] = m

    country_idx = {}
    for code, m in meta.items():
        if code in PSEUDO_COUNTRIES:
            continue
        rank = KIND_RANK["country"] + math.log10(max(m["pop"], 10))
        idx = g.add_place(f"c-{code}", "country", code, m["lat"], m["lng"], m["en"], m["zh"], rank)
        country_idx[code] = idx
        p = chosen[code]
        names = {p["NAME"], p["NAME_LONG"], p["ADMIN"], p.get("NAME_EN") or "", p.get("GEOUNIT") or ""}
        for alt in (p.get("NAME_ALT") or "").split("|"):
            names.add(alt.strip())
        for n in names:
            if n and "." not in n:
                g.add_en(n, idx, deny=False)
        for n in COUNTRY_ALIASES.get(code, []):
            g.add_en(n, idx, deny=False)
        for n in {clean_zh(p.get("NAME_ZH")), m["zh"], clean_zh(p.get("NAME_ZHT"))}:
            if n:
                g.add_zh(n, idx, variants=False)
        for n in ZH_ALIASES.get(code, []):
            g.add_zh(n, idx, variants=False)

    # demonyms -> country (separate places so they can carry a lower weight)
    for code, words in DEMONYMS.items():
        if code not in meta:
            continue
        m = meta[code]
        idx = g.add_place(f"d-{code}", "country", code, m["lat"], m["lng"], m["en"], m["zh"],
                          KIND_RANK["country"], weight=KIND_WEIGHT["demonym"])
        for w in words:
            g.add_en(w, idx, deny=False)
            if w[-1] in "ni" and not w.endswith(("ese", "ish")):
                g.add_en(w + "s", idx, deny=False)

    # ---------- manual places (conflict zones, seas, organisations, actors) ----------
    for mp in MANUAL_PLACES:
        pid, kind, cc, lat, lng, en_names, zh_names = mp[:7]
        weight = mp[7] if len(mp) > 7 else None
        if lat is None and cc in meta:
            lat, lng = meta[cc]["lat"], meta[cc]["lng"]
        # hand-picked places outrank Natural Earth namesakes; orgs/actors/macro regions stay low
        rank = KIND_RANK[kind] if kind in ("org", "actor", "macro") else 8.5
        idx = g.add_place(pid, kind, cc, lat, lng, en_names[0] if en_names else pid,
                          zh_names[0] if zh_names else (en_names[0] if en_names else pid), rank, weight)
        for n in en_names:
            g.add_en(n, idx, deny=False)
        for n in zh_names:
            g.add_zh(n, idx, variants=False)

    # ---------- cities ----------
    caps = {"Admin-0 capital", "Admin-0 capital alt", "Admin-0 region capital"}
    n_city = 0
    for f in sorted(cities["features"], key=lambda f: -(f["properties"]["POP_MAX"] or 0)):
        p = f["properties"]
        pop = p["POP_MAX"] or 0
        cla = p["FEATURECLA"] or ""
        is_cap = cla in caps
        if not (pop >= 150_000 or is_cap or (cla.startswith("Admin-1") and pop >= 60_000)):
            continue
        cc = p["ISO_A2"] if p["ISO_A2"] not in ("-99", None) else p["ADM0_A3"]
        if p["NAME"] in CRIMEA_CITIES or p["NAMEASCII"] in CRIMEA_CITIES:
            cc = "UA"
        if cc not in meta:
            continue
        name = p["NAME"]
        rank = math.log10(max(pop, 1000)) + (2.5 if is_cap else 0)
        pid = f"p-{cc}-{fold(p['NAMEASCII'] or name).lower().replace(' ', '-')}"
        if pid in g.by_id:
            continue
        zh = clean_zh(p.get("NAME_ZH"))
        idx = g.add_place(pid, "city", cc, p["LATITUDE"], p["LONGITUDE"], name, zh, rank,
                          extra={"cap": 1} if is_cap else None)
        n_city += 1
        names = {name, p["NAMEASCII"] or ""}
        for alt in (p.get("NAMEALT") or "").split("|"):
            alt = alt.strip()
            if alt and len(alt) > 3 and not re.search(r"[0-9]", alt):
                names.add(alt)
        for n in names:
            if n:
                g.add_en(n, idx)
        if zh:
            g.add_zh(zh, idx)

    # ---------- first-level admin divisions for news-heavy countries ----------
    country_en = {norm_en(n) for code in meta for n in [meta[code]["en"]]}
    n_adm = 0
    for f in admin1["features"]:
        p = f["properties"]
        cc = p.get("iso_a2")
        if cc not in ADMIN1_COUNTRIES:
            continue
        name = p.get("name")
        if not name or p.get("latitude") is None:
            continue
        if p.get("adm0_a3") == "RUS" and name in ("Crimea", "Sevastopol"):
            cc = "UA"
        key = fold(name).lower().replace(" ", "-").replace("'", "")
        pid = f"a-{cc}-{key}"
        zh = clean_zh(p.get("name_zh"))
        idx = g.add_place(pid, "admin1", cc, p["latitude"], p["longitude"], name,
                          zh_variants(zh)[-1] if zh else None, KIND_RANK["admin1"])
        n_adm += 1
        names = {name, p.get("name_en") or ""}
        for alt in (p.get("name_alt") or "").split("|"):
            alt = alt.strip()
            if alt and len(alt) > 3 and "'" not in alt and not re.search(r"[0-9.]", alt):
                names.add(alt)
        for n in names:
            if not n or len(n) < 4 or "." in n:
                continue
            if norm_en(n) in country_en:
                continue
            g.add_en(n, idx)
        if zh:
            g.add_zh(zh, idx)

    # ---------- polygons for the globe ----------
    feats = []
    crimea_ring = None
    for f in countries110["features"]:
        if f["properties"]["ADM0_A3"] == "RUS":
            polys = f["geometry"]["coordinates"]
            keep = []
            for poly in polys:
                xs = [c[0] for c in poly[0]]
                ys = [c[1] for c in poly[0]]
                if 32 < min(xs) and max(xs) < 37 and 44 < min(ys) and max(ys) < 46.5:
                    crimea_ring = poly
                else:
                    keep.append(poly)
            f["geometry"]["coordinates"] = keep
    for f in countries110["features"]:
        p = f["properties"]
        code = code_of(p)
        geom = f["geometry"]
        if code == "UA" and crimea_ring is not None:
            polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
            geom = {"type": "MultiPolygon", "coordinates": polys + [crimea_ring]}

        def rnd(coords):
            if isinstance(coords[0], (int, float)):
                return [round(coords[0], 2), round(coords[1], 2)]
            return [rnd(c) for c in coords]

        m = meta.get(code, {"en": p["NAME"], "zh": clean_zh(p.get("NAME_ZH"))})
        feats.append({"type": "Feature", "properties": {"code": code, "en": m["en"], "zh": m["zh"]},
                      "geometry": {"type": geom["type"], "coordinates": rnd(geom["coordinates"])}})

    out_poly = ROOT / "public" / "geo" / "countries-110m.json"
    out_poly.parent.mkdir(parents=True, exist_ok=True)
    out_poly.write_text(json.dumps({"type": "FeatureCollection", "features": feats},
                                   ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    out_meta = ROOT / "src" / "data" / "countries.json"
    out_meta.parent.mkdir(parents=True, exist_ok=True)
    compact = {c: [m["en"], m["zh"], m["lat"], m["lng"], m.get("sub") or ""] for c, m in sorted(meta.items())}
    out_meta.write_text(json.dumps(compact, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    out_gaz = ROOT / "scripts" / "data" / "gazetteer.json"
    out_gaz.parent.mkdir(parents=True, exist_ok=True)
    pair_ids = {code: country_idx.get(code) for code in meta}
    pair_ids["EU"] = g.by_id.get("eu")
    zh_pairs = {k: [pair_ids[a], pair_ids[b]] for k, (a, b) in ZH_PAIRS.items()
                if pair_ids.get(a) is not None and pair_ids.get(b) is not None}
    out_gaz.write_text(json.dumps({"version": 1, "places": g.places, "en": g.en, "zh": g.zh,
                                   "zhPairs": zh_pairs, "zhStop": ZH_STOP},
                                  ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(f"countries={len(meta)} cities={n_city} admin1={n_adm} places={len(g.places)} "
          f"en_keys={len(g.en)} zh_keys={len(g.zh)}")
    for path in (out_poly, out_meta, out_gaz):
        print(f"{path.relative_to(ROOT)}: {path.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    build()
