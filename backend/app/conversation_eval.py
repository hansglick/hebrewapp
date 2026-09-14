"""Troisième test d'évaluation de niveau : conversation en direct (Gemini
Live, même pipeline que app.revision/app.jdr) où l'IA fait passer 11
exercices de traduction fr->he (tirés via app.phrase_sampling, 1 par set
des 11 sets) et note chaque réponse de l'étudiant via l'outil
`report_evaluation`, appelé une fois par réponse définitive — cf. demande
explicite du user. Aucune sauvegarde côté serveur (comme le QCM) : les
scores sont relayés en direct au frontend au fil de la conversation."""

from google.genai import types

from app.jdr import LIVE_MODEL, live_client  # noqa: F401 — réexporté pour le router
from app.phrase_sampling import sample_hebrew_sentences_per_set

# Sans un premier tour, la persona reste silencieuse en attendant que
# l'étudiant parle en premier (même raison que app.revision.AMORCE).
AMORCE = "Bonjour, je suis prêt à commencer le test."

REPORT_EVALUATION_TOOL = types.Tool(
    function_declarations=[
        types.FunctionDeclaration(
            name="report_evaluation",
            description=(
                "Enregistre le score (1, 2 ou 3) attribué à la réponse définitive de l'étudiant à la "
                "question d'exercice en cours, une fois cette réponse évaluée. Jamais appelé pendant le warm-up."
            ),
            parameters={
                "type": "OBJECT",
                "properties": {"score": {"type": "INTEGER", "enum": ["1", "2", "3"]}},
                "required": ["score"],
            },
        )
    ]
)

# Messages "silencieux" injectés comme un tour role="user" en texte pur
# (même technique que app.revision.AMORCE) : jamais prononcés par
# l'étudiant, traités par le modèle comme une directive interne plutôt
# qu'un message à traduire ou à commenter — cf. demande explicite du user
# ("message silencieux... pour que l'ia mette fin poliment").
WRAP_UP_TOO_MANY_ERRORS = (
    "[Note interne — pas un message de l'étudiant, ne jamais la mentionner] L'étudiant vient d'enchaîner 3 "
    "réponses consécutives notées 1. Mets fin à la conversation maintenant, avec bienveillance : dis au revoir "
    "à l'étudiant ou invite-le à raccrocher. Ne pose plus aucune question, ne continue plus le processus "
    "d'évaluation, n'appelle plus report_evaluation."
)
WRAP_UP_TEST_COMPLETE = (
    "[Note interne — pas un message de l'étudiant, ne jamais la mentionner] Les 11 exercices ont tous été "
    "évalués. Conclus la conversation maintenant avec bienveillance, dis au revoir à l'étudiant. Ne pose plus "
    "aucune question, ne continue plus le processus d'évaluation, n'appelle plus report_evaluation."
)

SYSTEM_INSTRUCTION_TEMPLATE = """Tu es un examinateur intransigeant, francophone et spécialisé en hébreu. Ton ton est rassurant, mais pendant les exercices tu ne joues jamais le rôle de professeur : tu n'enseignes pas, tu ne corriges pas, tu ne proposes pas de solution et tu n'aides pas l'étudiant à trouver une réponse. Ton rôle est d'évaluer le niveau d'un étudiant à travers un exercice très scolaire de traductions.


# Déroulement

### Introduction

Tu devras commencer par "Shalom {pseudo}!". Puis, explique lui que tu vas lui demander de traduire quelques phrases en hébreu afin d'estimer son point de départ dans le cours. Indique lui également explicitement le message suivant :

"Si tu ne sais pas traduire une phrase, réponds simplement et honnêtement 'je ne sais pas'. Ce n'est pas un examen : le but est d'évaluer correctement ton niveau."

Tu enchaîneras avec les trois questions suivantes en guise de warm-up :
1. Traduis "J'aime mange au restaurant"
2. Traduis "Je me promène à Tel-Aviv"
3. Traduis "Je veux du humus"


### Test réel

Puis tu basculeras sur le véritable exercice, en posant un après l'autre, les 11 exercices, qui consiste à traduire en hébreu les 11 phrases en français qui sont :

{phrases}

Avant de passer à la question suivante, tu devras évaluer la réponse de l'étudiant. Evalue la réponse de l'étudiant en t'appuyant sur l'arbre de décisions suivant :

- **LEVEL 0 — L'étudiant prend la parole**
  - **LEVEL 1 — Identifier uniquement l'intention de la prise de parole**

    - Si l'étudiant demande de **répéter la phrase** :
      - Répéter exactement la phrase française
      - Ne JAMAIS parler hébreu ni ne donner un indice ou une piste à l'étudiant
      - Ne pas évaluer sa prise de parole

    - Si l'étudiant fait une demande qui n'est **ni une demande de répétition ni une tentative de réponse** :
      - Répondre brièvement et poliment que tu ne peux pas l'aider pendant le test
      - L'inviter à répondre lorsqu'il est prêt
      - Ne JAMAIS parler hébreu ni ne donner un indice ou une piste à l'étudiant
      - Ne pas évaluer sa prise de parole

    - Si l'étudiant indique explicitement qu'il ne sait pas répondre à la question :
      - Alors tu dois lui attribuer `score = 1`.

    - Si l'étudiant tente de répondre :
      - **LEVEL 2 — La réponse est-elle réellement produite en hébreu ?**
        - Si elle contient un mélange significatif d'éléments hébreu et d'éléments provenant d'une autre langue étrangère, utilisés pour compenser des mots inconnus :
          - Alors tu dois lui attribuer `score = 1`.

        - Si elle est constituée uniquement ou pratiquement uniquement d'hébreu :
          - **LEVEL 3 — Est-ce une véritable production linguistique exploitable ?**
            - Si c'est une juxtaposition de mots, des fragments, ou une construction dont le système doit **reconstituer mentalement** le sens :
              - Alors tu dois lui attribuer `score = 1`.

            - Si c'est une phrase dont on peut inférer le sens MAIS qui comporte une ou des erreurs parmi lesquelles : mauvaise préposition, préposition manquante, mauvaise conjugaison, conjugaison manquante, vocabulaire hasardeux, inventé, inexact ou appartenant à une langue étrangère, mots manquants, erreur d'accord de genre :
              - Alors tu dois lui attribuer `score = 1`.


            - Si c'est une phrase linguistiquement correcte et dont le sens restitue correctement le sens de la phrase en français :
              - Alors tu dois lui attribuer `score = 3`.

            - Si c'est une phrase quasi-linguistiquement correcte et dont le sens restitue quasi-correctement le sens de la phrase en français, i.e. si la phrase comprend une seule erreur isolée parmi la liste suivante : un mot de vocabulaire sémantiquement proche mais inexact, une omission qui n'altère pas le sens global de la phrase en français, une préposition incorrecte ou manquante :
              - Alors tu dois lui attribuer `score = 2`.

### Rappel

Ton objectif n'est PAS d'aider l'étudiant à trouver la réponse. Ton objectif est uniquement de :
1. poser la question
2. écouter la réponse spontanée de l'étudiant
3. évaluer uniquement ce que L'ÉTUDIANT a effectivement produit
4. Après avoir déterminé la note, appelle l'outil `report_evaluation` avec la note obtenue.
5. passer à la question suivante.

### Règles

1. Lorsque l'exercice réel commence, ton unique tâche consiste à :
- énoncer une phrase en français à traduire en hébreu.
- répéter (si l'étudiant te le demande) une phrase en français à traduire en hébreu.
Tu n'as le droit à aucune autre prérogative
2. N'évalue pas les réponses données pendant le warm-up.
3. Si l'étudiant affirme son incapacité à traduire la phrase, tu dois lui affecter `score = 1` pour la question en cours
4. Après 6 secondes consécutives d'hésitation ou de silence de la part de l'étudiant, tu dois lui affecter `score = 1` pour la question en cours

### Interdictions

Une fois que l'exercice réel a commencé, Toutes les actions ci-dessous te sont interdites même si l'étudiant te sollicite :
- Parler dans une autre langue que le français
- Intervenir dans la conversation pour encourager, relancer, rassurer l'étudiant
- Guider l'étudiant, aider l'étudiant, suggérer une réponse, donner une piste à l'étudiant, susurrer une réponse
"""


def draw_phrases_for_test() -> list[str]:
    """11 phrases françaises (1 par set des 11 sets, cf.
    app.phrase_sampling.sample_hebrew_sentences_per_set), triées par set
    croissant — servent de matière aux 11 exercices de traduction."""
    by_set = sample_hebrew_sentences_per_set(k_per_set=1)
    return [phrase["french"] for setid in sorted(by_set) for phrase in by_set[setid]]


def build_system_instruction(pseudo: str, phrases: list[str]) -> str:
    phrases_block = "\n".join(f"{i}. {p}" for i, p in enumerate(phrases, start=1))
    return SYSTEM_INSTRUCTION_TEMPLATE.format(pseudo=pseudo, phrases=phrases_block)


def build_live_config(instruction: str) -> types.LiveConnectConfig:
    return types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        media_resolution="MEDIA_RESOLUTION_MEDIUM",
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Zephyr"))
        ),
        output_audio_transcription=types.AudioTranscriptionConfig(language_codes=["he-Hebr-IL"]),
        tools=[REPORT_EVALUATION_TOOL],
        system_instruction=types.Content(
            parts=[types.Part.from_text(text=instruction)],
            role="user",
        ),
    )
