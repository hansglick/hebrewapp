"""Prépare le premier pool de phrases de /dev/revision-agent : pour chaque énoncé des leçons 0.01 → 0.20
(revision_phrase_analysis.json, questions comprises), Sol relève les concepts retenus qu'il contient, sans tenir compte
du niveau de la phrase ni de celui du concept (cf. demande explicite du user), et prépare l'exercice de complétion :
- concept : identifiant ; concept_definition : description courte (titre de item_concept.json, restreint pour 7 et 11) ;
- concept_word : les mots de l'énoncé qui portent le concept (une seule lettre pour le ל de direction) ;
- truncated_one : l'énoncé coupé juste avant le premier concept_word ; truncated_two : coupé juste après ;
- concept_tip : la règle du concept, résumée en une phrase ; translation_tip : la traduction de la partie manquante.
Résultat : {identifiant de phrase: [{"text", "concepts": [...]}]}, seulement pour les énoncés qui ont au moins un concept.

Usage (depuis backend/) : .venv/Scripts/python.exe -m scripts.build_revision_concept_pool [--out fichier] [leçon ...]
Sans leçon, toutes ; sans --out, data/revision_concept_pool.json.
"""

import asyncio
import json
import sys
from pathlib import Path

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from app.config import DATA_DIR, OPENAI_API_KEY
from app.data_loader import get_dataset
from app.revision_agent.config import EVALUATOR

OUTPUT = DATA_DIR / "revision_concept_pool.json"
KEPT_CONCEPTS = {f"0.{n:02d}" for n in (7, 8, 11, 14, 16, 17, 18, 19)}

# Concepts restreints à une partie de leur leçon (cf. demande explicite du user).
RESTRICTED = {
    "0.07": ("La préposition de direction ל après un verbe de mouvement",
             "Après un verbe de mouvement (aller, venir, voyager, partir…), la destination est introduite par la "
             "préposition ל, accolée au nom (לישראל, לפריז ; contractée avec l'article : לקולנוע = ל + ה). "
             "Seule cette lettre ל porte le concept : concept_word vaut « ל ». Ne retiens pas le ל de l'infinitif, "
             "le ל qui introduit un destinataire (כותב לחנה), le ל décliné (לי, לו…) ni לאן."),
    "0.11": ("Les expressions de succession temporelle אחר כך, אחרי et אחרי ש",
             "אחר כך (ensuite) relie deux propositions indépendantes ; אחרי (après) est suivi d'un nom ; "
             "אחרי ש (après que) est suivi d'une proposition avec un verbe conjugué. "
             "Ne retiens pas le pronom relatif ש seul, ni לפני."),
    "0.14": ("La particule את devant un complément d'objet direct défini",
             "Un complément d'objet direct défini (nom avec l'article ה, nom propre, démonstratif…) est précédé de la "
             "particule את ; un complément indéfini n'en a pas. Ne retiens que les énoncés où la particule את est "
             "présente : concept_word vaut « את », seul, sans le complément qui suit. Ne la confonds pas avec le "
             "pronom personnel את (« tu » au féminin, sujet du verbe : « את פוגשת את חנה » → seul le second את "
             "est la particule). Ne retiens pas un complément indéfini sans את."),
}

PROMPT = """Tu es professeur d'hébreu et linguiste spécialiste de la grammaire de l'hébreu israélien moderne.
On prépare des exercices de complétion pour des débutants francophones : l'élève voit le début d'un énoncé, coupé
au niveau d'un concept de grammaire, et doit imaginer la suite en employant ce concept.

Pour chaque énoncé numéroté, relève chacun des concepts ci-dessous qu'il contient réellement, sans te soucier
du niveau de l'énoncé ni de celui du concept : toute occurrence réelle du point de grammaire compte (par exemple,
n'importe quel nombre pour l'accord des nombres) ; un énoncé de n'importe quelle leçon peut illustrer
n'importe lequel de ces concepts, même s'il vient d'une leçon antérieure ou postérieure au concept. Un énoncé peut contenir plusieurs concepts, ou aucun.
Pour chaque concept relevé, donne :
- concept : son identifiant ;
- concept_word : le ou les mots de l'énoncé qui portent le concept, recopiés exactement tels qu'ils sont écrits,
  dans leur ordre d'apparition (un groupe de mots est permis, ex. « יש לי », « הכי גדול » ; pour le ל de direction,
  la seule lettre « ל ») ; plusieurs éléments si le concept apparaît plusieurs fois ;
- truncated_one : l'énoncé recopié exactement depuis son début jusqu'au premier concept_word, exclu ;
- truncated_two : l'énoncé recopié exactement depuis son début jusqu'au premier concept_word, inclus
  (pour le ל de direction : « הוא הולך ל ») ;
- concept_tip : en français, une phrase qui résume la règle du concept, de manière générale, pour guider l'élève,
  sans rien dire du contenu de l'énoncé ; elle doit convenir aux deux coupes. Exemples : « Après un verbe de
  mouvement, la destination est introduite par la préposition ל. » ; « Quand le complément d'objet direct est défini,
  on le fait précéder de la particule את. » ;
- translation_tip : en français, la traduction de la partie manquante de l'énoncé, c'est-à-dire de tout ce qui suit
  truncated_one (ex. « … au cinéma avec Hanna »), commençant par « … ».

Concepts :
{concepts}"""


class ConceptHit(BaseModel):
    concept: str
    concept_word: list[str] = Field(description="Mots de l'énoncé qui portent le concept, tels qu'écrits")
    truncated_one: str = Field(description="Début de l'énoncé jusqu'au premier concept_word, exclu")
    truncated_two: str = Field(description="Début de l'énoncé jusqu'au premier concept_word, inclus")
    concept_tip: str
    translation_tip: str


class UtteranceHits(BaseModel):
    number: int
    concepts: list[ConceptHit]


class LessonHits(BaseModel):
    utterances: list[UtteranceHits]


def concept_catalog() -> dict[str, tuple[str, str]]:
    """identifiant → (définition courte, explication donnée à Sol)."""
    concepts = get_dataset("concept")
    return {code: RESTRICTED.get(code, (concepts[code]["concept"].rstrip("."), concepts[code]["explication"]))
            for code in sorted(KEPT_CONCEPTS)}


def check(text: str, hit: ConceptHit) -> list[str]:
    problems = [f"« {w} » absent de l'énoncé" for w in hit.concept_word if w not in text]
    if not text.startswith(hit.truncated_two) or not hit.truncated_two.startswith(hit.truncated_one):
        problems.append(f"troncatures incohérentes : « {hit.truncated_one} » / « {hit.truncated_two} »")
    if hit.concept == "0.14" and any(w != "את" for w in hit.concept_word):
        problems.append(f"concept_word doit valoir « את » seul : {hit.concept_word}")
    return problems


async def lesson_hits(client: AsyncOpenAI, code: str, items: list[tuple[str, str]],
                      catalog: dict[str, tuple[str, str]]) -> dict[str, list[dict]]:
    prompt = PROMPT.format(concepts="\n".join(f"- {k} : {d}. {e}" for k, (d, e) in catalog.items()))
    response = await client.responses.parse(
        model=EVALUATOR["model"],
        reasoning={"effort": EVALUATOR["effort"]},
        input=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": "\n".join(f"{i}. {text}" for i, (_, text) in enumerate(items, 1))},
        ],
        text_format=LessonHits,
    )
    found = {u.number: u.concepts for u in response.output_parsed.utterances}
    result: dict[str, list[dict]] = {}
    problems = [f"énoncé {i} non analysé" for i in range(1, len(items) + 1) if i not in found]
    for i, (phrase_id, text) in enumerate(items, 1):
        hits = [h for h in found.get(i, []) if h.concept in catalog]
        problems += [f"{phrase_id} « {text} » [{h.concept}] : {p}" for h in hits for p in check(text, h)]
        if hits:
            result.setdefault(phrase_id, []).append({"text": text, "concepts": [{
                "concept": h.concept, "concept_definition": catalog[h.concept][0], "concept_word": h.concept_word,
                "truncated_one": h.truncated_one, "truncated_two": h.truncated_two,
                "concept_tip": h.concept_tip, "translation_tip": h.translation_tip,
            } for h in hits]})
    print(f"{code} : {len(items)} énoncés, {sum(len(v) for v in result.values())} avec concept, "
          f"{sum(len(u['concepts']) for v in result.values() for u in v)} concepts relevés, "
          f"{len(problems)} anomalie(s)", flush=True)
    for problem in problems:
        print("   -", problem)
    return result


async def main(args: list[str]) -> None:
    output = OUTPUT
    if "--out" in args:
        i = args.index("--out")
        output, args = Path(args[i + 1]), args[:i] + args[i + 2:]
    with open(DATA_DIR / "revision_phrase_analysis.json", encoding="utf-8") as f:
        analysis = json.load(f)
    by_lesson: dict[str, list[tuple[str, str]]] = {}
    for phrase_id, items in analysis.items():
        by_lesson.setdefault(phrase_id.split(":")[0], []).extend((phrase_id, u["text"]) for u in items)
    codes = args or sorted(by_lesson)
    catalog = concept_catalog()
    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    results = await asyncio.gather(*(lesson_hits(client, code, by_lesson[code], catalog) for code in codes))
    pool = {phrase_id: items for result in results for phrase_id, items in result.items()}
    pool = dict(sorted(pool.items(), key=lambda kv: (kv[0].split(":")[0], int(kv[0].split(":")[1]))))
    output.write_text(json.dumps(pool, ensure_ascii=False, indent=4), encoding="utf-8")
    print(f"→ {output}")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
