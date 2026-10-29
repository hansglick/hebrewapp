"""Rassemble en un seul fichier toutes les données des phrases du cours (leçons 0.01 → 0.20) dont se sert l'agent
LiveCoach de /dev/revision-agent (cf. demande explicite du user). Le texte des leçons, pour la compréhension, reste
dans item_text.json.

Sources (préparées par les autres scripts build_revision_*, qui restent les seuls à les lire) :
- item_phrase.json : les phrases du cours, leur traduction et leur origine (exercice, texte, question, traduction) ;
- revision_phrase_analysis.json : le découpage de chaque phrase en énoncés, et l'action de chaque énoncé ;
- revision_concept_pool.json : les concepts retenus de chaque énoncé, avec l'exercice de complétion ;
- revision_svc_pool.json : ce qui peut se décliner (sujets et leurs verbes, prépositions déclinées) ;
- revision_questions.json : les questions naturelles qui ont l'énoncé pour réponse ;
- revision_vocab_occurrences.json : les mots et les verbes du vocabulaire présents dans chaque phrase.

Seuls les énoncés qui servent à un exercice (concept, déclinaison ou question) sont gardés, et seules les phrases qui
en gardent au moins un. Sol (EVALUATOR, un appel par leçon) traduit ce qui manque : chaque énoncé d'une phrase qui en
a plusieurs (la traduction de item_phrase.json couvre la phrase entière), et chaque question. Relancer le script
réutilise les traductions déjà présentes dans le fichier.

Résultat : data/revision_course.json,
{"phrases": {identifiant de phrase « leçon:index »: {
    "lesson", "origin", "he", "fr",
    "utterances": [{
        "he", "fr", "is_question", "action": {"fr", "he"},
        "concepts": [{"id", "definition", "words", "truncated_one", "truncated_two", "concept_tip", "translation_tip",
                      "constraint"}],   (constraint : cf. build_revision_completion_constraints.py)
        "subjects": [{"he", "fr", "person", "gender", "number", "verbs": [{"he", "infinitive"}]}],
        "declined_prepositions": [{"he", "base", "person", "gender", "number"}],
        "vocabulary": [{"key", "kind": "mot" | "verbe", "surface"}],
        "questions": [{"he", "fr", "hint", "interrogative", "category": "simple" | "preposition" | "accord"}]}]}}}

Usage (depuis backend/) : .venv/Scripts/python.exe -m scripts.build_revision_course
"""

import asyncio
import json
import re

from openai import AsyncOpenAI
from pydantic import BaseModel

from app.config import DATA_DIR, OPENAI_API_KEY
from app.data_loader import get_dataset
from app.revision_agent.config import EVALUATOR, LAST_LESSON, LESSON_CHAPTER

OUTPUT = DATA_DIR / "revision_course.json"

# Catégorie d'une question d'après son groupe interrogatif : accord (איזה / איזו / אילו), sinon mot interrogatif
# simple en tête, sinon précédé d'une préposition (עם מי, מאיפה, לאן…).
AGREEMENT = re.compile(r"(?<![א-ת])[בלמ]?(?:איזה|איזו|אילו)(?![א-ת])")
SIMPLE_INTERROGATIVES = ("מה", "מי", "איפה", "מתי", "למה", "איך", "כמה")

SPLIT_PROMPT = """Tu traduis de l'hébreu vers le français pour un cours d'hébreu destiné à des francophones débutants.
Chaque phrase numérotée du cours est donnée avec sa traduction française, puis découpée en énoncés. Donne la traduction
française de chaque énoncé, dans l'ordre : reprends autant que possible les mots de la traduction de la phrase, sans
les tirets de dialogue ; un énoncé qui est une question se termine par « ? »."""

QUESTION_PROMPT = """Tu traduis de l'hébreu vers le français pour un cours d'hébreu destiné à des francophones
débutants. Chaque question numérotée est donnée avec la phrase qui y répond. Traduis la question en français naturel,
fidèlement (même personne : tutoiement pour אתה / את, vouvoiement pluriel pour אתם / אתן), terminée par « ? »."""


class UtteranceTranslations(BaseModel):
    number: int
    translations: list[str]


class SplitResult(BaseModel):
    phrases: list[UtteranceTranslations]


class QuestionTranslation(BaseModel):
    number: int
    translation: str


class QuestionResult(BaseModel):
    questions: list[QuestionTranslation]


def load(name: str):
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


def question_category(interrogative: str) -> str:
    if AGREEMENT.search(interrogative):
        return "accord"
    return "simple" if interrogative.split()[0] in SIMPLE_INTERROGATIVES else "preposition"


def contains(text: str, word: str) -> bool:
    """word apparaît dans text comme mot entier (pas au milieu d'un autre mot hébreu)."""
    return re.search(rf"(?<![א-ת]){re.escape(word)}(?![א-ת])", text) is not None


def by_utterance(pool: dict[str, list[dict]]) -> dict[tuple[str, str], dict]:
    return {(phrase_id, u["text"]): u for phrase_id, items in pool.items() for u in items}


async def ask(client: AsyncOpenAI, prompt: str, content: str, schema):
    response = await client.responses.parse(
        model=EVALUATOR["model"],
        reasoning={"effort": EVALUATOR["effort"]},
        input=[{"role": "system", "content": prompt}, {"role": "user", "content": content}],
        text_format=schema,
    )
    return response.output_parsed


async def split_translations(client: AsyncOpenAI, phrases: list[dict]) -> dict[tuple[str, str], str]:
    """Traduction de chaque énoncé des phrases données ({"id", "he", "fr", "utterances": [hébreu]})."""
    content = "\n\n".join(
        f"{i}. {p['he']}\nTraduction : {p['fr']}\nÉnoncés :\n" + "\n".join(f"- {u}" for u in p["utterances"])
        for i, p in enumerate(phrases, 1))
    result = await ask(client, SPLIT_PROMPT, content, SplitResult)
    found = {}
    for item in result.phrases:
        if 1 <= item.number <= len(phrases):
            p = phrases[item.number - 1]
            if len(item.translations) == len(p["utterances"]):
                found.update({(p["id"], u): fr.strip() for u, fr in zip(p["utterances"], item.translations)})
    return found


async def question_translations(client: AsyncOpenAI, questions: list[tuple[str, str]]) -> dict[str, str]:
    """Traduction de chaque question donnée ((question, énoncé qui y répond))."""
    content = "\n".join(f"{i}. {q} (réponse : {answer})" for i, (q, answer) in enumerate(questions, 1))
    result = await ask(client, QUESTION_PROMPT, content, QuestionResult)
    return {questions[item.number - 1][0]: item.translation.strip()
            for item in result.questions if 1 <= item.number <= len(questions)}


def in_scope(phrase_id: str) -> bool:
    chapter, _, number = phrase_id.split(":")[0].partition(".")
    return chapter == LESSON_CHAPTER and int(number) <= LAST_LESSON


async def main() -> None:
    course_phrases = {f"{code}:{i}": p for code, items in get_dataset("phrase").items() for i, p in enumerate(items)}
    analysis = load("revision_phrase_analysis.json")
    concepts = by_utterance(load("revision_concept_pool.json"))
    declensions = by_utterance(load("revision_svc_pool.json"))
    questions = load("revision_questions.json")
    occurrences = load("revision_vocab_occurrences.json")
    previous = load(OUTPUT.name)["phrases"] if OUTPUT.exists() else {}

    # Traductions déjà faites : (phrase, énoncé) → français, et question → français.
    known_utterances = {(pid, u["he"]): u["fr"] for pid, p in previous.items() for u in p["utterances"]}
    known_questions = {q["he"]: q["fr"] for p in previous.values() for u in p["utterances"] for q in u["questions"]}

    phrases = {}
    for phrase_id, items in analysis.items():
        if not in_scope(phrase_id):
            continue
        source = course_phrases[phrase_id]
        utterances = []
        for u in items:
            key, text = (phrase_id, u["text"]), u["text"]
            seen = set()  # une question peut venir des deux pools : une seule fois
            model_questions = []
            for entry in questions.get(phrase_id, []):
                for q in entry["questions"] if entry["text"] == text else []:
                    if q["question"] not in seen:
                        seen.add(q["question"])
                        model_questions.append({"he": q["question"], "fr": "", "hint": q["hint"],
                                                "interrogative": q["interrogative"],
                                                "category": question_category(q["interrogative"]),
                                                # cf. build_revision_question_targets.py
                                                **({"target": q["target"]} if q.get("target") else {})})
            declension = declensions.get(key, {})
            utterance = {
                "he": text,
                "fr": "",
                "is_question": "?" in text,
                "action": u["action"],
                "concepts": [{"id": c["concept"], "definition": c["concept_definition"], "words": c["concept_word"],
                              "truncated_one": c["truncated_one"], "truncated_two": c["truncated_two"],
                              "concept_tip": c["concept_tip"], "translation_tip": c["translation_tip"],
                              # cf. build_revision_completion_constraints.py
                              **({"constraint": c["constraint"]} if c.get("constraint") else {})}
                             for c in concepts.get(key, {}).get("concepts", [])],
                "subjects": declension.get("subjects", []),
                "declined_prepositions": declension.get("declined_prepositions", []),
                "vocabulary": [o for o in occurrences.get(phrase_id, []) if contains(text, o["surface"])],
                "questions": model_questions,
            }
            if utterance["concepts"] or utterance["subjects"] or utterance["declined_prepositions"] or model_questions:
                utterances.append(utterance)
        if utterances:
            phrases[phrase_id] = {"lesson": phrase_id.split(":")[0], "origin": source["origin"],
                                  "he": source["hebrew"], "fr": source["french"], "utterances": utterances}

    # Traductions : celle de la phrase pour un énoncé seul, sinon déjà faite, sinon à demander à Sol.
    to_split: dict[str, list[dict]] = {}
    to_translate: dict[str, list[tuple[str, str]]] = {}
    for phrase_id, p in phrases.items():
        single = len(analysis[phrase_id]) == 1
        for u in p["utterances"]:
            u["fr"] = p["fr"] if single else known_utterances.get((phrase_id, u["he"]), "")
            for q in u["questions"]:
                q["fr"] = known_questions.get(q["he"], "")
                if not q["fr"]:
                    to_translate.setdefault(p["lesson"], []).append((q["he"], u["he"]))
        if any(not u["fr"] for u in p["utterances"]):
            to_split.setdefault(p["lesson"], []).append({
                "id": phrase_id, "he": p["he"], "fr": p["fr"], "utterances": [u["he"] for u in p["utterances"]]})
    if to_split or to_translate:
        print(f"Sol : {sum(len(v) for v in to_split.values())} phrases à découper, "
              f"{sum(len(v) for v in to_translate.values())} questions à traduire", flush=True)
        client = AsyncOpenAI(api_key=OPENAI_API_KEY)
        results = await asyncio.gather(*[split_translations(client, v) for v in to_split.values()],
                                       *[question_translations(client, list(dict.fromkeys(v)))
                                         for v in to_translate.values()])
        utterance_fr = {k: v for r in results[:len(to_split)] for k, v in r.items()}
        question_fr = {k: v for r in results[len(to_split):] for k, v in r.items()}
        for phrase_id, p in phrases.items():
            for u in p["utterances"]:
                u["fr"] = u["fr"] or utterance_fr.get((phrase_id, u["he"]), "")
                for q in u["questions"]:
                    q["fr"] = q["fr"] or question_fr.get(q["he"], "")

    ordered = dict(sorted(phrases.items(), key=lambda kv: (kv[0].split(":")[0], int(kv[0].split(":")[1]))))
    OUTPUT.write_text(json.dumps({"phrases": ordered}, ensure_ascii=False, indent=1), encoding="utf-8")

    utterances = [u for p in ordered.values() for u in p["utterances"]]
    missing = sum(not u["fr"] for u in utterances) + sum(not q["fr"] for u in utterances for q in u["questions"])
    print(f"{len(ordered)} phrases, {len(utterances)} énoncés → {OUTPUT}")
    print(f"  concepts : {sum(len(u['concepts']) for u in utterances)} · sujets : "
          f"{sum(len(u['subjects']) for u in utterances)} · prépositions déclinées : "
          f"{sum(len(u['declined_prepositions']) for u in utterances)} · questions : "
          f"{sum(len(u['questions']) for u in utterances)} · mots : {sum(len(u['vocabulary']) for u in utterances)}")
    if missing:
        print(f"  {missing} traductions manquantes : relancer le script")


if __name__ == "__main__":
    asyncio.run(main())
