"""Repère dans chaque phrase des leçons les mots et les verbes du vocabulaire, sous n'importe quelle forme (repris de
livecoach/samples/word_phrase_map.py et verb_phrase_map.py, qui ont produit les leçons 0.01 → 0.20).

Sol (EVALUATOR, deux appels par leçon : les mots, puis les verbes) découpe chaque phrase en mots et rattache chacun au
mot ou au verbe du vocabulaire dont il est une forme (flexion, préfixes ; conjugaison pour un verbe), en tenant compte
du sens. Candidats : le vocabulaire des leçons L-10 → L+10 (cf. scripts.revision_scope, demande explicite du user).
Le code vérifie que chaque mot est recopié de la phrase, et signale les formes des tables de conjugaison
(item_verbe.json) présentes dans une phrase mais que Sol n'a pas rattachées (rien n'est ajouté automatiquement).

Résultat : data/revision_vocab_occurrences.json, {identifiant de phrase: [{"key", "kind": "mot" | "verbe",
"surface"}]}, les mots puis les verbes, dans l'ordre de la phrase ; les leçons données remplacent les leurs.

Usage (depuis backend/) : .venv/Scripts/python.exe -m scripts.build_revision_vocab_occurrences 0.21-0.30
"""

import asyncio
import re
import sys

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from app.config import DATA_DIR, OPENAI_API_KEY
from app.data_loader import get_dataset
from app.revision_agent.config import EVALUATOR
from scripts.revision_scope import LINK_WINDOW, merge_phrases, parse_lessons, value_lesson, window

OUTPUT = DATA_DIR / "revision_vocab_occurrences.json"
NIQQUD = re.compile(r"[֑-ׇ]")
WORD = re.compile(r"[א-ת֑-ׇ\"'׳״]+")  # un mot hébreu, sans la ponctuation qui l'entoure
KEEP_QUESTION = {"איפה"}  # mots dont le « ? » de la forme d'origine est retiré ; les autres mots à « ? » sont exclus
PREFIXES = "ושהבכלמ"  # préfixes possibles devant une forme verbale (combinables : וש, כש, ומה…)

WORD_PROMPT = """Tu es un linguiste spécialiste de la morphologie de l'hébreu israélien moderne.
On te donne les phrases d'une leçon d'hébreu pour débutants, chacune avec un identifiant,
et une liste de mots de vocabulaire (identifiant, forme avec nikkoud, sens en français).

Pour chaque phrase, découpe-la en mots, dans l'ordre et sans la ponctuation. Pour chaque mot, donne :
- surface : le mot exactement tel qu'il est écrit dans la phrase ;
- lemma : sa forme de base, c'est-à-dire sans article ni préfixe (ה, ו, ב, כ, ל, מ, ש et leurs combinaisons),
  au singulier, au masculin pour un adjectif, à l'état absolu (pas construit), sans suffixe possessif,
  et à l'infinitif pour un verbe ;
- vocab : l'identifiant du mot de vocabulaire dont ce mot est une forme, ou "" s'il n'en est aucun.

Un mot de la phrase est une forme d'un mot de vocabulaire s'il en est une flexion (féminin, masculin, pluriel,
état construit, suffixe possessif), précédée ou non de préfixes.
Tiens compte du sens : un homographe (un mot qui s'écrit pareil mais n'a pas le sens indiqué) n'est pas une forme
du mot de vocabulaire. Par exemple, שבת « samedi » n'est pas ש + בת « fille ».
Un mot de la phrase correspond à au plus un mot de vocabulaire. N'utilise que les identifiants de la liste."""

VERB_PROMPT = """Tu es un linguiste spécialiste de la morphologie de l'hébreu israélien moderne.
On te donne les phrases d'une leçon d'hébreu pour débutants, chacune avec un identifiant,
et une liste de verbes (identifiant = infinitif, infinitif avec nikkoud, sens en français, binyan, racine).

Pour chaque phrase, découpe-la en mots, dans l'ordre et sans la ponctuation. Pour chaque mot, donne :
- surface : le mot exactement tel qu'il est écrit dans la phrase ;
- lemma : sa forme de base, c'est-à-dire l'infinitif pour un verbe ; pour les autres mots, sans article ni préfixe,
  au singulier, au masculin, à l'état absolu ;
- vocab : l'identifiant du verbe de la liste dont ce mot est une forme, ou "" s'il n'en est aucun.

Un mot de la phrase est une forme d'un verbe s'il en est une forme conjuguée (présent, passé, futur, impératif)
ou l'infinitif, précédée ou non de préfixes (ו, ש, כש, ה, ב, ל, מ… et leurs combinaisons).
Le binyan compte : ללמוד (étudier, pa'al) et ללמד (enseigner, pi'el) sont deux verbes distincts.
Un nom ou un adjectif de la même racine n'est pas une forme du verbe : ספר « livre » n'est pas une forme de לספר.
Tiens compte du sens : un mot employé comme nom n'est pas une forme du verbe, même s'il s'écrit comme une forme
conjuguée (אוכל « la nourriture » n'est pas une forme de לאכול, mais אוכל « je mange / il mange » en est une).
Un mot de la phrase correspond à au plus un verbe. N'utilise que les identifiants de la liste."""


class Token(BaseModel):
    surface: str = Field(description="Le mot exactement tel qu'il est écrit dans la phrase")
    lemma: str = Field(description="Sa forme de base")
    vocab: str = Field(description="Identifiant du mot de vocabulaire dont il est une forme, ou chaîne vide")


class PhraseAnalysis(BaseModel):
    id: str
    tokens: list[Token]


class LessonAnalysis(BaseModel):
    phrases: list[PhraseAnalysis]


def words() -> dict[str, dict]:
    """Mots retenus : ni expression de plusieurs mots, ni mot d'une lettre, ni caractère étranger à l'alphabet hébreu,
    ni mot sans leçon."""
    kept = {}
    for key, w in get_dataset("word").items():
        original = w["original"].replace("?", "") if key in KEEP_QUESTION else w["original"]
        bare = NIQQUD.sub("", original).strip()
        lesson = value_lesson(w["value"])
        if lesson and " " not in bare and not re.search(r"[^א-ת]", bare) and len(bare) >= 2:
            kept[key] = {"lesson": lesson, "line": f"- {key} | {original.strip()} | {w['french']}"}
    return kept


def verbs() -> dict[str, dict]:
    """Les verbes, avec leurs formes connues : infinitif et tables de conjugaison de item_verbe.json (quelques verbes
    n'en ont pas)."""
    kept = {}
    for key, v in get_dataset("verbe").items():
        if lesson := value_lesson(v["value"]):
            forms = {key} | {c["conjugaison"] for tense in (v.get("conjugaisons") or {}).values()
                             for c in tense.values()}
            kept[key] = {"lesson": lesson, "forms": forms,
                         "line": f"- {key} | {v['original']} | {v['traduction']} | {v['binyan']} | {v['racine']}"}
    return kept


def bare_forms(word: str) -> set[str]:
    """Le mot et ce qu'il devient une fois retirés 1 à 3 préfixes (ex. וכשלומדים → כשלומדים, שלומדים, לומדים)."""
    forms = {word}
    for n in range(1, 4):
        if len(word) - n >= 2 and all(c in PREFIXES for c in word[:n]):
            forms.add(word[n:])
    return forms


async def lesson_tokens(client: AsyncOpenAI, code: str, kind: str, vocab: dict[str, dict], prompt: str,
                        title: str) -> dict[str, list[tuple[str, str]]]:
    """(identifiant du vocabulaire, forme) trouvés dans chaque phrase de la leçon, dans l'ordre de la phrase."""
    near = window(code, LINK_WINDOW, LINK_WINDOW)
    candidates = {k: v for k, v in vocab.items() if v["lesson"] in near}
    ids = {f"{code}:{i}": p["hebrew"] for i, p in enumerate(get_dataset("phrase")[code])}
    text = ("Phrases :\n" + "\n".join(f"{i} : {h}" for i, h in ids.items())
            + f"\n\n{title} :\n" + "\n".join(v["line"] for v in candidates.values()))
    response = await client.responses.parse(
        model=EVALUATOR["model"],
        reasoning={"effort": EVALUATOR["effort"]},
        input=[{"role": "system", "content": prompt}, {"role": "user", "content": text}],
        text_format=LessonAnalysis,
    )
    analysis = response.output_parsed
    problems = [f"phrase non analysée : {i}" for i in ids if i not in {p.id for p in analysis.phrases}]
    found: dict[str, list[tuple[str, str]]] = {}
    for p in analysis.phrases:
        surfaces = set(WORD.findall(ids.get(p.id, "")))
        for t in p.tokens:
            if t.vocab and t.vocab not in candidates:
                problems.append(f"{p.id} : identifiant hors fenêtre ou inconnu « {t.vocab} » (pour « {t.surface} »)")
            elif t.vocab and t.surface not in surfaces:
                problems.append(f"{p.id} : « {t.surface} » n'est pas dans la phrase")
            elif t.vocab and p.id in ids:
                found.setdefault(p.id, []).append((t.vocab, t.surface))
    if kind == "verbe":  # formes de conjugaison connues, non rattachées : seulement signalées
        for phrase_id, hebrew in ids.items():
            linked = {key for key, _ in found.get(phrase_id, [])}
            for word in WORD.findall(hebrew):
                problems += [f"{phrase_id} : « {word} » ressemble à {key}, non rattaché"
                             for key, v in candidates.items() if key not in linked and bare_forms(word) & v["forms"]]
    print(f"{code} : {len(ids)} phrases, {len(candidates)} {title.lower()} candidats, "
          f"{sum(map(len, found.values()))} formes, {len(problems)} anomalie(s)", flush=True)
    for problem in problems:
        print("   -", problem)
    return found


async def main(args: list[str]) -> None:
    codes = parse_lessons(args)
    vocab_words, vocab_verbs = words(), verbs()
    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    results = await asyncio.gather(*(
        task for code in codes for task in (
            lesson_tokens(client, code, "mot", vocab_words, WORD_PROMPT, "Mots de vocabulaire"),
            lesson_tokens(client, code, "verbe", vocab_verbs, VERB_PROMPT, "Verbes"))))
    occurrences: dict[str, list[dict]] = {}
    for i, found in enumerate(results):
        kind = "mot" if i % 2 == 0 else "verbe"  # mots puis verbes, leçon par leçon (cf. ci-dessus)
        for phrase_id, pairs in found.items():
            occurrences.setdefault(phrase_id, []).extend({"key": k, "kind": kind, "surface": s} for k, s in pairs)
    merge_phrases(OUTPUT, occurrences, codes, 1)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(main(sys.argv[1:]))
