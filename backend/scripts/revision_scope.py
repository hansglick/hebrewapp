"""Périmètre des scripts de préparation de LiveCoach au-delà des leçons 0.01 → 0.20 (cf. demande explicite du user).

- Les leçons sont prises dans l'ordre global (0.01 … 0.48, 1.01 … 4.09), sans tenir compte des chapitres.
- Fenêtre : une phrase de la leçon L n'est rattachée qu'aux concepts, mots et verbes des leçons L-10 → L+10 ; ses
  questions reprennent simplement le vocabulaire de la phrase (cf. build_revision_questions).
- Les données des leçons 0.01 → FROZEN_LAST ne sont jamais retraitées : les scripts n'écrivent que les leçons qu'on
  leur donne (« 0.21-0.30 » ou une liste de codes) et refusent les leçons figées.
- COURSE_LAST : dernière leçon des données préparées (cours, phonétique…). L'app ne propose les leçons qu'à partir
  de app.revision_agent.config.LAST_LESSON : préparer les données ne change rien pour l'élève.
"""

import json
import re
from functools import lru_cache
from pathlib import Path

from app.data_loader import get_dataset

FROZEN_LAST = "0.20"
COURSE_LAST = "0.30"
LINK_WINDOW = 10  # concepts, mots et verbes : L-10 → L+10


def lesson_key(code: str) -> tuple[int, int]:
    chapter, number = base_lesson(code).split(".")
    return int(chapter), int(number)


def base_lesson(code: str) -> str:
    """La leçon d'un code de leçon ou de concept (« 0.33a », concept scindé, → « 0.33 »)."""
    return re.match(r"\d+\.\d+", code).group()


@lru_cache(maxsize=1)
def order() -> list[str]:
    """Les 159 leçons, dans l'ordre global."""
    return sorted(get_dataset("lesson"), key=lesson_key)


def position(code: str) -> int:
    return order().index(base_lesson(code))


def window(code: str, before: int, after: int) -> set[str]:
    """Les leçons de L-before à L+after (ordre global)."""
    i = position(code)
    return set(order()[max(0, i - before):i + after + 1])


def in_course(code: str) -> bool:
    return position(code) <= position(COURSE_LAST)


def value_lesson(value: int) -> str | None:
    """La leçon d'un champ « value » de item_word / item_verbe (chapitre × 100 + leçon ; -1 : sans leçon)."""
    code = f"{value // 100}.{value % 100:02d}"
    return code if value > 0 and code in order() else None


def parse_lessons(args: list[str]) -> list[str]:
    """Les leçons demandées (« 0.21-0.30 », ou des codes), dans l'ordre ; refuse les leçons figées."""
    codes: list[str] = []
    for arg in args:
        first, _, last = arg.partition("-")
        codes += order()[position(first):position(last or first) + 1]
    frozen = [c for c in codes if position(c) <= position(FROZEN_LAST)]
    if not codes or frozen:
        raise SystemExit(f"Leçons à donner après {FROZEN_LAST} (ex. « 0.21-0.30 ») ; figées : {frozen or 'aucune'}")
    return sorted(set(codes), key=position)


def phrase_key(phrase_id: str) -> tuple[int, int]:
    """Clé de tri d'un identifiant de phrase « leçon:index »."""
    code, index = phrase_id.split(":")[:2]
    return position(code), int(index)


def merge_phrases(path: Path, entries: dict, codes: list[str], indent: int) -> None:
    """Écrit dans path ({identifiant de phrase: données}) les phrases des leçons codes, à la place des anciennes : celles
    des autres leçons restent telles quelles, à leur place ; les nouvelles suivent, dans l'ordre."""
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    data = {phrase_id: v for phrase_id, v in data.items() if phrase_id.split(":")[0] not in codes}
    data |= dict(sorted(entries.items(), key=lambda kv: phrase_key(kv[0])))
    path.write_text(json.dumps(data, ensure_ascii=False, indent=indent), encoding="utf-8")
    print(f"→ {path.name} : {len(entries)} phrases des leçons {codes[0]} → {codes[-1]}")
