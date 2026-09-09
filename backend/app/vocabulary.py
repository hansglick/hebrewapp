"""Vocabulaire (mots + verbes) déjà introduit au user jusqu'à un niveau
donné — sert à calibrer le vocabulaire attendu d'un outil externe (ex: la
persona de la conversation en direct, instructions/testlive) sur ce que
l'étudiant a réellement déjà vu, plutôt que tout le cours."""

from app.data_loader import get_dataset
from app.lesson_order import all_lesson_codes_in_order


def _lesson_code_of(item: dict) -> str:
    return f"{item['chapter']}.{item['lesson']}"


def vocabulaire_jusqu_a(level: str) -> dict:
    """{"words": [...], "verbs": [...]} — formes non-vocalisées (clé du
    dataset, identique à `pure`) de tout mot/verbe dont la leçon
    d'introduction (`chapter`.`lesson` dans item_word.json/item_verbe.json)
    se situe entre la toute première leçon du cours et `level` inclus, dans
    l'ordre global du cursus (pas par numéro de chapitre/leçon brut).

    Lève ValueError si `level` n'est pas une leçon du cursus."""
    codes = all_lesson_codes_in_order()
    if level not in codes:
        raise ValueError(f"Niveau inconnu : {level!r}")
    unlocked = set(codes[: codes.index(level) + 1])

    words_data = get_dataset("word")
    verbes_data = get_dataset("verbe")

    words = [key for key, item in words_data.items() if _lesson_code_of(item) in unlocked]
    verbs = [key for key, item in verbes_data.items() if _lesson_code_of(item) in unlocked]

    return {"words": words, "verbs": verbs}


def words_lesson(code_lesson: str) -> str:
    """Texte listant chaque mot de `code_lesson` (chapter.lesson), une ligne
    par mot au format "français : hébreu".

    Lève ValueError si `code_lesson` n'est pas une leçon du cursus."""
    if code_lesson not in all_lesson_codes_in_order():
        raise ValueError(f"Leçon inconnue : {code_lesson!r}")

    words_data = get_dataset("word")
    lines = [
        # Certains mots (ex: préfixes comme בְּ-) portent un "-" en début ou
        # fin de forme dans le dataset pour signaler qu'ils s'attachent à un
        # autre mot — retiré ici, hors-sujet pour ce texte, cf. demande
        # explicite du user.
        f"{item['french']} : {item['original'].strip(' -')}"
        for item in words_data.values()
        if _lesson_code_of(item) == code_lesson
    ]
    return "\n".join(lines)


def verbs_lesson(code_lesson: str) -> str:
    """Texte listant chaque verbe de `code_lesson` (chapter.lesson), une
    ligne par verbe au format "français : hébreu".

    Lève ValueError si `code_lesson` n'est pas une leçon du cursus."""
    if code_lesson not in all_lesson_codes_in_order():
        raise ValueError(f"Leçon inconnue : {code_lesson!r}")

    verbes_data = get_dataset("verbe")
    lines = [
        f"{item['traduction']} : {item['original'].strip(' -')}"
        for item in verbes_data.values()
        if _lesson_code_of(item) == code_lesson
    ]
    return "\n".join(lines)


def sentences_lesson(code_lesson: str) -> str:
    """Texte listant chaque phrase de `code_lesson` (chapter.lesson), une
    ligne par phrase au format "français : hébreu".

    Contrairement à item_word.json/item_verbe.json (un dict plat d'items),
    item_phrase.json est déjà groupé par code de leçon (clé de premier
    niveau) — pas besoin de filtrer via `_lesson_code_of` ici.

    Lève ValueError si `code_lesson` n'est pas une leçon du cursus."""
    if code_lesson not in all_lesson_codes_in_order():
        raise ValueError(f"Leçon inconnue : {code_lesson!r}")

    phrases_data = get_dataset("phrase")
    lines = [
        f"{item['french']} : {item['hebrew'].strip(' -')}"
        for item in phrases_data.get(code_lesson, [])
    ]
    return "\n".join(lines)


# Libellé hébreu de chaque chapitre — copie de CHAPTER_LABELS
# (frontend/src/utils/chapitreDisplay.js), qui n'a pas d'équivalent déjà
# chargé côté backend (item_chapitre.json ne porte que le titre français).
CHAPTER_LABELS_HEBREW = {
    "0": "גור",
    "1": "תלמיד",
    "2": "בחור",
    "3": "ותיק",
    "4": "צבר",
}


# system_instruction d'une persona "professeur de révision" (Gemini Live ou
# équivalent) qui interroge l'étudiant sur le vocabulaire d'une leçon
# précise — cf. demande explicite du user. Template fourni tel quel par le
# user, seules les trois sections MOTS/VERBES/TRADUCTIONS sont injectées.
# {{pseudo}} (double-accolade volontaire) reste littéralement "{pseudo}"
# après le .format() de revision_system_instruction() ci-dessous : c'est la
# seule donnée qui n'est pas connue à la génération du fichier
# item_revision.json (mono-leçon, pas mono-utilisateur) — app.routers.revision
# la substitue à la connexion, une fois l'utilisateur identifié.
REVISION_SYSTEM_INSTRUCTION_TEMPLATE = """Tu es un professeur francophone d'hébreu bienveillant.
Ton but est d'aider un étudiant à réviser les différents items de la leçon en cours.
Commence par te présenter en disant textuellement : « Bonjour {{pseudo}}, je suis là pour te faire réviser la leçon {lesson_index} du chapitre {chapter_label}. »
Tu dois sélectionner un item en français au hasard et lui demander très scolairement de le traduire en hébreu.
Evalue sa réponse et corrige le si nécessaire en fournissant la réponse attendue.
Répète le processus infiniment.


REMARQUES :
- Tu t'adresses à un étudiant francophone, la langue que tu utilises est le français mais tu dois évaluer ses réponses en hébreu.
- L'étudiant peut te poser des questions sur l'hébreu de manière générale. Tu dois y répondre mais finis toujours par revenir à l'exercice de révision (sélection d'un item en français au hasard et lui demander de le traduire en hébreu).
- Quand tu t'adresses à ton étudiant, si tu dois représenter un mot hébreu, utilise les caractères hébraïques.

Les items sont de trois types différents : mot, verbe, traduction
Voici ci-dessous, les items de la leçon en cours et leur traduction structuré ainsi selon le schéma : [item_francais] : [item_hebreu]

# MOTS
{words}

# VERBES
{verbs}

# TRADUCTIONS
{sentences}
"""


def revision_system_instruction(code_lesson: str) -> str:
    """system_instruction complète (cf. REVISION_SYSTEM_INSTRUCTION_TEMPLATE)
    pour la persona de révision de `code_lesson`.

    Lève ValueError si `code_lesson` n'est pas une leçon du cursus (via
    words_lesson/verbs_lesson/sentences_lesson, qui valident déjà)."""
    chapter_id, lesson_number = code_lesson.split(".")
    # "01" -> "1" : plus naturel à l'oral qu'un zéro de tête ("leçon 01").
    lesson_index = str(int(lesson_number))
    chapter_label = CHAPTER_LABELS_HEBREW[chapter_id]
    return REVISION_SYSTEM_INSTRUCTION_TEMPLATE.format(
        lesson_index=lesson_index,
        chapter_label=chapter_label,
        words=words_lesson(code_lesson),
        verbs=verbs_lesson(code_lesson),
        sentences=sentences_lesson(code_lesson),
    )


# system_instruction d'une persona "professeur de concept" (Gemini Live ou
# équivalent) qui fait assimiler pas à pas le concept grammatical d'une
# leçon précise (item_concept.json) — cf. demande explicite du user.
# Template fourni tel quel par le user, seuls TITRE/EXPLICATION/EXEMPLES
# sont injectés. {{pseudo}} : même convention d'échappement que
# REVISION_SYSTEM_INSTRUCTION_TEMPLATE ci-dessus (reste littéralement
# "{pseudo}" après le .format(), substitué à la connexion une fois
# l'utilisateur identifié — pas connu à la génération, mono-leçon).
CONCEPT_SYSTEM_INSTRUCTION_TEMPLATE = """Tu es un professeur francophone d'hébreu bienveillant.
Ton but est d'aider un étudiant à réviser le concept qu'introduit la leçon (uniquement s'il existe).
Tu devras dans l'ordre :
- Saluer l'étudiant en disant "Shalom {{pseudo}}".
- Te présenter.
- Présenter le concept.
- Poser UNE SEULE QUESTION A LA FOIS à l'étudiant afin de lui faire assimiler le concept pas à pas
- Attendre impérativement la réponse de l'étudiant
- Corrige (si elles existent) ses erreurs avec bienveillance et donne-lui la bonne réponse en la justifiant avant de passer à la question suivante. Continue cet échange pas à pas.


# REMARQUES :

- Tu t'adresses à un étudiant francophone, la langue que tu utilises est le français mais tu dois évaluer ses réponses en hébreu.
- Quand tu utilises un mot en hébreu, lors de l'affichage, représente le mot en caractères hébraïques (sans les nikkud)
- L'étudiant peut te poser des questions sur l'hébreu de manière générale. Tu dois y répondre mais finis toujours par revenir à ta mission de lui faire assimiler le concept.
- Utilises tes propres exemples en plus de ceux fournis pour enrichir la conversation.



# DONNES DE LA LECON

- TITRE DU CONCEPT : {concept}
- EXPLICATION DU CONCEPT : {explication}
- EXEMPLES ILLUSTRANT LE CONCEPT : {exemples}
"""


def concept_system_instruction(code_lesson: str) -> str:
    """system_instruction complète (cf. CONCEPT_SYSTEM_INSTRUCTION_TEMPLATE)
    pour la persona qui fait réviser le concept grammatical de
    `code_lesson`.

    Lève ValueError si `code_lesson` n'est pas une leçon du cursus, ou si
    elle n'introduit aucun concept (item_concept.json, champ "presence")."""
    if code_lesson not in all_lesson_codes_in_order():
        raise ValueError(f"Leçon inconnue : {code_lesson!r}")
    concept_item = get_dataset("concept").get(code_lesson)
    if not concept_item or not concept_item.get("presence"):
        raise ValueError(f"Aucun concept pour cette leçon : {code_lesson!r}")
    exemples = "\n".join(concept_item["exemples"])
    return CONCEPT_SYSTEM_INSTRUCTION_TEMPLATE.format(
        concept=concept_item["concept"],
        explication=concept_item["explication"],
        exemples=exemples,
    )


def all_concept_system_instructions() -> dict:
    """{lesson_code: system_instruction} pour toutes les leçons du cursus
    qui introduisent un concept grammatical (item_concept.json, "presence":
    true) — sert à générer item_concept_revision.json hors ligne."""
    concept_data = get_dataset("concept")
    return {
        code: concept_system_instruction(code)
        for code, item in concept_data.items()
        if item.get("presence")
    }


def mots_et_verbes_recents(lesson_code: str, last_n: int) -> tuple[list, list]:
    """(words_list, verbs_list) — formes non-vocalisées de tout mot/verbe
    dont la leçon d'introduction se situe dans la fenêtre des `last_n`
    leçons précédant `lesson_code`, plus `lesson_code` lui-même (fenêtre de
    last_n + 1 leçons au total), dans l'ordre global du cursus. Si moins de
    `last_n` leçons précèdent `lesson_code`, la fenêtre est simplement
    tronquée au début du cursus.

    Exclut les entrées avec value == -1 (jamais réellement introduites dans
    une leçon — un sentinel du dataset, pas une vraie leçon d'apparition).

    Lève ValueError si `lesson_code` n'est pas une leçon du cursus."""
    codes = all_lesson_codes_in_order()
    if lesson_code not in codes:
        raise ValueError(f"Leçon inconnue : {lesson_code!r}")
    idx = codes.index(lesson_code)
    window = set(codes[max(0, idx - last_n) : idx + 1])

    words_data = get_dataset("word")
    verbes_data = get_dataset("verbe")

    def in_window(item: dict) -> bool:
        return item.get("value") != -1 and _lesson_code_of(item) in window

    words_list = [key for key, item in words_data.items() if in_window(item)]
    verbs_list = [key for key, item in verbes_data.items() if in_window(item)]

    return words_list, verbs_list
