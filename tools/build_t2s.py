#!/usr/bin/env python3
"""Write scripts/data/t2s.json: a traditional -> simplified character map (from OpenCC's
TSCharacters table) used to normalise traditional-Chinese headlines before place and topic
matching. Only single-character mappings are kept; displayed titles are never altered."""
import json
import os
from pathlib import Path

import opencc

src = Path(os.path.dirname(opencc.__file__)) / "dictionary" / "TSCharacters.txt"
out = {}
for line in src.read_text(encoding="utf-8").splitlines():
    if not line.strip():
        continue
    trad, simp = line.split("\t")
    simp = simp.split()[0]
    if len(trad) == 1 and len(simp) == 1 and trad != simp:
        out[trad] = simp
dest = Path(__file__).resolve().parent.parent / "scripts" / "data" / "t2s.json"
dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"{len(out)} characters -> {dest.relative_to(dest.parent.parent.parent)} ({dest.stat().st_size // 1024} KB)")
