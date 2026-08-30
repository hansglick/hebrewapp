"""Déblocage progressif des contenus "curiosités" (proverbes bibliques,
citations du tanakh, récits bibliques, landmarks, blagues — plus les
expressions et la presse déjà existantes, rétrofittées sur ce même système)
au fil des 159 leçons du cursus.

Principe : chaque type a un ordre figé (mélangé une fois pour toutes, voir
`item_unlock_order.json`, jamais rejoué) sur lequel on avance d'un item
supplémentaire à mesure que l'étudiant progresse dans les leçons — le
premier item du type est débloqué dès la toute première leçon (onboarding),
le dernier pile à la 159e."""

import bisect
import math
import random
from functools import lru_cache

from app.config import DATA_DIR
from app.data_loader import get_dataset
from app.database import DEFAULT_USER_ID
from app.lesson_order import all_lesson_codes_in_order, reference_lesson
from app import curiosite_images

UNLOCK_ORDER_FILE = DATA_DIR / "item_unlock_order.json"

CURIOSITE_TYPES = (
    "proverb",
    "tanakh",
    "recit",
    "landmark",
    "blague",
    "expression",
    "presse",
    "hebreworiginword",
)

# Types dont les items sont des dicts {str(index): item} plutôt que des
# listes [{"index":...}] — nécessaire pour savoir comment indexer get_dataset().
_DICT_SHAPED = {"proverb", "tanakh", "recit", "landmark", "blague", "hebreworiginword"}


@lru_cache(maxsize=1)
def _raw_unlock_order() -> dict:
    import json

    with open(UNLOCK_ORDER_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=None)
def _frozen_order(curiosite_type: str) -> tuple:
    """Ordre figé (mélangé une fois pour toutes) des index d'un type,
    filtré aux items ayant réellement une image quand le type en a besoin —
    recalculé ici (pas au moment de la génération du fichier figé) pour
    rester correct même si une image venait à disparaître plus tard."""
    raw = tuple(_raw_unlock_order().get(curiosite_type, ()))
    if curiosite_type not in ("tanakh", "recit", "landmark", "blague"):
        return raw
    return tuple(i for i in raw if curiosite_images.has_image(curiosite_type, i))


def total_count(curiosite_type: str) -> int:
    return len(_frozen_order(curiosite_type))


def lesson_position(code: str) -> int | None:
    """Position 1..159 de `code` dans le cursus global, ou None si inconnu."""
    codes = all_lesson_codes_in_order()
    if code not in codes:
        return None
    return codes.index(code) + 1


def _program_length() -> int:
    return max(1, len(all_lesson_codes_in_order()))


@lru_cache(maxsize=1)
def _unlock_schedule() -> dict:
    """Position (1..159) à laquelle chaque rang (0-indexé, dans l'ordre
    figé) de chaque type se débloque — calculé pour tous les types
    simultanément afin de répartir les nouveautés le plus régulièrement
    possible à travers les leçons.

    Contrainte dure, non négociable : le rang 0 (premier item) de chaque
    type se débloque à la position 1 (onboarding — chaque type doit avoir
    au moins un item visible dès la première leçon) et son dernier rang à
    la position 159 (dernière leçon du cursus). Calculer position =
    round(P * T / 159) indépendamment pour chacun des 7 types (ancienne
    version) fait que deux types de même effectif (ex: proverb et blague,
    50 items chacun) se débloquent alors TOUJOURS aux mêmes leçons — d'où
    des leçons sans aucune nouveauté et d'autres avec plusieurs types à la
    fois. Les rangs intermédiaires sont donc plutôt distribués globalement :
    le type le plus "en retard" sur sa part proportionnelle est servi en
    premier, sur des positions intermédiaires elles-mêmes régulièrement
    espacées — ce qui lisse le nombre de nouveautés par leçon sur tout le
    cursus (hors des positions 1 et 159, qui concentrent nécessairement les
    7 premiers/derniers items de chaque type)."""
    program = _program_length()
    counts = {t: total_count(t) for t in CURIOSITE_TYPES}

    schedule = {t: [] for t in CURIOSITE_TYPES}
    for t in CURIOSITE_TYPES:
        if counts[t] > 0:
            schedule[t].append(1)

    interior_counts = {t: max(counts[t] - 2, 0) for t in CURIOSITE_TYPES}
    n_interior_total = sum(interior_counts.values())
    n_interior_positions = max(program - 2, 0)

    if n_interior_total > 0 and n_interior_positions > 0:
        remaining = dict(interior_counts)
        filled = {t: 0 for t in CURIOSITE_TYPES}
        for k in range(1, n_interior_total + 1):
            best_type, best_ratio = None, None
            for t in CURIOSITE_TYPES:
                if remaining[t] <= 0:
                    continue
                ratio = filled[t] / interior_counts[t]
                if best_type is None or ratio < best_ratio:
                    best_type, best_ratio = t, ratio
            filled[best_type] += 1
            remaining[best_type] -= 1
            position = 1 + math.ceil(k * n_interior_positions / n_interior_total)
            schedule[best_type].append(position)

    for t in CURIOSITE_TYPES:
        if counts[t] > 1:
            schedule[t].append(program)

    return {t: tuple(positions) for t, positions in schedule.items()}


def unlocked_count(curiosite_type: str, position: int) -> int:
    """Nombre d'items débloqués à la position de leçon `position` (1..159) —
    au moins 1 dès la première leçon, tous à la dernière, réparti le plus
    régulièrement possible entre les deux (voir `_unlock_schedule`)."""
    total = total_count(curiosite_type)
    if total == 0 or position <= 0:
        return 0
    schedule = _unlock_schedule()[curiosite_type]
    return bisect.bisect_right(schedule, min(position, _program_length()))


def pool_cumulatif(curiosite_type: str, position: int) -> list[int]:
    """Index débloqués (tous types confondus, ordre figé) jusqu'à `position`
    incluse — utilisé par les écrans "Fun" (tout ce qui est débloqué)."""
    order = _frozen_order(curiosite_type)
    return list(order[: unlocked_count(curiosite_type, position)])


def pool_delta(curiosite_type: str, position: int) -> list[int]:
    """Index qui se débloquent précisément à `position` (pas avant) —
    utilisé par la tuile "Curiosité" d'une leçon. Vide si cette leçon
    n'apporte rien de neuf pour ce type (répartition pas forcément 1-par-1)."""
    order = _frozen_order(curiosite_type)
    before = unlocked_count(curiosite_type, position - 1) if position > 1 else 0
    after = unlocked_count(curiosite_type, position)
    return list(order[before:after])


def current_lesson_position(conn) -> int:
    row = conn.execute("SELECT level FROM user_level WHERE user_id = ?", (DEFAULT_USER_ID,)).fetchone()
    level = row["level"] if row else None
    ref = reference_lesson(level) if level is not None else reference_lesson(None)
    pos = lesson_position(ref) if ref else None
    return pos if pos is not None else 1


def random_any_item() -> dict | None:
    """Item vraiment aléatoire, tous types confondus, SANS respecter le
    déblocage progressif — utilisé pour distraire le user pendant l'attente
    d'une correction Gemini sur un examen long/très long (peut donc montrer
    un item que le user n'a pas encore débloqué dans sa progression)."""
    types_with_items = [t for t in CURIOSITE_TYPES if total_count(t) > 0]
    if not types_with_items:
        return None
    curiosite_type = random.choice(types_with_items)
    index = random.choice(_frozen_order(curiosite_type))
    item = get_item(curiosite_type, index)
    if item is None:
        return None
    return {**item, "curiosite_type": curiosite_type}


def _dataset_item(curiosite_type: str, index: int) -> dict | None:
    data = get_dataset(curiosite_type)
    if curiosite_type in _DICT_SHAPED:
        return data.get(str(index))
    return next((item for item in data if item.get("index") == index), None)


def get_item(curiosite_type: str, index: int) -> dict | None:
    """Objet du dataset pour cet index, enrichi d'une clé `image_url`
    normalisée (résolue par motif pour tanakh/recit/landmark/blague, chemin
    déjà littéral pour expression/presse, absente pour proverb)."""
    item = _dataset_item(curiosite_type, index)
    if item is None:
        return None
    enriched = dict(item)
    if curiosite_type in ("tanakh", "recit", "landmark", "blague"):
        enriched["image_url"] = curiosite_images.image_relative_path(curiosite_type, index)
    elif curiosite_type in ("expression", "presse"):
        enriched["image_url"] = item.get("imagepath")
    else:
        enriched["image_url"] = None
    return enriched
