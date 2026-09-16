"""Test conversationnel expérimental ("Test Challenger", cf. demande
explicite du user) — outil de conception distinct du premier test
conversationnel (app.conversation_eval), amené à le remplacer s'il
fonctionne mieux. Contrairement au premier test (11 phrases pré-tirées,
notées une à une via `report_evaluation`), l'IA choisit elle-même, en
direct, les concepts à éprouver niveau de difficulté par niveau (= les 11
sets déjà utilisés par app.onboarding_exam.build_sets), et improvise ses
propres phrases de traduction. Deux outils seulement : `next_level` (appelé
à chaque montée de niveau, pour affichage en direct côté frontend) et
`student_level` (appelé une seule fois, en fin de conversation, avec le
niveau final retenu). Accessible uniquement via /dev pour l'instant — pas
intégré au parcours d'onboarding réel."""

from google.genai import types

from app.data_loader import get_dataset
from app.jdr import LIVE_MODEL, live_client  # noqa: F401 — réexporté pour le router
from app.onboarding_exam import build_sets

# Sans un premier tour, la persona reste silencieuse en attendant que
# l'étudiant parle en premier (même raison que app.revision.AMORCE).
AMORCE = "Bonjour, je suis prêt à commencer le test."

NEXT_LEVEL_TOOL = types.FunctionDeclaration(
    name="next_level",
    description=(
        "Signale que l'étudiant maîtrise le niveau de difficulté courant et que le test passe au "
        "niveau de difficulté suivant, duquel les prochains concepts seront choisis. Argument : le "
        "nouveau niveau de difficulté (jamais appelée pour redescendre de niveau)."
    ),
    parameters={
        "type": "OBJECT",
        "properties": {"level": {"type": "INTEGER", "enum": [str(i) for i in range(2, 12)]}},
        "required": ["level"],
    },
)

STUDENT_LEVEL_TOOL = types.FunctionDeclaration(
    name="student_level",
    description=(
        "Appelée une seule fois, à la fin de la conversation : indique l'index du plus haut niveau de "
        "difficulté globalement maîtrisé par l'étudiant (0 si même le premier niveau n'est pas maîtrisé)."
    ),
    parameters={
        "type": "OBJECT",
        "properties": {"level": {"type": "INTEGER", "enum": [str(i) for i in range(0, 12)]}},
        "required": ["level"],
    },
)

CHALLENGER_TOOLS = types.Tool(function_declarations=[NEXT_LEVEL_TOOL, STUDENT_LEVEL_TOOL])


def concepts_by_level_block() -> str:
    """Construit le bloc "# NIVEAU DE DIFFICULTE : {index}" + puces de
    concepts pour chacun des 11 sets (cf. app.onboarding_exam.build_sets),
    à injecter tel quel dans le system instruction. Les leçons sans concept
    réel (item_concept.json, `presence: false`, `concept: ""`) sont
    silencieusement omises."""
    sets = build_sets()
    concepts = get_dataset("concept")
    blocks = []
    for idx, lesson_codes in enumerate(sets, start=1):
        lines = [f"# NIVEAU DE DIFFICULTE : {idx}"]
        for code in lesson_codes:
            entry = concepts.get(code)
            if entry and entry.get("presence") and entry.get("concept"):
                lines.append(f"- {entry['concept']}")
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


SYSTEM_INSTRUCTION_TEMPLATE = """Tu es un professeur d'hébreu et francophone. Ton prénom est Gali. Ton rôle est d'évaluer le niveau en hébreu d'un étudiant à travers une petite conversation informelle de quelques minutes. Ton ton est rassurant, chaleureux et cordial, toutefois tu dois te montrer intransigeant quant à la note à attribuer à l'étudiant. Ta stratégie doit être la suivante : évaluer l'étudiant à travers des exercices de traduction du français vers l'hébreu. Précisément, tu devras évaluer la maîtrise de concepts rangés par niveau de difficulté. Basiquement, tu dois trouver le dernier niveau de difficulté que l'étudiant maîtrise globalement. Voici les concepts rangés par niveau de difficulté.

{concepts_by_level}

# STRATEGIE
- sélectionner aléatoirement deux ou trois concepts par niveau de difficulté et proposer une ou deux phrases de traduction du français vers l'hébreu pour éprouver la maîtrise des concepts par l'étudiant
- Si l'étudiant semble maîtriser les concepts sélectionnés, alors passer au niveau au dessus et appelle la fonction 'next_level' avec comme argument le prochain niveau de difficulté duquel tu vas piocher les concepts
- Répéter le processus jusqu'à ce que l'étudiant ne parvienne plus à maîtriser les concepts sélectionnés. Dès lors, il faudra retourner l'index du dernier niveau de difficulté pour lequel l'étudiant a fait preuve d'une certaine maîtrise. Pour ce faire tu appeleras la fonction "student_level" avec comme argument l'index du dernier niveau de difficulté maîtrisé par l'étudiant. Puis tu pourras signifier à l'étudiant que le test est terminé et qu'il peut raccrocher.
- Si l'étudiant maîtrise même le niveau de difficulté 11 (le dernier), appelle directement la fonction "student_level" avec l'argument 11, sans essayer d'appeler 'next_level' au-delà.


# DEROULEMENT DE LA CONVERSATION
- Commence par "Shalom {pseudo}!"
- Présente-toi
- Informe l'étudiant de la raison du test (évaluation de son niveau d'hébreu)
- Présente les modalités du test (des phrases à traduire du français à l'hébreu)
- Ne mentionne pas la stratégie sous jacente faisant intervenir niveau de difficulté et concept
- Demande à l'étudiant s'il est dans de bonnes conditions pour commencer le test.
- Tu dois attendre formellement une réponse positive de sa part pour commencer le test.
- Si tel est le cas, commence le test au premier niveau de difficulté.

# CONTRAINTES
- N'aide pas l'étudiant
- Parle en français
- Ne parle en aucune autre langue que le français
- Sois un juge impartial et intransigeant
"""


def build_system_instruction(pseudo: str) -> str:
    return SYSTEM_INSTRUCTION_TEMPLATE.format(pseudo=pseudo, concepts_by_level=concepts_by_level_block())


def build_live_config(instruction: str) -> types.LiveConnectConfig:
    return types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        media_resolution="MEDIA_RESOLUTION_MEDIUM",
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Zephyr"))
        ),
        output_audio_transcription=types.AudioTranscriptionConfig(language_codes=["he-Hebr-IL"]),
        tools=[CHALLENGER_TOOLS],
        system_instruction=types.Content(
            parts=[types.Part.from_text(text=instruction)],
            role="user",
        ),
    )
