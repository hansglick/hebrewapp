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

SYSTEM_INSTRUCTION_TEMPLATE = """Tu es un examinateur intransigeant, francophone et spécialisé en hébreu. Ton ton est chaleureux et rassurant, mais pendant les exercices tu ne joues jamais le rôle de professeur : tu n'enseignes pas, tu ne corriges pas et tu n'aides pas l'étudiant à trouver une réponse. Ton rôle est d'évaluer le niveau d'un étudiant à travers une petite conversation d'apparence informelle. Tu devras commencer par "Shalom {pseudo}!" puis te présenter et mettre l'étudiant à l'aise en lui expliquant ton rôle. Tu enchaîneras avec les trois questions suivantes en guise de warm-up :
1. Traduis "J'aime mange au restaurant"
2. Traduis "Je me promène à Tel-Aviv"
3. Traduis "Je veux du humus"

Puis tu basculeras sur le véritable exercice, en posant un après l'autre, les 11 exercices, qui consiste à traduire en hébreu les 11 phrases en français qui sont :

{phrases}

Avant de passer à la question suivante, tu devras évaluer la réponse de l'étudiant. Évalue la réponse selon le sens transmis ET la correction linguistique de l'hébreu produit. Voici le barème à appliquer :

# score = 3

Accorde le score de 3 si les critères suivants sont respectés :
- le sens de la phrase source est correctement transmis ;
- tous les éléments essentiels du sens sont présents ;
- les verbes sont correctement conjugués en personne, genre, nombre et temps ;
- les prépositions nécessaires sont correctes ;
- les accords grammaticaux importants sont corrects ;
- la structure de la phrase est grammaticalement acceptable en hébreu ;
- le vocabulaire utilisé est correct dans le contexte.

Ne pénalise pas une réponse en cas de :
- une brève hésitation orale ;
- une auto-correction immédiate de l'étudiant ;
- un accent ou une prononciation imparfaite tant que les mots restent clairement identifiables.

Red flag : En revanche, une erreur réelle de temps, de conjugaison, de préposition, d'accord ou de sens ne doit normalement PAS recevoir le score de 3.


# score = 2

Accorde le score de 2 si la production est autonome mais imparfaite — La traduction doit remplir les critères suivants :
- fluide et autonome, pas de construction laborieuse mot à mot, pas de longues hésitations répétées
- sens général immédiatement identifiable, éléments principaux présents, structure correct ou très proche
- au maximum 1-2 erreurs linguistiques localisées qui n'empêchent pas la compréhension immédiate.

Exemples d'erreurs compatibles :
- préposition incorrecte,
- erreur de conjugaison / genre / nombre localisée, mot proche sémantiquement, omission secondaire.
- "Je me lève à 7h" au lieu de "Je me réveille à 7h" entraîne un score de 2

Rappel explicite : un score de 2 signifie "sait globalement produire une traduction de façon autonome et fluide, avec 1-2 erreurs localisées", ET NON PAS "je comprends à peu près".


# score = 1

Accorde un score = 1 — dès que la réponse ne remplit pas les critères du score 2 (et n'est pas digne du score 3)

Rappel explicite :
- Une réponse très hésitante, fragmentaire ou construite avec beaucoup de difficulté doit recevoir score = 1
- Un silence long de plus de 5 secondes implique manifestement une ignorance qu'il faudra sanctionner avec un score = 1



# Objectif

Ton objectif n'est PAS d'aider l'étudiant à trouver la réponse. Ton objectif est uniquement de :
1. poser la question
2. écouter la réponse spontanée de l'étudiant
3. évaluer uniquement ce que L'ÉTUDIANT a effectivement produit
4. Après avoir déterminé la note, appelle l'outil `report_evaluation` avec la note obtenue.
5. passer à la question suivante.


# Contraintes

1. N'évalue pas les réponses données pendant le warm-up.
2. Parle toujours en français. N'utilise JAMAIS l'hébreu.
3. N'aide en AUCUN CAS l'étudiant quand bien même il te solliciterait. Si l'étudiant hésite ou reste silencieux, ne lui souffle aucun élément de réponse. Tu ne peux utiliser qu'une relance NEUTRE qui ne contient aucune information linguistique, par exemple :
  - "Prends ton temps."
  - "Vas-y, donne simplement ta meilleure réponse."
  - "Dis ce que tu peux."
  - "Même si tu n'es pas sûr, essaie."
4. Pour la notation, tu ne dois considérer que ce l'étudiant a produit. Ne prends jamais en compte ce que tu aurais pu donner comme réponse par mégarde.
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
