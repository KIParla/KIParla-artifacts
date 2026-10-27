"""player_data.py - Conversation data for the KIParla player, read from KIParla-collection.

load_conversation(collection, code) returns the dict that player.js expects: turns with speaker,
begin/end in ms and text (from tsv/<CODE>.vert.tsv), plus the conversation and participant
metadata (metadata/conversations.tsv, metadata/participants.tsv).
"""
import csv
import os
import sys
from pathlib import Path

ARTIFACTS_ROOT = Path(__file__).resolve().parent.parent
# The text of each turn is built with the same code as the conversation pages (tools/linear2html.py),
# so orthographic and enriched renderings are identical to those pages.
TOOLS = Path(os.environ.get("KIPARLA_TOOLS", ARTIFACTS_ROOT.parent / "tools"))
# <MODULES>/<Module>/translations/<CODE>.translations.json (optional, only some modules have them)
MODULES = Path(os.environ.get("KIPARLA_MODULES", ARTIFACTS_ROOT.parent / "moduli"))
sys.path.insert(0, str(TOOLS))
import linear2html as l2h  # noqa: E402


def read_tsv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f, delimiter="\t"))


def module_of(code):
    """The module whose generated page <Module>/html/<code>.html exists in this repo."""
    for html in ARTIFACTS_ROOT.glob(f"*/html/{code}.html"):
        return html.parent.parent.name
    return None


def hms_to_s(hms):
    h, m, s = (int(x) for x in hms.split(":"))
    return h * 3600 + m * 60 + s


def translations_of(code, units):
    """tu_idx -> [translation text, ...] for the conversation, empty if it has none."""
    for f in sorted(MODULES.glob(f"*/translations/{code}.translations.json")):
        return {i: [t for _spk, t in tr] for i, tr in l2h.build_translations_map(l2h.load_translations(f), units).items()}
    return {}


def turns_of(tsv, code):
    """[speaker, begin_ms, end_ms, orthographic_html, enriched_html, [translations]] per unit."""
    units = l2h.load_tsv_units(tsv)
    translations = translations_of(code, units)
    turns, prev_end = [], 0
    for u in units:
        if not (u["orth_text"] or u["jeff_text"]):
            continue
        # a unit without timing sits at the end of the previous one
        b = u["begin"] if u["begin"] is not None else prev_end
        e = u["end"] if u["end"] is not None else b
        prev_end = e
        turns.append([
            u["speaker"], b, e,
            l2h.markup_orthographic(u["orth_text"]) if u["orth_text"] else "",
            '<span class="jtext">' + l2h.markup_jefferson(u["jeff_text"]) + "</span>",
            translations.get(u["tu_idx"], []),
        ])
    return turns


_tables = {}


def _metadata(collection):
    """conversations and participants tables, reread when the files change."""
    paths = [collection / "metadata" / n for n in ("conversations.tsv", "participants.tsv")]
    stamp = tuple(p.stat().st_mtime for p in paths)
    if _tables.get("stamp") != (collection, stamp):
        _tables["stamp"] = (collection, stamp)
        _tables["conversations"] = {r["code"]: r for r in read_tsv(paths[0])}
        _tables["participants"] = {r["code"]: r for r in read_tsv(paths[1])}
    return _tables["conversations"], _tables["participants"]


def load_conversation(collection, code):
    """Data of one conversation, or None if the collection has no such code."""
    tsv = collection / "tsv" / f"{code}.vert.tsv"
    if not tsv.is_file():
        return None
    conversations, participants = _metadata(collection)
    meta = conversations.get(code, {})
    turns = turns_of(tsv, code)
    duration = hms_to_s(meta["duration"]) if meta.get("duration") else (turns[-1][2] // 1000 + 1)
    return {
        "code": code,
        "module": module_of(code),
        "meta": {k: meta.get(k, "") for k in ("type", "duration", "participants-number", "year", "collection-point")},
        "participants": [
            {k: participants.get(p, {}).get(k, "") for k in ("occupation", "gender", "birth-region", "age-range", "study-level")} | {"code": p}
            for p in (meta.get("participants") or "").split(";") if p
        ],
        "duration": duration,
        "has_translations": any(t[5] for t in turns),
        "turns": turns,
    }
