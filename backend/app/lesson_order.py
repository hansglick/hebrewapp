import random

from app.data_loader import get_dataset


def all_lesson_codes_in_order() -> list:
    chapitres = get_dataset("chapitre")
    codes = []
    for chap_id in sorted(chapitres.keys(), key=int):
        codes.extend(chapitres[chap_id]["lessons"])
    return codes


def next_lesson_code(level: str) -> str | None:
    """Code du prochain examen à passer (= niveau + 1 dans l'ordre global du
    cours, en tenant compte du passage au chapitre suivant). Un niveau
    introuvable dans la progression (ex: DEFAULT_LEVEL avant toute
    progression, un sentinel "avant le tout début du cours") est traité
    comme précédant la toute première leçon -> renvoie celle-ci. None
    seulement si `level` est déjà la toute dernière leçon du cours (rien de
    plus à passer), ou si le cours est vide."""
    codes = all_lesson_codes_in_order()
    if not codes:
        return None
    if level not in codes:
        return codes[0]
    idx = codes.index(level)
    return codes[idx + 1] if idx + 1 < len(codes) else None


def reference_lesson(level: str) -> str | None:
    """Leçon de référence pour le tirage des révisions/examens (mots,
    verbes, phrases, quizz, oral) : la leçon débloquée la plus avancée =
    niveau + 1, ou `level` lui-même si le cours est déjà terminé (plus de
    "prochaine" leçon). Ne diffère de `next_lesson_code` qu'à ce dernier
    palier : jamais None tant que le cours contient au moins une leçon."""
    nxt = next_lesson_code(level)
    if nxt is not None:
        return nxt
    codes = all_lesson_codes_in_order()
    if not codes:
        return None
    return level if level in codes else codes[-1]


def recency_weights(niveau_level: str) -> dict:
    """Poids de récence par leçon débloquée : 1 pour la toute première leçon
    du cours, N (nombre de leçons débloquées) pour la leçon la plus récente
    accessible (niveau_level lui-même). Dict vide si niveau_level est
    introuvable dans la progression globale."""
    codes = all_lesson_codes_in_order()
    if niveau_level not in codes:
        return {}
    idx = codes.index(niveau_level)
    unlocked = codes[: idx + 1]
    return {code: rank for rank, code in enumerate(unlocked, start=1)}


def level_score(level: str) -> int | None:
    """Position de `level` dans la progression globale (1 pour la toute
    première leçon du cours), utilisée comme score pour la courbe de
    progression. `None` si `level` est introuvable."""
    codes = all_lesson_codes_in_order()
    if level not in codes:
        return None
    return codes.index(level) + 1


def entry_gate_code(code: str) -> str | None:
    """Dernière leçon du chapitre PRÉCÉDENT celui de `code` — l'examen
    "très long" à réussir (écrit ET oral) avant de pouvoir sauter à
    n'importe quelle leçon du chapitre de `code` via une demande
    d'équivalence. Calculée dans l'ordre global (pas par arithmétique sur
    l'id de chapitre) pour rester correcte quel que soit le schéma de
    numérotation des chapitres. None si `code` appartient au tout premier
    chapitre du cours (aucune porte d'entrée à franchir)."""
    chapitres = get_dataset("chapitre")
    chap_id, _, _ = code.partition(".")
    chapter_lessons = chapitres.get(chap_id, {}).get("lessons") or []
    if not chapter_lessons:
        return None
    first_of_chapter = chapter_lessons[0]
    codes = all_lesson_codes_in_order()
    if first_of_chapter not in codes:
        return None
    idx = codes.index(first_of_chapter)
    return codes[idx - 1] if idx > 0 else None


def exam_type_for(code: str) -> str:
    """Classifie une leçon cible selon sa position dans son chapitre :
    dernière leçon du chapitre -> "tres_long" ; sinon, multiple de 5 ->
    "long" ; sinon (y compris la toute première leçon du chapitre) ->
    "rapide". La dernière leçon prime toujours sur la règle du multiple de
    5 (ex: un chapitre de 20 leçons se termine en "tres_long", pas "long",
    même si 20 est un multiple de 5)."""
    chap_id, _, _ = code.partition(".")
    chapitres = get_dataset("chapitre")
    chapter = chapitres.get(chap_id)
    lessons = chapter["lessons"] if chapter else []
    if lessons and code == lessons[-1]:
        return "tres_long"
    n = int(code.split(".")[1])
    if n % 5 == 0:
        return "long"
    return "rapide"


def sample_unique(pool: list, n: int, used: set) -> list:
    """Tire jusqu'à `n` éléments uniques de `pool` (liste d'items dont les
    deux premiers éléments — ou l'item lui-même s'il n'est pas un tuple plus
    long — servent de clé d'unicité), en excluant tout ce qui est déjà dans
    `used`. Jamais de répétition : si moins de `n` candidats uniques sont
    disponibles, renvoie ce qu'il y a. Met à jour `used` avec les clés
    choisies."""
    def key_of(item):
        return item[:2] if isinstance(item, tuple) and len(item) > 2 else item

    candidates = [item for item in pool if key_of(item) not in used]
    if not candidates or n <= 0:
        return []
    n = min(n, len(candidates))
    selected = random.sample(candidates, n)
    used.update(key_of(item) for item in selected)
    return selected


def weighted_sample_unique(pool: dict, n: int, used: set) -> list:
    """Tire jusqu'à `n` clés uniques de `pool` (clé -> poids de récence),
    sans répétition, proportionnellement au poids (mêmes poids que le
    tirage pondéré de révision, mais sans remise). Exclut tout ce qui est
    déjà dans `used` et l'enrichit avec les clés choisies. Jamais de
    répétition : si moins de `n` clés uniques sont disponibles, renvoie ce
    qu'il y a."""
    candidates = {k: w for k, w in pool.items() if k not in used}
    if not candidates or n <= 0:
        return []
    n = min(n, len(candidates))
    keys = list(candidates.keys())
    weights = list(candidates.values())
    selected = []
    for _ in range(n):
        chosen = random.choices(keys, weights=weights, k=1)[0]
        idx = keys.index(chosen)
        selected.append(chosen)
        del keys[idx]
        del weights[idx]
    used.update(selected)
    return selected
