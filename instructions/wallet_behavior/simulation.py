"""Portefeuille de points, tickets et tirages de cartes/gems."""

from __future__ import annotations

import math
import random
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from inspect import signature
from numbers import Integral
from statistics import NormalDist
from typing import Callable, Final
from uuid import uuid4
import matplotlib.pyplot as plt
import numpy as np


SECONDS_PER_DAY: Final = 86_400
DUREE_APPRENTISSAGE_MINUTES: Final = 45.0
DUREES_EXAMEN_MINUTES: Final = {
    "facile": 10.0,
    "moyen": 30.0,
    "difficile": 60.0,
}
DUREE_EXAMEN_BONUS_MINUTES: Final = 10.0
SEUIL_DEMARRAGE_TACHE_MINUTES: Final = 1.0
LECONS_PAR_CHAPITRE: Final = (48, 45, 50, 9, 7)
NOMBRE_LECONS: Final = sum(LECONS_PAR_CHAPITRE)
POINTS_EXAMEN_BONUS: Final = 25
POINTS_MAX_PARCOURS: Final = 6_185
POOL_CARTES: Final = tuple(range(1, 231))
TARIFS_TICKETS: Final = {
    "gold": 100,
    "silver": 50,
    "bronze": 25,
}
CONFIGURATION_GRAPHIQUES: Final = {
    "cartes_fin_journee": (
        "Évolution du nombre de cartes en fin de journée",
        "Nombre de cartes",
    ),
    "cartes_perdues_journee": (
        "Nombre de cartes perdues chaque jour",
        "Cartes perdues",
    ),
    "cartes_acquises_journee": (
        "Nombre de cartes acquises chaque jour",
        "Cartes acquises",
    ),
    "gems_fin_journee": (
        "Évolution du nombre cumulé de gems en fin de journée",
        "Nombre de gems",
    ),
    "gems_acquis_journee": (
        "Nombre de gems acquis chaque jour",
        "Gems acquis",
    ),
    "objets_fin_journee": (
        "Évolution du nombre total d'objets en fin de journée",
        "Nombre d'objets",
    ),
    "objets_acquis_journee": (
        "Nombre total d'objets acquis chaque jour",
        "Objets acquis",
    ),
    "presences_journee": (
        "Présence du joueur au fil des jours",
        "Présence",
    ),
    "lecons_reussies_journee": (
        "Nombre de leçons réussies chaque jour",
        "Leçons réussies",
    ),
    "points_gagnes_journee": (
        "Nombre de points gagnés chaque jour",
        "Points gagnés",
    ),
    "niveau_fin_journee": (
        "Progression du joueur dans le parcours",
        "Prochaine leçon",
    ),
    "minutes_assignees_journee": (
        "Temps quotidien assigné au jeu",
        "Minutes assignées",
    ),
    "minutes_effectives_journee": (
        "Temps effectivement consacré au jeu",
        "Minutes effectives",
    ),
}
METRIQUES_MONTE_CARLO: Final = (
    "cartes_acquises_journee",
    "cartes_fin_journee",
    "cartes_perdues_journee",
    "gems_acquis_journee",
    "gems_fin_journee",
    "lecons_reussies_journee",
    "niveau_fin_journee",
    "objets_acquis_journee",
    "objets_fin_journee",
    "points_gagnes_journee",
    "presences_journee",
    "minutes_assignees_journee",
    "minutes_effectives_journee",
)
METRIQUES_CUMULATIVES: Final = frozenset(
    {
        "cartes_fin_journee",
        "gems_fin_journee",
        "niveau_fin_journee",
        "objets_fin_journee",
    }
)


class SoldeInsuffisantError(ValueError):
    """Le portefeuille ne contient pas assez de points."""


class ResultatObsoleteError(ValueError):
    """Le portefeuille a changé depuis le calcul du tirage."""


PolitiquePerteInactivite = Callable[..., int]


@dataclass(frozen=True)
class InformationsLecon:
    niveau: int
    chapitre: int
    index_chapitre: int
    type_examen: str
    points: int


def informations_lecon(niveau: int) -> InformationsLecon:
    """Renvoie le chapitre, l'index local, le type et les points d'une leçon."""
    if isinstance(niveau, bool) or not isinstance(niveau, Integral):
        raise TypeError("niveau doit être un entier")
    if not 1 <= niveau <= NOMBRE_LECONS:
        raise ValueError(
            f"niveau doit être compris entre 1 et {NOMBRE_LECONS}"
        )

    premiere_lecon = 1
    for chapitre, nombre_lecons in enumerate(
        LECONS_PAR_CHAPITRE,
        start=1,
    ):
        derniere_lecon = premiere_lecon + nombre_lecons - 1
        if niveau <= derniere_lecon:
            index_chapitre = niveau - premiere_lecon + 1
            if index_chapitre == nombre_lecons:
                return InformationsLecon(
                    niveau=int(niveau),
                    chapitre=chapitre,
                    index_chapitre=index_chapitre,
                    type_examen="difficile",
                    points=50,
                )
            if index_chapitre % 5 == 0:
                return InformationsLecon(
                    niveau=int(niveau),
                    chapitre=chapitre,
                    index_chapitre=index_chapitre,
                    type_examen="moyen",
                    points=25,
                )
            return InformationsLecon(
                niveau=int(niveau),
                chapitre=chapitre,
                index_chapitre=index_chapitre,
                type_examen="facile",
                points=10,
            )
        premiere_lecon = derniere_lecon + 1

    raise RuntimeError("Structure des chapitres incohérente")


def perte_exponentielle(periodes: int) -> int:
    """Perte cumulée historique après ``periodes`` périodes d'inactivité."""
    if isinstance(periodes, bool) or not isinstance(periodes, Integral):
        raise TypeError("periodes doit être un entier")
    if periodes < 0:
        raise ValueError("periodes doit être positif ou nul")
    return 2 ** int(periodes) - 1


def _sigmoide(z: float) -> float:
    """Calcule une sigmoïde sans débordement numérique."""
    if z >= 0:
        return 1 / (1 + math.exp(-z))
    exp_z = math.exp(z)
    return exp_z / (1 + exp_z)


def _valider_entrees_perte_theorique(
    t: float,
    cartes_initiales: int,
) -> tuple[float, int]:
    if not math.isfinite(t) or t < 0:
        raise ValueError("t doit être positif ou nul")
    if (
        isinstance(cartes_initiales, bool)
        or not isinstance(cartes_initiales, Integral)
        or cartes_initiales < 0
    ):
        raise ValueError("cartes_initiales doit être un entier positif ou nul")
    return float(t), int(cartes_initiales)


def perte_theorique_logistique(
    t: float,
    cartes_initiales: int,
    plafond: float = 0.25,
    centre: float = 8.0,
    vitesse: float = 0.8,
) -> float:
    """Renvoie la perte cumulative logistique théorique au temps ``t``.

    La perte vaut zéro à ``t = 0`` et tend vers
    ``plafond * cartes_initiales``. La vitesse de perte est symétrique autour
    de ``centre`` ; ``vitesse`` règle l'intensité de l'accélération et de la
    décélération.
    """
    temps, stock = _valider_entrees_perte_theorique(t, cartes_initiales)
    if not math.isfinite(plafond) or not 0 <= plafond <= 1:
        raise ValueError("plafond doit être compris entre 0 et 1")
    if not math.isfinite(centre) or centre <= 0:
        raise ValueError("centre doit être strictement positif")
    if not math.isfinite(vitesse) or vitesse <= 0:
        raise ValueError("vitesse doit être strictement positive")

    perte_maximale = plafond * stock
    valeur_initiale = _sigmoide(-vitesse * centre)
    valeur_t = _sigmoide(vitesse * (temps - centre))
    progression = (valeur_t - valeur_initiale) / (1 - valeur_initiale)
    return perte_maximale * max(0.0, min(1.0, progression))


# Alias conservé pour les notebooks utilisant déjà ce nom.
perte_theorique = perte_theorique_logistique


def perte_theorique_lineaire_plafonnee(
    t: float,
    cartes_initiales: int,
    plafond: float = 0.25,
    duree_montee: float = 8.0,
) -> float:
    """Perte cumulative linéaire jusqu'à un plafond fini.

    ``duree_montee`` indique après combien de périodes le plafond est atteint.
    La perte par période est constante jusque-là, puis devient nulle.
    """
    temps, stock = _valider_entrees_perte_theorique(t, cartes_initiales)
    if not math.isfinite(plafond) or not 0 <= plafond <= 1:
        raise ValueError("plafond doit être compris entre 0 et 1")
    if not math.isfinite(duree_montee) or duree_montee <= 0:
        raise ValueError("duree_montee doit être strictement positive")

    perte_maximale = plafond * stock
    progression = min(1.0, temps / duree_montee)
    return perte_maximale * progression


def perte_theorique_exponentielle_saturee(
    t: float,
    cartes_initiales: int,
    plafond: float = 0.25,
    vitesse: float = 0.35,
) -> float:
    """Perte cumulative forte au début puis décroissante vers un plafond.

    Une valeur élevée de ``vitesse`` concentre davantage les pertes dans les
    premières périodes. Le plafond est approché asymptotiquement.
    """
    temps, stock = _valider_entrees_perte_theorique(t, cartes_initiales)
    if not math.isfinite(plafond) or not 0 <= plafond <= 1:
        raise ValueError("plafond doit être compris entre 0 et 1")
    if not math.isfinite(vitesse) or vitesse <= 0:
        raise ValueError("vitesse doit être strictement positive")

    perte_maximale = plafond * stock
    return perte_maximale * (1 - math.exp(-vitesse * temps))


def perte_theorique_lineaire_jusqua_zero(
    t: float,
    cartes_initiales: int,
    cartes_par_periode: float = 1.0,
) -> float:
    """Perte cumulative à débit constant jusqu'à épuisement des cartes."""
    temps, stock = _valider_entrees_perte_theorique(t, cartes_initiales)
    if (
        not math.isfinite(cartes_par_periode)
        or cartes_par_periode <= 0
    ):
        raise ValueError(
            "cartes_par_periode doit être strictement positif"
        )

    return min(float(stock), cartes_par_periode * temps)


def perte_inactivite_logistique(
    periodes: int,
    cartes_debut_inactivite: int,
    plafond: float = 0.25,
    centre: float = 8.0,
    vitesse: float = 0.8,
) -> int:
    """Renvoie la perte cumulative entière utilisée par ``Portefeuille``.

    ``cartes_debut_inactivite`` reste fixe pendant toute une séquence
    d'inactivité. La perte ne dépasse donc jamais ``plafond`` de ce stock de
    référence.
    """
    if isinstance(periodes, bool) or not isinstance(periodes, Integral):
        raise TypeError("periodes doit être un entier")
    if periodes < 0:
        raise ValueError("periodes doit être positif ou nul")

    perte = perte_theorique(
        t=int(periodes),
        cartes_initiales=cartes_debut_inactivite,
        plafond=plafond,
        centre=centre,
        vitesse=vitesse,
    )
    perte_maximale = math.floor(plafond * cartes_debut_inactivite)
    return min(perte_maximale, math.floor(perte))


def _politique_perte_utilise_stock(
    politique: PolitiquePerteInactivite,
) -> bool:
    """Détermine si une politique accepte le stock de référence.

    Les anciennes politiques ``politique(periodes)`` restent acceptées. Les
    nouvelles politiques utilisent ``politique(periodes, stock_reference)``.
    """
    try:
        parametres = signature(politique)
    except (TypeError, ValueError) as erreur:
        raise TypeError(
            "Impossible de déterminer la signature de perte_inactivite"
        ) from erreur

    try:
        parametres.bind(0, 0)
    except TypeError:
        try:
            parametres.bind(0)
        except TypeError as erreur:
            raise TypeError(
                "perte_inactivite doit accepter soit (periodes), soit "
                "(periodes, cartes_debut_inactivite)"
            ) from erreur
        return False
    return True


CATALOGUE_FAMILLES_PERTE: Final = {
    "logistique": {
        "fonction": perte_theorique_logistique,
        "description": (
            "Courbe cumulative en S : les pertes accélèrent, atteignent leur "
            "vitesse maximale, puis décélèrent symétriquement vers un plafond."
        ),
        "parametres": {
            "plafond": {
                "defaut": 0.25,
                "description": (
                    "Proportion maximale du stock initial pouvant être perdue."
                ),
            },
            "centre": {
                "defaut": 8.0,
                "description": (
                    "Période autour de laquelle la vitesse de perte est maximale."
                ),
            },
            "vitesse": {
                "defaut": 0.8,
                "description": (
                    "Intensité symétrique de l'accélération et de la décélération."
                ),
            },
        },
    },
    "lineaire_plafonnee": {
        "fonction": perte_theorique_lineaire_plafonnee,
        "description": (
            "Perte constante par période jusqu'à atteindre un plafond fini, "
            "puis aucune perte supplémentaire."
        ),
        "parametres": {
            "plafond": {
                "defaut": 0.25,
                "description": (
                    "Proportion maximale du stock initial pouvant être perdue."
                ),
            },
            "duree_montee": {
                "defaut": 8.0,
                "description": (
                    "Nombre de périodes nécessaires pour atteindre le plafond."
                ),
            },
        },
    },
    "exponentielle_saturee": {
        "fonction": perte_theorique_exponentielle_saturee,
        "description": (
            "Perte forte dès les premières périodes, puis décélération "
            "progressive et asymptotique vers un plafond."
        ),
        "parametres": {
            "plafond": {
                "defaut": 0.25,
                "description": (
                    "Proportion maximale du stock initial pouvant être perdue."
                ),
            },
            "vitesse": {
                "defaut": 0.35,
                "description": (
                    "Concentration des pertes au début : plus elle est élevée, "
                    "plus les premières pertes sont fortes."
                ),
            },
        },
    },
    "lineaire_jusqua_zero": {
        "fonction": perte_theorique_lineaire_jusqua_zero,
        "description": (
            "Perte d'un nombre constant de cartes par période jusqu'à "
            "épuisement complet du stock."
        ),
        "parametres": {
            "cartes_par_periode": {
                "defaut": 1.0,
                "description": (
                    "Nombre théorique de cartes perdues à chaque période."
                ),
            },
        },
    },
}


class ModelePerteInactivite:
    """Configure, visualise et discrétise une famille de pertes théoriques.

    Une famille théorique doit accepter ``t``, ``cartes_initiales`` et les
    paramètres fournis à l'initialisation, puis renvoyer une perte cumulative
    positive sous forme de nombre réel.
    """

    def __init__(
        self,
        famille: str | Callable[..., float] | None = None,
        parametres: dict[str, float] | None = None,
    ) -> None:
        if parametres is not None and not isinstance(parametres, dict):
            raise TypeError("parametres doit être un dictionnaire")
        if famille is None and parametres:
            raise ValueError(
                "Il faut choisir une famille avant de fournir des paramètres"
            )

        self.famille: Callable[..., float] | None = None
        self.parametres: dict[str, float] = {}
        self._cle_famille: str | None = None

        if famille is not None:
            self.configurer(famille, parametres)

    @property
    def familles_disponibles(self) -> tuple[str, ...]:
        return tuple(CATALOGUE_FAMILLES_PERTE)

    def _exiger_configuration(self) -> Callable[..., float]:
        if self.famille is None:
            raise RuntimeError(
                "Aucune famille de perte n'est configurée. Utilisez "
                "configurer() après avoir consulté informations()."
            )
        return self.famille

    def configurer(
        self,
        famille: str | Callable[..., float],
        parametres: dict[str, float] | None = None,
        **parametres_nommes: float,
    ) -> ModelePerteInactivite:
        """Choisit une famille et ses paramètres, puis renvoie ``self``."""
        if parametres is not None and not isinstance(parametres, dict):
            raise TypeError("parametres doit être un dictionnaire")

        cle_famille: str | None = None
        if isinstance(famille, str):
            if famille not in CATALOGUE_FAMILLES_PERTE:
                choix = ", ".join(CATALOGUE_FAMILLES_PERTE)
                raise ValueError(
                    f"Famille inconnue : {famille!r}. Choix possibles : {choix}"
                )
            cle_famille = famille
            fiche = CATALOGUE_FAMILLES_PERTE[famille]
            fonction = fiche["fonction"]
            parametres_finaux = {
                nom: details["defaut"]
                for nom, details in fiche["parametres"].items()
            }
        elif callable(famille):
            fonction = famille
            parametres_finaux = {}
            for cle, fiche in CATALOGUE_FAMILLES_PERTE.items():
                if fiche["fonction"] is famille:
                    cle_famille = cle
                    parametres_finaux = {
                        nom: details["defaut"]
                        for nom, details in fiche["parametres"].items()
                    }
                    break
        else:
            raise TypeError(
                "famille doit être le nom d'une famille ou une fonction"
            )

        parametres_fournis = dict(parametres or {})
        parametres_fournis.update(parametres_nommes)
        if cle_famille is not None:
            autorises = set(
                CATALOGUE_FAMILLES_PERTE[cle_famille]["parametres"]
            )
            inconnus = sorted(set(parametres_fournis) - autorises)
            if inconnus:
                raise ValueError(
                    "Paramètre(s) inconnu(s) pour "
                    f"{cle_famille!r} : {', '.join(inconnus)}"
                )
        parametres_finaux.update(parametres_fournis)

        ancienne_famille = self.famille
        anciens_parametres = self.parametres
        ancienne_cle = self._cle_famille
        self.famille = fonction
        self.parametres = parametres_finaux
        self._cle_famille = cle_famille
        try:
            valeur_initiale = self.perte_theorique(0, 100)
            valeur_suivante = self.perte_theorique(1, 100)
            if valeur_initiale != 0:
                raise ValueError(
                    "La famille de perte doit renvoyer 0 au temps 0"
                )
            if valeur_suivante < valeur_initiale:
                raise ValueError("La famille de perte doit être croissante")
        except Exception:
            self.famille = ancienne_famille
            self.parametres = anciens_parametres
            self._cle_famille = ancienne_cle
            raise
        return self

    def informations(self, famille: str | None = None) -> None:
        """Affiche les familles disponibles et la signification des paramètres."""
        if famille is not None and famille not in CATALOGUE_FAMILLES_PERTE:
            choix = ", ".join(CATALOGUE_FAMILLES_PERTE)
            raise ValueError(
                f"Famille inconnue : {famille!r}. Choix possibles : {choix}"
            )

        cles = (
            (famille,)
            if famille is not None
            else tuple(CATALOGUE_FAMILLES_PERTE)
        )
        lignes = ["Familles de perte disponibles :"]
        for cle in cles:
            fiche = CATALOGUE_FAMILLES_PERTE[cle]
            selectionnee = (
                " [sélectionnée]" if cle == self._cle_famille else ""
            )
            lignes.extend(
                [
                    "",
                    f"{cle}{selectionnee}",
                    f"  {fiche['description']}",
                    "  Paramètres :",
                ]
            )
            for nom, details in fiche["parametres"].items():
                lignes.append(
                    f"    - {nom} (défaut : {details['defaut']}) : "
                    f"{details['description']}"
                )

        texte = "\n".join(lignes)
        print(texte)

    @property
    def nom_famille(self) -> str:
        if self._cle_famille is not None:
            return self._cle_famille
        if self.famille is None:
            return "aucune"
        return getattr(
            self.famille,
            "__name__",
            type(self.famille).__name__,
        )

    @staticmethod
    def _valider_cartes_initiales(cartes_initiales: int) -> int:
        if (
            isinstance(cartes_initiales, bool)
            or not isinstance(cartes_initiales, Integral)
            or cartes_initiales < 0
        ):
            raise ValueError(
                "cartes_initiales doit être un entier positif ou nul"
            )
        return int(cartes_initiales)

    @staticmethod
    def _valider_nombre_periodes(nombre_periodes: int) -> int:
        if (
            isinstance(nombre_periodes, bool)
            or not isinstance(nombre_periodes, Integral)
            or nombre_periodes <= 0
        ):
            raise ValueError(
                "nombre_periodes doit être un entier strictement positif"
            )
        return int(nombre_periodes)

    def perte_theorique(
        self,
        t: float,
        cartes_initiales: int,
    ) -> float:
        """Renvoie la perte cumulative théorique, sans arrondi."""
        if not math.isfinite(t) or t < 0:
            raise ValueError("t doit être positif ou nul")
        stock = self._valider_cartes_initiales(cartes_initiales)
        famille = self._exiger_configuration()
        valeur = famille(
            t=t,
            cartes_initiales=stock,
            **self.parametres,
        )
        if isinstance(valeur, bool) or not math.isfinite(valeur):
            raise ValueError(
                "La famille doit renvoyer un nombre réel fini"
            )
        if valeur < 0:
            raise ValueError("La perte théorique ne peut pas être négative")
        return float(valeur)

    def perte_cumulative_entiere(
        self,
        periodes: int,
        cartes_debut_inactivite: int,
    ) -> int:
        """Renvoie la perte cumulative entière compatible avec Simulation."""
        if isinstance(periodes, bool) or not isinstance(periodes, Integral):
            raise TypeError("periodes doit être un entier")
        if periodes < 0:
            raise ValueError("periodes doit être positif ou nul")

        valeur = self.perte_theorique(
            t=int(periodes),
            cartes_initiales=cartes_debut_inactivite,
        )
        return max(0, math.floor(valeur))

    def creer_fonction_simulation(
        self,
    ) -> Callable[[int, int], int]:
        """Crée une politique entière avec une copie figée des paramètres."""
        famille = self._exiger_configuration()
        modele_fige = ModelePerteInactivite(
            famille=famille,
            parametres=self.parametres,
        )
        return modele_fige.perte_cumulative_entiere

    def plot_perte_cumulee(
        self,
        cartes_initiales: int,
        nombre_periodes: int = 30,
        nombre_points: int = 600,
    ) -> tuple[object, object]:
        """Trace la perte théorique cumulative dans le temps."""
        stock = self._valider_cartes_initiales(cartes_initiales)
        horizon = self._valider_nombre_periodes(nombre_periodes)
        if (
            isinstance(nombre_points, bool)
            or not isinstance(nombre_points, Integral)
            or nombre_points < 2
        ):
            raise ValueError("nombre_points doit être un entier supérieur à 1")

        temps = np.linspace(0, horizon, int(nombre_points))
        pertes = np.asarray(
            [self.perte_theorique(t, stock) for t in temps],
            dtype=float,
        )

        figure, axe = plt.subplots(figsize=(10, 5))
        axe.plot(temps, pertes, linewidth=2)
        axe.set(
            title=f"Perte théorique cumulée — {self.nom_famille}",
            xlabel="Périodes consécutives d'inactivité",
            ylabel="Nombre théorique de cartes perdues",
            xlim=(0, horizon),
        )
        axe.set_ylim(bottom=0)
        axe.grid(alpha=0.3)
        figure.tight_layout()
        plt.show()
        return figure, axe

    def plot_perte_par_periode(
        self,
        cartes_initiales: int,
        nombre_periodes: int = 30,
    ) -> tuple[object, object]:
        """Trace la perte théorique supplémentaire de chaque période."""
        stock = self._valider_cartes_initiales(cartes_initiales)
        horizon = self._valider_nombre_periodes(nombre_periodes)
        periodes = np.arange(1, horizon + 1)
        pertes_cumulees = np.asarray(
            [
                self.perte_theorique(periode, stock)
                for periode in range(horizon + 1)
            ],
            dtype=float,
        )
        pertes_par_periode = np.diff(pertes_cumulees)

        figure, axe = plt.subplots(figsize=(10, 5))
        axe.bar(periodes, pertes_par_periode)
        axe.set(
            title=f"Perte théorique par période — {self.nom_famille}",
            xlabel="Période d'inactivité",
            ylabel="Nombre théorique de cartes perdues",
            xlim=(0.5, horizon + 0.5),
        )
        axe.set_ylim(bottom=0)
        axe.grid(axis="y", alpha=0.3)
        figure.tight_layout()
        plt.show()
        return figure, axe


@dataclass(frozen=True)
class LeconProgramme:
    """Leçon validée, ordonnée et enrichie de son niveau global."""

    niveau: int
    chapter_name: str
    chapter_index: int
    index_lesson: int
    name_lesson: str
    type_lesson: str
    points_lesson: float
    bonus_propose: bool


@dataclass(frozen=True)
class Programme:
    """Programme généré avec sa politique de proposition des bonus.

    ``chapitres`` respecte le format accepté par :class:`Simulation`.
    ``mode_bonus`` vaut ``"each_lesson"`` ou ``"each_chapter"``.
    """

    chapitres: dict[str, dict[str, object]]
    mode_bonus: str

    def __post_init__(self) -> None:
        if self.mode_bonus not in {"each_lesson", "each_chapter"}:
            raise ValueError(
                "mode_bonus doit valoir 'each_lesson' ou 'each_chapter'"
            )
        if not isinstance(self.chapitres, dict) or not self.chapitres:
            raise ValueError("chapitres doit être un dictionnaire non vide")

    @property
    def config_bonus(self) -> dict[str, str]:
        """Configuration du bonus correspondant à ce programme."""
        return {"mode": self.mode_bonus}

    @property
    def nombre_lecons(self) -> int:
        """Nombre total de leçons contenues dans le programme."""
        return sum(
            len(chapitre["chapter_lessons"])
            for chapitre in self.chapitres.values()
        )

    def dictionnaire(self) -> dict[str, dict[str, object]]:
        """Renvoie une copie indépendante du dictionnaire des chapitres."""
        return deepcopy(self.chapitres)


def creer_programme(
    noms_lecons: list[str],
    mode_bonus: str,
) -> Programme:
    """Construit un :class:`Programme` depuis ``chapitre.nom_leçon``.

    Les chapitres sont ordonnés par leur numéro. Dans chaque chapitre, les
    leçons sont triées par nom, sans tenir compte de la casse, puis numérotées
    à partir de 1.

    La difficulté reprend la règle historique du parcours : la dernière leçon
    d'un chapitre est ``difficile`` ; une autre leçon dont l'index local est un
    multiple de 5 est ``moyen`` ; toutes les autres sont ``facile``.

    ``mode_bonus`` détermine si un examen bonus est proposé après chaque leçon
    (``"each_lesson"``) ou seulement après la dernière leçon de chaque
    chapitre (``"each_chapter"``).
    """
    if not isinstance(noms_lecons, list) or not noms_lecons:
        raise ValueError("noms_lecons doit être une liste non vide")
    if mode_bonus not in {"each_lesson", "each_chapter"}:
        raise ValueError(
            "mode_bonus doit valoir 'each_lesson' ou 'each_chapter'"
        )

    noms_par_chapitre: dict[int, list[str]] = {}
    noms_deja_vus: dict[int, set[str]] = {}

    for valeur in noms_lecons:
        if not isinstance(valeur, str):
            raise TypeError("Chaque leçon doit être une chaîne de caractères")

        numero_texte, separateur, nom_lecon = valeur.partition(".")
        numero_texte = numero_texte.strip()
        nom_lecon = nom_lecon.strip()
        if not separateur or not numero_texte or not nom_lecon:
            raise ValueError(
                f"Format de leçon invalide : {valeur!r}. "
                "Format attendu : 'chapitre_number.lecon_name'"
            )
        if not numero_texte.isdigit():
            raise ValueError(
                f"Le numéro de chapitre doit être un entier positif ou nul : "
                f"{valeur!r}"
            )
        numero_chapitre = int(numero_texte)
        if numero_chapitre < 0:
            raise ValueError(
                f"Le numéro de chapitre doit être positif ou nul : "
                f"{valeur!r}"
            )

        cle_doublon = nom_lecon.casefold()
        deja_vus = noms_deja_vus.setdefault(numero_chapitre, set())
        if cle_doublon in deja_vus:
            raise ValueError(
                f"Leçon dupliquée dans le chapitre {numero_chapitre} : "
                f"{nom_lecon!r}"
            )
        deja_vus.add(cle_doublon)
        noms_par_chapitre.setdefault(numero_chapitre, []).append(nom_lecon)

    chapitres: dict[str, dict[str, object]] = {}
    for numero_chapitre in sorted(noms_par_chapitre):
        noms_tries = sorted(
            noms_par_chapitre[numero_chapitre],
            key=lambda nom: (nom.casefold(), nom),
        )
        lecons: list[dict[str, object]] = []
        for index_lesson, nom_lecon in enumerate(noms_tries, start=1):
            if index_lesson == len(noms_tries):
                type_lesson = "difficile"
            elif index_lesson % 5 == 0:
                type_lesson = "moyen"
            else:
                type_lesson = "facile"

            lecons.append(
                {
                    "index_lesson": index_lesson,
                    "name_lesson": nom_lecon,
                    "type_lesson": type_lesson,
                }
            )

        nom_chapitre = f"Chapitre {numero_chapitre}"
        chapitres[nom_chapitre] = {
            "chapter_index": numero_chapitre,
            "chapter_lessons": lecons,
        }

    return Programme(chapitres=chapitres, mode_bonus=mode_bonus)


def preparer_programme(
    programme: Programme | dict[str, dict[str, object]],
    config_points: dict[str, float],
    config_bonus: dict[str, str] | None = None,
) -> tuple[tuple[LeconProgramme, ...], float]:
    """Valide et ordonne un programme, puis calcule ses points maximaux."""
    if isinstance(programme, Programme):
        if config_bonus is not None and config_bonus != programme.config_bonus:
            raise ValueError(
                "config_bonus contredit le mode_bonus de l'objet Programme"
            )
        config_bonus = programme.config_bonus
        programme = programme.chapitres

    if not isinstance(programme, dict) or not programme:
        raise ValueError("programme doit être un dictionnaire non vide")
    if not isinstance(config_points, dict):
        raise TypeError("config_points doit être un dictionnaire")

    types_attendus = {"facile", "moyen", "difficile", "bonus"}
    types_manquants = sorted(types_attendus - set(config_points))
    types_inconnus = sorted(set(config_points) - types_attendus)
    if types_manquants or types_inconnus:
        details = []
        if types_manquants:
            details.append(f"manquants : {', '.join(types_manquants)}")
        if types_inconnus:
            details.append(f"inconnus : {', '.join(types_inconnus)}")
        raise ValueError(
            "config_points doit contenir exactement facile, moyen, "
            f"difficile et bonus ({'; '.join(details)})"
        )

    points_valides: dict[str, float] = {}
    for type_examen, points in config_points.items():
        if (
            isinstance(points, bool)
            or not isinstance(points, (int, float))
            or not math.isfinite(points)
            or points < 0
        ):
            raise ValueError(
                f"config_points[{type_examen!r}] doit être positif ou nul"
            )
        points_valides[type_examen] = float(points)

    if not isinstance(config_bonus, dict):
        raise TypeError("config_bonus doit être un dictionnaire")
    if set(config_bonus) != {"mode"}:
        raise ValueError("config_bonus doit uniquement contenir la clé 'mode'")
    mode_bonus = config_bonus["mode"]
    if mode_bonus not in {"each_lesson", "each_chapter"}:
        raise ValueError(
            "config_bonus['mode'] doit valoir 'each_lesson' ou "
            "'each_chapter'"
        )

    chapitres: list[tuple[int, str, list[dict[str, object]]]] = []
    index_chapitres: set[int] = set()
    for chapter_name, chapitre in programme.items():
        if not isinstance(chapter_name, str) or not chapter_name.strip():
            raise ValueError("Chaque nom de chapitre doit être non vide")
        if not isinstance(chapitre, dict):
            raise TypeError(
                f"Le chapitre {chapter_name!r} doit être un dictionnaire"
            )
        if "chapter_index" not in chapitre or "chapter_lessons" not in chapitre:
            raise ValueError(
                f"Le chapitre {chapter_name!r} doit contenir chapter_index "
                "et chapter_lessons"
            )

        chapter_index = chapitre["chapter_index"]
        if (
            isinstance(chapter_index, bool)
            or not isinstance(chapter_index, Integral)
            or chapter_index < 0
        ):
            raise ValueError(
                "chapter_index doit être un entier positif ou nul"
            )
        chapter_index = int(chapter_index)
        if chapter_index in index_chapitres:
            raise ValueError(f"chapter_index dupliqué : {chapter_index}")
        index_chapitres.add(chapter_index)

        lessons = chapitre["chapter_lessons"]
        if not isinstance(lessons, (list, tuple)) or not lessons:
            raise ValueError(
                f"chapter_lessons de {chapter_name!r} doit être une liste non vide"
            )
        chapitres.append((chapter_index, chapter_name, list(lessons)))

    lecons_preparees: list[LeconProgramme] = []
    niveau_global = 1
    for chapter_index, chapter_name, lessons in sorted(chapitres):
        lecons_validees: list[dict[str, object]] = []
        index_lecons: set[int] = set()
        for lesson in lessons:
            if not isinstance(lesson, dict):
                raise TypeError(
                    f"Chaque leçon de {chapter_name!r} doit être un dictionnaire"
                )
            champs = {"index_lesson", "name_lesson", "type_lesson"}
            manquants = sorted(champs - set(lesson))
            if manquants:
                raise ValueError(
                    f"Leçon incomplète dans {chapter_name!r} : "
                    f"{', '.join(manquants)}"
                )

            index_lesson = lesson["index_lesson"]
            if (
                isinstance(index_lesson, bool)
                or not isinstance(index_lesson, Integral)
                or index_lesson <= 0
            ):
                raise ValueError(
                    "index_lesson doit être un entier strictement positif"
                )
            index_lesson = int(index_lesson)
            if index_lesson in index_lecons:
                raise ValueError(
                    f"index_lesson dupliqué dans {chapter_name!r} : "
                    f"{index_lesson}"
                )
            index_lecons.add(index_lesson)

            name_lesson = lesson["name_lesson"]
            if not isinstance(name_lesson, str) or not name_lesson.strip():
                raise ValueError("name_lesson doit être une chaîne non vide")
            type_lesson = lesson["type_lesson"]
            if type_lesson not in {"facile", "moyen", "difficile"}:
                raise ValueError(
                    "type_lesson doit valoir 'facile', 'moyen' ou 'difficile'"
                )
            lecons_validees.append(
                {
                    "index_lesson": index_lesson,
                    "name_lesson": name_lesson,
                    "type_lesson": type_lesson,
                }
            )

        lecons_validees.sort(key=lambda lesson: lesson["index_lesson"])
        for position, lesson in enumerate(lecons_validees, start=1):
            bonus_propose = (
                mode_bonus == "each_lesson"
                or position == len(lecons_validees)
            )
            type_lesson = str(lesson["type_lesson"])
            lecons_preparees.append(
                LeconProgramme(
                    niveau=niveau_global,
                    chapter_name=chapter_name,
                    chapter_index=chapter_index,
                    index_lesson=int(lesson["index_lesson"]),
                    name_lesson=str(lesson["name_lesson"]),
                    type_lesson=type_lesson,
                    points_lesson=points_valides[type_lesson],
                    bonus_propose=bonus_propose,
                )
            )
            niveau_global += 1

    points_maximaux = sum(
        lecon.points_lesson
        + (points_valides["bonus"] if lecon.bonus_propose else 0)
        for lecon in lecons_preparees
    )
    if points_maximaux <= 0:
        raise ValueError("Le programme doit permettre de gagner des points")
    return tuple(lecons_preparees), points_maximaux


@dataclass(frozen=True)
class ModeleRecompenses:
    """Construit f, g, f' et g' depuis f1 et la configuration du jeu."""

    f1: float
    nombre_cartes: int
    nombre_lecons: int
    points_max_programme: float
    ratio: float = field(init=False)
    moyenne_points_reference: float = field(init=False)

    def __post_init__(self) -> None:
        if not math.isfinite(self.f1) or self.f1 <= 0:
            raise ValueError("f1 doit être strictement positif")
        if (
            isinstance(self.nombre_cartes, bool)
            or not isinstance(self.nombre_cartes, Integral)
            or self.nombre_cartes <= 0
        ):
            raise ValueError("nombre_cartes doit être un entier strictement positif")
        if (
            isinstance(self.nombre_lecons, bool)
            or not isinstance(self.nombre_lecons, Integral)
            or self.nombre_lecons <= 0
        ):
            raise ValueError("nombre_lecons doit être un entier strictement positif")
        if (
            not math.isfinite(self.points_max_programme)
            or self.points_max_programme <= 0
        ):
            raise ValueError("points_max_programme doit être strictement positif")

        nombre_cartes = int(self.nombre_cartes)
        nombre_lecons = int(self.nombre_lecons)
        moyenne_f = nombre_cartes / nombre_lecons
        tolerance = 1e-12 * max(1.0, float(nombre_cartes))

        if nombre_lecons == 1:
            if not math.isclose(self.f1, nombre_cartes, rel_tol=1e-12):
                raise ValueError(
                    "Avec une seule leçon, f1 doit être égal au nombre de cartes"
                )
            ratio = 1.0
        elif self.f1 < moyenne_f - tolerance:
            raise ValueError(
                "f1 doit être supérieur ou égal à nombre_cartes / "
                "nombre_lecons pour obtenir une suite décroissante"
            )
        elif math.isclose(self.f1, moyenne_f, rel_tol=1e-12, abs_tol=tolerance):
            ratio = 1.0
        elif self.f1 >= nombre_cartes:
            raise ValueError("f1 doit être strictement inférieur à nombre_cartes")
        else:
            borne_basse = 0.0
            borne_haute = 1.0
            for _ in range(120):
                candidat = (borne_basse + borne_haute) / 2
                somme = self.f1 * (
                    (1 - candidat**nombre_lecons) / (1 - candidat)
                )
                if somme < nombre_cartes:
                    borne_basse = candidat
                else:
                    borne_haute = candidat
            ratio = (borne_basse + borne_haute) / 2

        object.__setattr__(self, "ratio", ratio)
        object.__setattr__(
            self,
            "moyenne_points_reference",
            self.points_max_programme / nombre_lecons,
        )

    def _valider_niveau(self, n: int) -> int:
        if isinstance(n, bool) or not isinstance(n, Integral):
            raise TypeError("n doit être un entier")
        if not 1 <= n <= self.nombre_lecons:
            raise ValueError(
                f"n doit être compris entre 1 et {self.nombre_lecons}"
            )
        return int(n)

    def f(self, n: int) -> float:
        niveau = self._valider_niveau(n)
        return self.f1 * self.ratio ** (niveau - 1)

    def g(self, n: int) -> float:
        niveau = self._valider_niveau(n)
        return self.f1 * self.ratio ** (self.nombre_lecons - niveau)

    def f_prime(self, n: int) -> float:
        return self.f(n) / self.moyenne_points_reference

    def g_prime(self, n: int) -> float:
        return self.g(n) / self.moyenne_points_reference


def f(n: int) -> float:
    if not 1 <= n <= NOMBRE_LECONS:
        raise ValueError(
            f"n doit être compris entre 1 et {NOMBRE_LECONS}"
        )

    ratio = 0.985
    coefficient = 230 * (1 - ratio) / (
        ratio * (1 - ratio**NOMBRE_LECONS)
    )
    return coefficient * ratio**n


def g(n: int) -> float:
    if not 1 <= n <= NOMBRE_LECONS:
        raise ValueError(
            f"n doit être compris entre 1 et {NOMBRE_LECONS}"
        )

    ratio = 0.985
    premier_terme_f = 230 * (1 - ratio) / (
        1 - ratio**NOMBRE_LECONS
    )
    return premier_terme_f * ratio ** (NOMBRE_LECONS - n)


def f_prime(n: int) -> float:
    """Nombre moyen de cartes par point au niveau n."""
    return f(n) / (POINTS_MAX_PARCOURS / NOMBRE_LECONS)


def g_prime(n: int) -> float:
    """Nombre moyen de gems par point au niveau n."""
    return g(n) / (POINTS_MAX_PARCOURS / NOMBRE_LECONS)


def tirer_lognormale(
    moyenne: float,
    variance: float,
    rng: random.Random | None = None,
) -> float:
    """Tire une log-normale ayant la moyenne et la variance demandées."""
    if not math.isfinite(moyenne) or moyenne <= 0:
        raise ValueError("La moyenne doit être strictement positive")
    if not math.isfinite(variance) or variance < 0:
        raise ValueError("La variance doit être positive ou nulle")

    sigma_carre = math.log1p(variance / moyenne**2)
    sigma = math.sqrt(sigma_carre)
    mu = math.log(moyenne) - sigma_carre / 2
    generateur = rng if rng is not None else random
    return generateur.lognormvariate(mu, sigma)


def tirer_beta(
    alpha: float,
    beta: float,
    rng: random.Random | None = None,
) -> float:
    if alpha <= 0:
        raise ValueError("alpha doit être strictement positif")
    if beta <= 0:
        raise ValueError("beta doit être strictement positif")

    generateur = rng if rng is not None else random
    return generateur.betavariate(alpha, beta)


@dataclass(frozen=True)
class EtatArrondi:
    erreur_total: float = 0.0
    erreur_a: float = 0.0


def repartir_en_entiers(
    x: float,
    p: float,
    etat: EtatArrondi | None = None,
) -> tuple[int, int, EtatArrondi]:
    """Répartit x en deux entiers avec correction cumulative."""
    if not math.isfinite(x) or x < 0:
        raise ValueError("x doit être un float positif ou nul")
    if not math.isfinite(p) or not 0 <= p <= 1:
        raise ValueError("p doit être compris entre 0 et 1")
    if etat is None:
        etat = EtatArrondi()

    total_corrige = x + etat.erreur_total
    total_entier = max(0, math.floor(total_corrige + 0.5))
    nouvelle_erreur_total = total_corrige - total_entier

    a_corrige = p * x + etat.erreur_a
    a = math.floor(a_corrige + 0.5)
    a = max(0, min(total_entier, a))
    nouvelle_erreur_a = a_corrige - a
    b = total_entier - a

    return a, b, EtatArrondi(
        erreur_total=nouvelle_erreur_total,
        erreur_a=nouvelle_erreur_a,
    )


@dataclass
class GainPoints:
    points: float
    gagne_le: datetime


@dataclass(frozen=True)
class Ticket:
    """Ticket individuel conservant l'origine exacte de ses points."""

    identifiant: str
    nom: str
    distribution_points: tuple[tuple[int, float], ...]
    montant_total: float
    achete_le: datetime

    def distribution(self) -> dict[int, float]:
        return dict(self.distribution_points)


@dataclass(frozen=True)
class ResultatTirage:
    """Résultat calculé par Tirage, sans mutation du portefeuille."""

    identifiant: str
    ticket_id: str
    cartes: tuple[int, ...]
    gems: tuple[int, ...]
    nouvel_etat_arrondi: EtatArrondi
    wallet_version: int
    genere_le: datetime

    @property
    def nombre_cartes(self) -> int:
        return len(self.cartes)

    @property
    def nombre_gems(self) -> int:
        return len(self.gems)

    def as_dict(self) -> dict[str, list[int]]:
        return {
            "cartes": list(self.cartes),
            "gems": list(self.gems),
        }


@dataclass
class Portefeuille:
    points_par_niveau: dict[int, list[GainPoints]] = field(
        default_factory=dict
    )
    tickets: dict[str, Ticket] = field(default_factory=dict)
    possessions: list[int] = field(default_factory=list)
    gems: int = 0
    dernier_gain_points: datetime | None = None
    jours_inactivite_traites: int = 0
    cartes_debut_inactivite: int | None = None
    etat_arrondi: EtatArrondi = field(default_factory=EtatArrondi)
    version: int = 0
    perte_inactivite: PolitiquePerteInactivite = field(
        default=perte_exponentielle,
        repr=False,
        compare=False,
        kw_only=True,
    )
    duree_periode_inactivite: float = field(
        default=SECONDS_PER_DAY,
        kw_only=True,
    )
    nombre_lecons_programme: int = field(
        default=NOMBRE_LECONS,
        kw_only=True,
    )
    nombre_cartes_collection: int = field(
        default=len(POOL_CARTES),
        kw_only=True,
    )
    modele_recompenses: ModeleRecompenses | None = field(
        default=None,
        repr=False,
        compare=False,
        kw_only=True,
    )
    rng: random.Random = field(
        default_factory=random.Random,
        repr=False,
        compare=False,
    )
    _politique_utilise_stock: bool = field(
        init=False,
        repr=False,
        compare=False,
    )

    def __post_init__(self) -> None:
        if (
            isinstance(self.nombre_lecons_programme, bool)
            or not isinstance(self.nombre_lecons_programme, Integral)
            or self.nombre_lecons_programme <= 0
        ):
            raise ValueError(
                "nombre_lecons_programme doit être un entier strictement positif"
            )
        if (
            isinstance(self.nombre_cartes_collection, bool)
            or not isinstance(self.nombre_cartes_collection, Integral)
            or self.nombre_cartes_collection <= 0
        ):
            raise ValueError(
                "nombre_cartes_collection doit être un entier strictement positif"
            )
        if self.modele_recompenses is not None:
            if not isinstance(self.modele_recompenses, ModeleRecompenses):
                raise TypeError(
                    "modele_recompenses doit être un ModeleRecompenses"
                )
            if (
                self.modele_recompenses.nombre_lecons
                != self.nombre_lecons_programme
            ):
                raise ValueError(
                    "Le modèle de récompenses et le portefeuille doivent avoir "
                    "le même nombre de leçons"
                )
            if (
                self.modele_recompenses.nombre_cartes
                != self.nombre_cartes_collection
            ):
                raise ValueError(
                    "Le modèle de récompenses et le portefeuille doivent avoir "
                    "la même taille de collection"
                )
        if self.gems < 0:
            raise ValueError("Le compteur de gems ne peut pas être négatif")
        if len(self.possessions) != len(set(self.possessions)):
            raise ValueError("Les possessions ne peuvent pas contenir de doublons")
        if any(index not in self.pool_cartes for index in self.possessions):
            raise ValueError(
                "Les index des possessions doivent être compris entre 1 et "
                f"{self.nombre_cartes_collection}"
            )
        if (
            isinstance(self.jours_inactivite_traites, bool)
            or not isinstance(self.jours_inactivite_traites, Integral)
            or self.jours_inactivite_traites < 0
        ):
            raise ValueError(
                "jours_inactivite_traites doit être un entier positif ou nul"
            )
        if (
            self.cartes_debut_inactivite is not None
            and (
                isinstance(self.cartes_debut_inactivite, bool)
                or not isinstance(self.cartes_debut_inactivite, Integral)
                or self.cartes_debut_inactivite < 0
            )
        ):
            raise ValueError(
                "cartes_debut_inactivite doit être un entier positif ou nul"
            )
        if not callable(self.perte_inactivite):
            raise TypeError("perte_inactivite doit être une fonction appelable")
        self._politique_utilise_stock = _politique_perte_utilise_stock(
            self.perte_inactivite
        )
        if (
            not math.isfinite(self.duree_periode_inactivite)
            or self.duree_periode_inactivite <= 0
        ):
            raise ValueError(
                "duree_periode_inactivite doit être strictement positive"
            )
        if self._perte_cumulee(0) != 0:
            raise ValueError("perte_inactivite(0) doit renvoyer 0")

    @property
    def pool_cartes(self) -> tuple[int, ...]:
        return tuple(range(1, int(self.nombre_cartes_collection) + 1))

    @property
    def periodes_inactivite_traitees(self) -> int:
        """Alias explicite du nom historique jours_inactivite_traites."""
        return int(self.jours_inactivite_traites)

    @periodes_inactivite_traitees.setter
    def periodes_inactivite_traitees(self, valeur: int) -> None:
        self.jours_inactivite_traites = valeur

    def _perte_cumulee(self, periodes: int) -> int:
        stock_reference = (
            self.cartes_debut_inactivite
            if self.cartes_debut_inactivite is not None
            else len(self.possessions)
        )
        if self._politique_utilise_stock:
            resultat = self.perte_inactivite(
                periodes,
                stock_reference,
            )
        else:
            resultat = self.perte_inactivite(periodes)
        if isinstance(resultat, bool) or not isinstance(resultat, Integral):
            raise TypeError(
                "perte_inactivite doit toujours renvoyer un entier"
            )
        if resultat < 0:
            raise ValueError(
                "perte_inactivite doit toujours renvoyer une valeur positive ou nulle"
            )
        return int(resultat)

    def _perte_entre(self, debut: int, fin: int) -> int:
        """Valide la monotonie et renvoie la perte entre deux périodes."""
        if fin < debut:
            return 0
        perte_precedente = self._perte_cumulee(debut)
        perte_initiale = perte_precedente
        for periode in range(debut + 1, fin + 1):
            perte_courante = self._perte_cumulee(periode)
            if perte_courante < perte_precedente:
                raise ValueError(
                    "perte_inactivite doit être croissante ou constante"
                )
            perte_precedente = perte_courante
        return perte_precedente - perte_initiale

    @property
    def solde(self) -> float:
        return sum(
            gain.points
            for gains in self.points_par_niveau.values()
            for gain in gains
        )

    def _nombre_tickets(self, nom: str) -> int:
        return sum(ticket.nom == nom for ticket in self.tickets.values())

    @property
    def gold(self) -> int:
        return self._nombre_tickets("gold")

    @property
    def silver(self) -> int:
        return self._nombre_tickets("silver")

    @property
    def bronze(self) -> int:
        return self._nombre_tickets("bronze")

    def identifiant_ticket_le_plus_ancien(
        self,
        type_ticket: str,
    ) -> str | None:
        """Renvoie la clé du plus ancien ticket du type demandé.

        La méthode ne retire pas le ticket du portefeuille. ``golden`` est
        accepté comme alias de ``gold``. Elle renvoie ``None`` lorsqu'aucun
        ticket du type demandé n'est disponible.
        """
        type_normalise = "gold" if type_ticket == "golden" else type_ticket
        if type_normalise not in TARIFS_TICKETS:
            raise ValueError(
                f"Type de ticket inconnu : {type_ticket!r}. "
                "Valeurs acceptées : 'gold', 'golden', 'silver', 'bronze'"
            )

        tickets_du_type = (
            (identifiant, ticket)
            for identifiant, ticket in self.tickets.items()
            if ticket.nom == type_normalise
        )
        plus_ancien = min(
            tickets_du_type,
            key=lambda element: (element[1].achete_le, element[0]),
            default=None,
        )
        return plus_ancien[0] if plus_ancien is not None else None

    def ajouter_points(
        self,
        niveau: int,
        points: float,
        timestamp: datetime | None = None,
    ) -> dict[str, object]:
        if not 1 <= niveau <= self.nombre_lecons_programme:
            raise ValueError(
                "Le niveau doit être compris entre 1 et "
                f"{self.nombre_lecons_programme}"
            )
        if not math.isfinite(points) or points < 0:
            raise ValueError("Les points ne peuvent pas être négatifs")
        if timestamp is None:
            timestamp = datetime.now(timezone.utc)
        if timestamp.tzinfo is None:
            raise ValueError("Le timestamp doit contenir un fuseau horaire")
        if points == 0:
            return self.etat()

        self.points_par_niveau.setdefault(niveau, []).append(
            GainPoints(points=points, gagne_le=timestamp)
        )
        if (
            self.dernier_gain_points is None
            or timestamp >= self.dernier_gain_points
        ):
            self.dernier_gain_points = timestamp
            self.jours_inactivite_traites = 0
            self.cartes_debut_inactivite = None
        self.version += 1
        return self.etat()

    def montant_distribution(self, points: float) -> dict[int, float]:
        """Prépare un prélèvement par niveau sans modifier le portefeuille."""
        if not math.isfinite(points) or points < 0:
            raise ValueError("Le nombre de points doit être positif ou nul")
        if self.solde < points:
            raise SoldeInsuffisantError(
                f"Solde insuffisant : {self.solde} points disponibles, "
                f"{points} points nécessaires"
            )

        distribution: dict[int, float] = {}
        points_restants = points
        for niveau in sorted(self.points_par_niveau):
            if points_restants == 0:
                break
            disponibles = sum(
                gain.points for gain in self.points_par_niveau[niveau]
            )
            utilises = min(disponibles, points_restants)
            if utilises:
                distribution[niveau] = utilises
                points_restants -= utilises
        return distribution

    def _appliquer_distribution(
        self,
        distribution: dict[int, float],
    ) -> None:
        """Applique un plan déjà validé, sans toucher à la version."""
        for niveau, montant_a_retirer in distribution.items():
            gains = self.points_par_niveau[niveau]
            reste_niveau = montant_a_retirer
            for gain in gains:
                if reste_niveau == 0:
                    break
                retires = min(gain.points, reste_niveau)
                gain.points -= retires
                reste_niveau -= retires
            if reste_niveau:
                raise RuntimeError("Distribution incohérente avec le portefeuille")
            self.points_par_niveau[niveau] = [
                gain for gain in gains if gain.points > 0
            ]
        self.points_par_niveau = {
            niveau: gains
            for niveau, gains in self.points_par_niveau.items()
            if gains
        }

    def soustraire_points(self, points: float) -> dict[str, object]:
        distribution = self.montant_distribution(points)
        if distribution:
            self._appliquer_distribution(distribution)
            self.version += 1
        return self.etat()

    def buy_ticket(
        self,
        nom: str,
        timestamp: datetime | None = None,
    ) -> Ticket:
        """Achète et conserve un ticket individuel dans le portefeuille."""
        if nom not in TARIFS_TICKETS:
            raise ValueError(
                f"Ticket inconnu : {nom!r}. "
                f"Valeurs acceptées : {sorted(TARIFS_TICKETS)}"
            )
        if timestamp is None:
            timestamp = datetime.now(timezone.utc)
        if timestamp.tzinfo is None:
            raise ValueError("Le timestamp doit contenir un fuseau horaire")

        prix = TARIFS_TICKETS[nom]
        distribution = self.montant_distribution(prix)
        ticket = Ticket(
            identifiant=uuid4().hex,
            nom=nom,
            distribution_points=tuple(sorted(distribution.items())),
            montant_total=prix,
            achete_le=timestamp,
        )

        self._appliquer_distribution(distribution)
        self.tickets[ticket.identifiant] = ticket
        self.version += 1
        return ticket

    def update_wallet(self, resultat: ResultatTirage) -> dict[str, object]:
        """Applique atomiquement un résultat de tirage encore valide."""
        if resultat.wallet_version != self.version:
            raise ResultatObsoleteError(
                "Le portefeuille a changé depuis le calcul du tirage"
            )
        if resultat.ticket_id not in self.tickets:
            raise ValueError("Le ticket n'appartient plus au portefeuille")
        if len(resultat.cartes) != len(set(resultat.cartes)):
            raise ValueError("Le résultat contient deux fois la même nouvelle carte")

        possessions_actuelles = set(self.possessions)
        if any(index not in self.pool_cartes for index in resultat.cartes):
            raise ValueError("Une nouvelle carte possède un index invalide")
        if possessions_actuelles.intersection(resultat.cartes):
            raise ValueError("Une nouvelle carte est déjà possédée")
        if any(index not in possessions_actuelles for index in resultat.gems):
            raise ValueError(
                "Un gem ne correspond pas à une possession présente au moment du tirage"
            )

        self.possessions.extend(resultat.cartes)
        self.gems += len(resultat.gems)
        self.etat_arrondi = resultat.nouvel_etat_arrondi
        del self.tickets[resultat.ticket_id]
        self.version += 1
        return self.etat()

    def last_activity(self, now: datetime | None = None) -> float | None:
        if self.dernier_gain_points is None:
            return None
        if now is None:
            now = datetime.now(timezone.utc)
        if now.tzinfo is None:
            raise ValueError("Le timestamp now doit contenir un fuseau horaire")
        return max(0.0, (now - self.dernier_gain_points).total_seconds())

    def _supprimer_possessions_sans_version(self, number: int) -> list[int]:
        nombre = min(number, len(self.possessions))
        if nombre == 0:
            return []
        positions = self.rng.sample(range(len(self.possessions)), k=nombre)
        supprimees: list[int] = []
        for position in sorted(positions, reverse=True):
            supprimees.append(self.possessions.pop(position))
        return supprimees

    def loose_possessions(self, number: int) -> list[int]:
        if number < 0:
            raise ValueError("number doit être positif ou nul")
        supprimees = self._supprimer_possessions_sans_version(number)
        if supprimees:
            self.version += 1
        return supprimees

    def update_status(self, now: datetime | None = None) -> list[int]:
        secondes = self.last_activity(now)
        if secondes is None:
            return []

        periodes_calculees = int(
            secondes // self.duree_periode_inactivite
        )
        anciennes_periodes = self.periodes_inactivite_traitees
        periodes = max(anciennes_periodes, periodes_calculees)
        reference_initialisee = False
        if periodes > 0 and self.cartes_debut_inactivite is None:
            self.cartes_debut_inactivite = len(self.possessions)
            reference_initialisee = True
        nombre_a_supprimer = self._perte_entre(
            anciennes_periodes,
            periodes,
        )
        supprimees = self._supprimer_possessions_sans_version(
            nombre_a_supprimer
        )
        self.periodes_inactivite_traitees = periodes
        if (
            periodes != anciennes_periodes
            or supprimees
            or reference_initialisee
        ):
            self.version += 1
        return supprimees

    def _prochaine_periode_avec_perte(
        self,
        apres_periode: int,
        limite_recherche: int = 10_000,
    ) -> tuple[int, int] | None:
        perte_precedente = self._perte_cumulee(apres_periode)
        for periode in range(
            apres_periode + 1,
            apres_periode + limite_recherche + 1,
        ):
            perte_courante = self._perte_cumulee(periode)
            if perte_courante < perte_precedente:
                raise ValueError(
                    "perte_inactivite doit être croissante ou constante"
                )
            if perte_courante > perte_precedente:
                return periode, perte_courante - perte_precedente
            perte_precedente = perte_courante
        return None

    def notifications(self, now: datetime | None = None) -> str:
        secondes = self.last_activity(now)
        if secondes is None:
            return "Aucun gain de points n'a encore été enregistré."
        if not self.possessions:
            return "Aucune possession ne peut actuellement être supprimée."

        periodes_sans_activite = int(
            secondes // self.duree_periode_inactivite
        )
        periodes_traitees = self.periodes_inactivite_traitees

        # Certaines pénalités sont arrivées à échéance, mais n'ont pas encore
        # été appliquées par update_status(). Cette méthode se contente de les
        # signaler et ne modifie jamais le portefeuille.
        if periodes_sans_activite > periodes_traitees:
            nombre = min(
                self._perte_entre(
                    periodes_traitees,
                    periodes_sans_activite,
                ),
                len(self.possessions),
            )
            if nombre > 0:
                return (
                    f"Mise à jour en attente : {nombre} possession(s) devraient "
                    f"être supprimées pour "
                    f"{periodes_sans_activite - periodes_traitees} "
                    "période(s) d'inactivité non traitée(s)."
                )

        periode_de_depart = max(
            periodes_sans_activite,
            periodes_traitees,
        )
        prochaine_perte = self._prochaine_periode_avec_perte(
            periode_de_depart
        )
        if prochaine_perte is None:
            return (
                "Aucune suppression supplémentaire n'est prévue dans les "
                "10 000 prochaines périodes d'inactivité."
            )

        prochaine_periode, perte_supplementaire = prochaine_perte
        restantes = max(
            0,
            math.ceil(
                prochaine_periode * self.duree_periode_inactivite
                - secondes
            ),
        )
        heures, reste = divmod(restantes, 3600)
        minutes, secondes_restantes = divmod(reste, 60)
        nombre = min(perte_supplementaire, len(self.possessions))
        return (
            f"Prochaine suppression de {nombre} possession(s) dans "
            f"{heures} h {minutes} min {secondes_restantes} s."
        )

    def etat(self) -> dict[str, object]:
        return {
            "version": self.version,
            "solde": self.solde,
            "points_par_niveau": {
                niveau: [
                    {
                        "points": gain.points,
                        "gagne_le": gain.gagne_le.isoformat(),
                    }
                    for gain in gains
                ]
                for niveau, gains in sorted(self.points_par_niveau.items())
            },
            "tickets": {
                identifiant: {
                    "nom": ticket.nom,
                    "montant_total": ticket.montant_total,
                    "distribution_points": ticket.distribution(),
                    "achete_le": ticket.achete_le.isoformat(),
                }
                for identifiant, ticket in self.tickets.items()
            },
            "compteurs_tickets": {
                "gold": self.gold,
                "silver": self.silver,
                "bronze": self.bronze,
            },
            "possessions": list(self.possessions),
            "gems": self.gems,
            "etat_arrondi": {
                "erreur_total": self.etat_arrondi.erreur_total,
                "erreur_a": self.etat_arrondi.erreur_a,
            },
            "dernier_gain_points": (
                self.dernier_gain_points.isoformat()
                if self.dernier_gain_points is not None
                else None
            ),
            "jours_inactivite_traites": self.jours_inactivite_traites,
            "periodes_inactivite_traitees": (
                self.periodes_inactivite_traitees
            ),
            "cartes_debut_inactivite": self.cartes_debut_inactivite,
            "nombre_lecons_programme": self.nombre_lecons_programme,
            "nombre_cartes_collection": self.nombre_cartes_collection,
            "duree_periode_inactivite": self.duree_periode_inactivite,
            "politique_perte_inactivite": getattr(
                self.perte_inactivite,
                "__name__",
                type(self.perte_inactivite).__name__,
            ),
        }


def Tirage(
    portefeuille: Portefeuille,
    ticket: Ticket,
    variance: float,
    rng: random.Random | None = None,
) -> ResultatTirage:
    """Calcule un tirage sans modifier le portefeuille ni consommer le ticket."""
    ticket_stocke = portefeuille.tickets.get(ticket.identifiant)
    if ticket_stocke is None or ticket_stocke != ticket:
        raise ValueError("Ce ticket n'appartient pas au portefeuille")
    if not math.isfinite(variance) or variance < 0:
        raise ValueError("La variance doit être positive ou nulle")

    generateur = rng if rng is not None else random.Random()
    distribution = ticket.distribution()
    modele_recompenses = portefeuille.modele_recompenses
    fonction_cartes = (
        modele_recompenses.f_prime
        if modele_recompenses is not None
        else f_prime
    )
    fonction_gems = (
        modele_recompenses.g_prime
        if modele_recompenses is not None
        else g_prime
    )
    cartes_theoriques = sum(
        points * fonction_cartes(niveau)
        for niveau, points in distribution.items()
    )
    gems_theoriques = sum(
        points * fonction_gems(niveau)
        for niveau, points in distribution.items()
    )
    biens_theoriques = cartes_theoriques + gems_theoriques

    if biens_theoriques <= 0:
        raise ValueError("Le ticket ne produit aucun bien théorique")

    biens_realises = tirer_lognormale(
        moyenne=biens_theoriques,
        variance=variance,
        rng=generateur,
    )
    proportion_cartes = tirer_beta(
        alpha=cartes_theoriques,
        beta=gems_theoriques,
        rng=generateur,
    )
    nombre_cartes, nombre_gems, nouvel_etat = repartir_en_entiers(
        x=biens_realises,
        p=proportion_cartes,
        etat=portefeuille.etat_arrondi,
    )

    possessions_avant_tirage = tuple(portefeuille.possessions)
    possedees = set(possessions_avant_tirage)
    cartes_inconnues = [
        index for index in portefeuille.pool_cartes if index not in possedees
    ]
    nombre_cartes = min(nombre_cartes, len(cartes_inconnues))
    cartes_tirees = tuple(
        generateur.sample(cartes_inconnues, k=nombre_cartes)
    )

    if possessions_avant_tirage:
        gems_tires = tuple(
            generateur.choice(possessions_avant_tirage)
            for _ in range(nombre_gems)
        )
    else:
        gems_tires = ()

    return ResultatTirage(
        identifiant=uuid4().hex,
        ticket_id=ticket.identifiant,
        cartes=cartes_tirees,
        gems=gems_tires,
        nouvel_etat_arrondi=nouvel_etat,
        wallet_version=portefeuille.version,
        genere_le=datetime.now(timezone.utc),
    )


@dataclass
class Simulation:
    """Simule la progression d'un joueur et son portefeuille jour après jour."""

    nombre_heures_par_jour: float
    p_here: float
    p_exam_facile: float
    p_exam_moyen: float
    p_exam_difficile: float
    p_exam_bonus: float
    debut_simulation: datetime
    nombre_jours: int
    variance_lognormale: float
    programme: Programme | dict[str, dict[str, object]]
    config_points: dict[str, float]
    f1: float
    nombre_cartes_collection: int
    config_bonus: dict[str, str] | None = None
    seed: int | None = None
    perte_inactivite: PolitiquePerteInactivite = perte_exponentielle
    duree_periode_inactivite: float = SECONDS_PER_DAY

    portefeuille: Portefeuille = field(init=False)
    lecons_programme: tuple[LeconProgramme, ...] = field(
        init=False,
        repr=False,
    )
    nombre_lecons: int = field(init=False)
    points_max_programme: float = field(init=False)
    modele_recompenses: ModeleRecompenses = field(init=False, repr=False)
    lecon_courante: int = field(default=1, init=False)
    phase_courante: str = field(default="", init=False)
    tentatives_examen_courant: int = field(default=0, init=False)
    course_finished: bool = field(default=False, init=False)
    raison_arret: str | None = field(default=None, init=False)
    jours_simules: int = field(default=0, init=False)

    cartes_fin_journee: list[int] = field(default_factory=list, init=False)
    cartes_perdues_journee: list[int] = field(default_factory=list, init=False)
    cartes_acquises_journee: list[int] = field(default_factory=list, init=False)
    gems_fin_journee: list[int] = field(default_factory=list, init=False)
    gems_acquis_journee: list[int] = field(default_factory=list, init=False)
    objets_fin_journee: list[int] = field(default_factory=list, init=False)
    objets_acquis_journee: list[int] = field(default_factory=list, init=False)

    presences_journee: list[bool] = field(default_factory=list, init=False)
    lecons_reussies_journee: list[int] = field(
        default_factory=list,
        init=False,
    )
    points_gagnes_journee: list[float] = field(
        default_factory=list,
        init=False,
    )
    niveau_fin_journee: list[int] = field(default_factory=list, init=False)
    minutes_assignees_journee: list[float] = field(
        default_factory=list,
        init=False,
    )
    minutes_effectives_journee: list[float] = field(
        default_factory=list,
        init=False,
    )

    _rng: random.Random = field(init=False, repr=False)
    _simulation_executee: bool = field(default=False, init=False, repr=False)
    _events_par_jour: list[list[dict[str, object]]] = field(
        default_factory=list,
        init=False,
        repr=False,
    )

    def __post_init__(self) -> None:
        if (
            isinstance(self.nombre_heures_par_jour, bool)
            or not isinstance(self.nombre_heures_par_jour, (int, float))
            or not math.isfinite(self.nombre_heures_par_jour)
            or self.nombre_heures_par_jour <= 0
        ):
            raise ValueError(
                "nombre_heures_par_jour doit être strictement positif"
            )
        probabilites = {
            "p_here": self.p_here,
            "p_exam_facile": self.p_exam_facile,
            "p_exam_moyen": self.p_exam_moyen,
            "p_exam_difficile": self.p_exam_difficile,
            "p_exam_bonus": self.p_exam_bonus,
        }
        for nom, probabilite in probabilites.items():
            if not math.isfinite(probabilite) or not 0 <= probabilite <= 1:
                raise ValueError(f"{nom} doit être compris entre 0 et 1")
        if (
            isinstance(self.nombre_jours, bool)
            or not isinstance(self.nombre_jours, int)
            or self.nombre_jours <= 0
        ):
            raise ValueError("nombre_jours doit être un entier strictement positif")
        if (
            not math.isfinite(self.variance_lognormale)
            or self.variance_lognormale < 0
        ):
            raise ValueError("variance_lognormale doit être positive ou nulle")
        if self.debut_simulation.tzinfo is None:
            raise ValueError("debut_simulation doit contenir un fuseau horaire")

        if isinstance(self.programme, Programme):
            if (
                self.config_bonus is not None
                and self.config_bonus != self.programme.config_bonus
            ):
                raise ValueError(
                    "config_bonus contredit le mode_bonus de l'objet Programme"
                )
            self.config_bonus = self.programme.config_bonus

        self.programme = deepcopy(self.programme)
        self.config_points = deepcopy(self.config_points)
        self.config_bonus = deepcopy(self.config_bonus)
        self.lecons_programme, self.points_max_programme = preparer_programme(
            programme=self.programme,
            config_points=self.config_points,
            config_bonus=self.config_bonus,
        )
        self.nombre_lecons = len(self.lecons_programme)
        self.modele_recompenses = ModeleRecompenses(
            f1=self.f1,
            nombre_cartes=self.nombre_cartes_collection,
            nombre_lecons=self.nombre_lecons,
            points_max_programme=self.points_max_programme,
        )

        self._rng = random.Random(self.seed)
        self.portefeuille = Portefeuille(
            perte_inactivite=self.perte_inactivite,
            duree_periode_inactivite=self.duree_periode_inactivite,
            nombre_lecons_programme=self.nombre_lecons,
            nombre_cartes_collection=self.nombre_cartes_collection,
            modele_recompenses=self.modele_recompenses,
            rng=self._rng,
        )
        self.phase_courante = self._phase_initiale(
            self.lecons_programme[0]
        )

    def _probabilite_examen(self, type_examen: str) -> float:
        return {
            "facile": self.p_exam_facile,
            "moyen": self.p_exam_moyen,
            "difficile": self.p_exam_difficile,
        }[type_examen]

    @staticmethod
    def _phase_initiale(lecon: LeconProgramme) -> str:
        """Les examens difficiles ne sont précédés d'aucun apprentissage."""
        return (
            "examen"
            if lecon.type_lesson == "difficile"
            else "apprentissage"
        )

    def _terminer_lecon(
        self,
        timestamp: datetime,
        evenements: list[dict[str, object]],
    ) -> None:
        """Passe à la prochaine tâche après l'examen et son éventuel bonus."""
        niveau_termine = self.lecon_courante
        self.tentatives_examen_courant = 0

        if niveau_termine == self.nombre_lecons:
            self.lecon_courante = self.nombre_lecons + 1
            self.phase_courante = "termine"
            self.course_finished = True
            self.raison_arret = f"{self.nombre_lecons}_lecons_reussies"
            evenements.append(
                {
                    "type": "parcours_termine",
                    "timestamp": timestamp.isoformat(),
                    "niveau": self.nombre_lecons,
                }
            )
            return

        self.lecon_courante += 1
        prochaine_lecon = self.lecons_programme[self.lecon_courante - 1]
        self.phase_courante = self._phase_initiale(prochaine_lecon)

    def _acheter_et_consommer_tickets_bronze(
        self,
        timestamp: datetime,
        evenements: list[dict[str, object]],
    ) -> tuple[int, int]:
        cartes_acquises = 0
        gems_acquis = 0

        while self.portefeuille.solde >= TARIFS_TICKETS["bronze"]:
            nombre_cartes_avant = len(self.portefeuille.possessions)
            ticket = self.portefeuille.buy_ticket(
                "bronze",
                timestamp=timestamp,
            )
            evenements.append(
                {
                    "type": "ticket_bronze_achete",
                    "timestamp": timestamp.isoformat(),
                    "montant_points": ticket.montant_total,
                    "distribution_points": ticket.distribution(),
                }
            )
            resultat = Tirage(
                portefeuille=self.portefeuille,
                ticket=ticket,
                variance=self.variance_lognormale,
                rng=self._rng,
            )
            self.portefeuille.update_wallet(resultat)
            cartes_acquises += resultat.nombre_cartes
            gems_acquis += resultat.nombre_gems
            evenements.append(
                {
                    "type": "tirage",
                    "timestamp": timestamp.isoformat(),
                    "cartes": list(resultat.cartes),
                    "gems": list(resultat.gems),
                }
            )

            if (
                nombre_cartes_avant < self.nombre_cartes_collection
                and len(self.portefeuille.possessions)
                == self.nombre_cartes_collection
            ):
                evenements.append(
                    {
                        "type": "collection_terminee",
                        "timestamp": timestamp.isoformat(),
                        "nombre_cartes": self.nombre_cartes_collection,
                    }
                )
                if not self.course_finished:
                    self.course_finished = True
                    self.raison_arret = (
                        f"{self.nombre_cartes_collection}_cartes_collectees"
                    )
                    break

        return cartes_acquises, gems_acquis

    def _simuler_jour(self, index_jour: int) -> None:
        debut_journee = self.debut_simulation + timedelta(days=index_jour)
        fin_journee = self.debut_simulation + timedelta(days=index_jour + 1)
        evenements: list[dict[str, object]] = []

        cartes_perdues = self.portefeuille.update_status(now=debut_journee)
        evenements.append(
            {
                "type": "mise_a_jour_statut",
                "timestamp": debut_journee.isoformat(),
                "cartes_perdues": list(cartes_perdues),
            }
        )

        present = self._rng.random() < self.p_here
        evenements.append(
            {
                "type": "presence",
                "timestamp": debut_journee.isoformat(),
                "present": present,
            }
        )
        points_gagnes = 0.0
        lecons_reussies = 0
        minutes_assignees = float(self.nombre_heures_par_jour) * 60
        minutes_restantes = minutes_assignees if present else 0.0
        minutes_effectives = 0.0
        ordre_tache = 0

        while (
            present
            and not self.course_finished
            and minutes_restantes >= SEUIL_DEMARRAGE_TACHE_MINUTES
        ):
            ordre_tache += 1
            niveau_tente = self.lecon_courante
            lecon = self.lecons_programme[niveau_tente - 1]
            phase = self.phase_courante

            if phase == "apprentissage":
                duree_tache = DUREE_APPRENTISSAGE_MINUTES
            elif phase == "examen":
                duree_tache = DUREES_EXAMEN_MINUTES[lecon.type_lesson]
            elif phase == "bonus":
                duree_tache = DUREE_EXAMEN_BONUS_MINUTES
            else:
                raise RuntimeError(f"Phase de travail inconnue : {phase!r}")

            minutes_avant = minutes_restantes
            minutes_effectives += duree_tache
            minutes_restantes -= duree_tache
            contexte_temps = {
                "ordre_tache": ordre_tache,
                "duree_minutes": duree_tache,
                "minutes_restantes_avant": minutes_avant,
                "minutes_restantes_apres": minutes_restantes,
                "depassement_minutes": max(0.0, -minutes_restantes),
            }
            contexte_lecon = {
                "niveau": niveau_tente,
                "chapter_name": lecon.chapter_name,
                "chapter_index": lecon.chapter_index,
                "index_lesson": lecon.index_lesson,
                "name_lesson": lecon.name_lesson,
                "type_lesson": lecon.type_lesson,
            }

            if phase == "apprentissage":
                self.phase_courante = "examen"
                evenements.append(
                    {
                        "type": "apprentissage_lecon_termine",
                        "timestamp": fin_journee.isoformat(),
                        **contexte_lecon,
                        **contexte_temps,
                    }
                )
                continue

            if phase == "examen":
                self.tentatives_examen_courant += 1
                numero_tentative = self.tentatives_examen_courant
                probabilite = self._probabilite_examen(
                    lecon.type_lesson
                )
                examen_reussi = self._rng.random() < probabilite

                if not examen_reussi:
                    evenements.append(
                        {
                            "type": "lecon_echouee",
                            "timestamp": fin_journee.isoformat(),
                            "numero_tentative": numero_tentative,
                            "points_potentiels": lecon.points_lesson,
                            **contexte_lecon,
                            **contexte_temps,
                        }
                    )
                    continue

                self.portefeuille.ajouter_points(
                    niveau=niveau_tente,
                    points=lecon.points_lesson,
                    timestamp=fin_journee,
                )
                points_gagnes += lecon.points_lesson
                lecons_reussies += 1
                evenements.append(
                    {
                        "type": "lecon_reussie",
                        "timestamp": fin_journee.isoformat(),
                        "numero_tentative": numero_tentative,
                        "points_gagnes": lecon.points_lesson,
                        **contexte_lecon,
                        **contexte_temps,
                    }
                )

                if lecon.bonus_propose:
                    self.phase_courante = "bonus"
                else:
                    self._terminer_lecon(fin_journee, evenements)
                continue

            # Le bonus est une tâche distincte, proposée une seule fois.
            bonus_reussi = self._rng.random() < self.p_exam_bonus
            points_bonus = float(self.config_points["bonus"])
            if bonus_reussi:
                self.portefeuille.ajouter_points(
                    niveau=niveau_tente,
                    points=points_bonus,
                    timestamp=fin_journee,
                )
                points_gagnes += points_bonus
            evenements.append(
                {
                    "type": (
                        "examen_bonus_reussi"
                        if bonus_reussi
                        else "examen_bonus_echoue"
                    ),
                    "timestamp": fin_journee.isoformat(),
                    "numero_tentative": 1,
                    "points_gagnes": points_bonus if bonus_reussi else 0,
                    **contexte_lecon,
                    **contexte_temps,
                }
            )
            self._terminer_lecon(fin_journee, evenements)

        cartes_acquises, gems_acquis = (
            self._acheter_et_consommer_tickets_bronze(
                fin_journee,
                evenements,
            )
        )

        evenements.append(
            {
                "type": "fin_journee",
                "timestamp": fin_journee.isoformat(),
                "solde_points": self.portefeuille.solde,
                "nombre_cartes": len(self.portefeuille.possessions),
                "nombre_gems": self.portefeuille.gems,
                "niveau_courant": self.lecon_courante,
                "phase_courante": self.phase_courante,
                "minutes_assignees": minutes_assignees,
                "minutes_effectives": minutes_effectives,
                "minutes_restantes": minutes_restantes,
                "raison_arret": self.raison_arret,
            }
        )
        self._events_par_jour.append(evenements)

        self.presences_journee.append(present)
        self.lecons_reussies_journee.append(lecons_reussies)
        self.points_gagnes_journee.append(points_gagnes)
        self.niveau_fin_journee.append(self.lecon_courante)
        self.minutes_assignees_journee.append(minutes_assignees)
        self.minutes_effectives_journee.append(minutes_effectives)
        self.cartes_acquises_journee.append(cartes_acquises)
        self.cartes_perdues_journee.append(len(cartes_perdues))
        self.cartes_fin_journee.append(len(self.portefeuille.possessions))
        self.gems_acquis_journee.append(gems_acquis)
        self.gems_fin_journee.append(self.portefeuille.gems)
        self.objets_acquis_journee.append(cartes_acquises + gems_acquis)
        self.objets_fin_journee.append(
            len(self.portefeuille.possessions) + self.portefeuille.gems
        )

    def executer(
        self,
        retourner_resultats: bool = True,
    ) -> dict[str, object] | None:
        """Exécute la simulation une fois et renvoie éventuellement ses résultats."""
        if self._simulation_executee:
            raise RuntimeError("Cette simulation a déjà été exécutée")
        self._simulation_executee = True

        for index_jour in range(self.nombre_jours):
            self._simuler_jour(index_jour)
            self.jours_simules += 1
            if self.course_finished:
                break

        return self.resultats() if retourner_resultats else None

    def resultats(self) -> dict[str, object]:
        """Renvoie une copie des séries produites par la simulation."""
        return {
            "course_finished": self.course_finished,
            "raison_arret": self.raison_arret,
            "jours_simules": self.jours_simules,
            "lecon_courante": self.lecon_courante,
            "phase_courante": self.phase_courante,
            "tentatives_examen_courant": self.tentatives_examen_courant,
            "nombre_lecons": self.nombre_lecons,
            "nombre_cartes_collection": self.nombre_cartes_collection,
            "ratio_recompenses": self.modele_recompenses.ratio,
            "points_max_programme": self.points_max_programme,
            "cartes_fin_journee": list(self.cartes_fin_journee),
            "cartes_perdues_journee": list(self.cartes_perdues_journee),
            "cartes_acquises_journee": list(self.cartes_acquises_journee),
            "gems_fin_journee": list(self.gems_fin_journee),
            "gems_acquis_journee": list(self.gems_acquis_journee),
            "objets_fin_journee": list(self.objets_fin_journee),
            "objets_acquis_journee": list(self.objets_acquis_journee),
            "presences_journee": list(self.presences_journee),
            "lecons_reussies_journee": list(
                self.lecons_reussies_journee
            ),
            "points_gagnes_journee": list(self.points_gagnes_journee),
            "niveau_fin_journee": list(self.niveau_fin_journee),
            "minutes_assignees_journee": list(
                self.minutes_assignees_journee
            ),
            "minutes_effectives_journee": list(
                self.minutes_effectives_journee
            ),
            "events_par_jour": deepcopy(self._events_par_jour),
        }

    def events(self, jour: int) -> list[dict[str, object]]:
        """Renvoie les événements du jour demandé sans modifier la simulation.

        Le jour 1 correspond au premier jour simulé.
        """
        if isinstance(jour, bool) or not isinstance(jour, int):
            raise TypeError("jour doit être un entier")
        if self.jours_simules == 0:
            raise ValueError(
                "Aucun événement disponible. Exécutez d'abord la simulation."
            )
        if not 1 <= jour <= self.jours_simules:
            raise IndexError(
                f"Jour indisponible : {jour}. "
                f"Jours disponibles : 1 à {self.jours_simules}"
            )
        return deepcopy(self._events_par_jour[jour - 1])

    def plot(self, nom_attribut: str) -> tuple[object, object]:
        """Affiche une série chronologique et renvoie ``(figure, axes)``."""
        if nom_attribut not in CONFIGURATION_GRAPHIQUES:
            attributs_acceptes = ", ".join(sorted(CONFIGURATION_GRAPHIQUES))
            raise ValueError(
                f"Série inconnue : {nom_attribut!r}. "
                f"Valeurs acceptées : {attributs_acceptes}"
            )

        valeurs = getattr(self, nom_attribut)
        if not valeurs:
            raise ValueError(
                "La série est vide. Exécutez d'abord la simulation avec "
                "executer()."
            )

        titre, etiquette_y = CONFIGURATION_GRAPHIQUES[nom_attribut]
        jours = range(1, len(valeurs) + 1)
        figure, axes = plt.subplots(figsize=(10, 5))
        marqueur = "o" if len(valeurs) <= 60 else None
        axes.plot(jours, valeurs, linewidth=2, marker=marqueur)
        axes.set_title(titre)
        axes.set_xlabel("Jour de simulation")
        axes.set_ylabel(etiquette_y)
        axes.set_xlim(1, max(2, len(valeurs)))

        if len(valeurs) <= 12:
            graduations = list(range(1, len(valeurs) + 1))
        else:
            pas = math.ceil((len(valeurs) - 1) / 9)
            graduations = list(range(1, len(valeurs) + 1, pas))
            if graduations[-1] != len(valeurs):
                graduations.append(len(valeurs))
        axes.set_xticks(
            graduations,
            labels=[str(jour) for jour in graduations],
        )

        axes.set_ylim(bottom=0)
        axes.grid(True, alpha=0.3)

        if nom_attribut == "presences_journee":
            axes.set_yticks([0, 1], labels=["Absent", "Présent"])

        figure.tight_layout()
        plt.show()
        return figure, axes


@dataclass
class SimulationMonteCarlo:
    """Agrège plusieurs parcours indépendants avec la même configuration.

    Après l'arrêt d'un parcours, les métriques cumulatives conservent leur
    dernière valeur et les métriques quotidiennes valent zéro. Toutes les
    trajectoires couvrent ainsi le même horizon ``nombre_jours``.
    """

    nombre_simulations: int
    nombre_heures_par_jour: float
    p_here: float
    p_exam_facile: float
    p_exam_moyen: float
    p_exam_difficile: float
    p_exam_bonus: float
    debut_simulation: datetime
    nombre_jours: int
    variance_lognormale: float
    programme: Programme | dict[str, dict[str, object]]
    config_points: dict[str, float]
    f1: float
    nombre_cartes_collection: int
    config_bonus: dict[str, str] | None = None
    seed: int | None = None
    perte_inactivite: PolitiquePerteInactivite = perte_exponentielle
    duree_periode_inactivite: float = SECONDS_PER_DAY

    donnees: dict[str, np.ndarray] = field(
        default_factory=dict,
        init=False,
        repr=False,
    )
    durees: np.ndarray = field(init=False, repr=False)
    raisons_arret: list[str | None] = field(
        default_factory=list,
        init=False,
    )
    _rng: random.Random = field(init=False, repr=False)
    _executee: bool = field(default=False, init=False, repr=False)

    def __post_init__(self) -> None:
        if (
            isinstance(self.nombre_simulations, bool)
            or not isinstance(self.nombre_simulations, int)
            or self.nombre_simulations <= 0
        ):
            raise ValueError(
                "nombre_simulations doit être un entier strictement positif"
            )

        if isinstance(self.programme, Programme):
            if (
                self.config_bonus is not None
                and self.config_bonus != self.programme.config_bonus
            ):
                raise ValueError(
                    "config_bonus contredit le mode_bonus de l'objet Programme"
                )
            self.config_bonus = self.programme.config_bonus

        # Une simulation témoin valide tous les paramètres communs.
        Simulation(
            nombre_heures_par_jour=self.nombre_heures_par_jour,
            p_here=self.p_here,
            p_exam_facile=self.p_exam_facile,
            p_exam_moyen=self.p_exam_moyen,
            p_exam_difficile=self.p_exam_difficile,
            p_exam_bonus=self.p_exam_bonus,
            debut_simulation=self.debut_simulation,
            nombre_jours=self.nombre_jours,
            variance_lognormale=self.variance_lognormale,
            programme=self.programme,
            config_points=self.config_points,
            config_bonus=self.config_bonus,
            f1=self.f1,
            nombre_cartes_collection=self.nombre_cartes_collection,
            seed=self.seed,
            perte_inactivite=self.perte_inactivite,
            duree_periode_inactivite=self.duree_periode_inactivite,
        )
        self._rng = random.Random(self.seed)
        self.durees = np.empty(0, dtype=np.int32)

    @property
    def metriques_disponibles(self) -> tuple[str, ...]:
        return METRIQUES_MONTE_CARLO

    def executer(self) -> None:
        """Exécute tous les parcours et conserve leurs séries agrégées."""
        if self._executee:
            raise RuntimeError("Cette simulation Monte-Carlo a déjà été exécutée")
        self._executee = True

        self.donnees = {
            metrique: np.zeros(
                (self.nombre_simulations, self.nombre_jours),
                dtype=np.float32,
            )
            for metrique in METRIQUES_MONTE_CARLO
        }
        self.durees = np.zeros(self.nombre_simulations, dtype=np.int32)
        self.raisons_arret = []

        for numero_simulation in range(self.nombre_simulations):
            simulation = Simulation(
                nombre_heures_par_jour=self.nombre_heures_par_jour,
                p_here=self.p_here,
                p_exam_facile=self.p_exam_facile,
                p_exam_moyen=self.p_exam_moyen,
                p_exam_difficile=self.p_exam_difficile,
                p_exam_bonus=self.p_exam_bonus,
                debut_simulation=self.debut_simulation,
                nombre_jours=self.nombre_jours,
                variance_lognormale=self.variance_lognormale,
                programme=self.programme,
                config_points=self.config_points,
                config_bonus=self.config_bonus,
                f1=self.f1,
                nombre_cartes_collection=self.nombre_cartes_collection,
                seed=self._rng.getrandbits(64),
                perte_inactivite=self.perte_inactivite,
                duree_periode_inactivite=self.duree_periode_inactivite,
            )
            simulation.executer(retourner_resultats=False)
            duree = simulation.jours_simules
            self.durees[numero_simulation] = duree
            self.raisons_arret.append(simulation.raison_arret)

            for metrique in METRIQUES_MONTE_CARLO:
                valeurs = np.asarray(
                    getattr(simulation, metrique),
                    dtype=np.float32,
                )
                self.donnees[metrique][numero_simulation, :duree] = valeurs

                if metrique in METRIQUES_CUMULATIVES and duree < self.nombre_jours:
                    self.donnees[metrique][numero_simulation, duree:] = (
                        valeurs[-1]
                    )

    def _serie(self, nom_attribut: str) -> np.ndarray:
        if not self._executee:
            raise ValueError(
                "Exécutez d'abord la simulation Monte-Carlo avec executer()."
            )
        if nom_attribut not in METRIQUES_MONTE_CARLO:
            metriques = ", ".join(METRIQUES_MONTE_CARLO)
            raise ValueError(
                f"Métrique inconnue : {nom_attribut!r}. "
                f"Valeurs acceptées : {metriques}"
            )
        return self.donnees[nom_attribut]

    @staticmethod
    def _niveaux_valides(
        niveaux: tuple[float, ...],
    ) -> tuple[float, ...]:
        if not niveaux:
            raise ValueError("Au moins un niveau d'intervalle est nécessaire")
        niveaux_tries = tuple(sorted(set(niveaux)))
        if any(
            isinstance(niveau, bool)
            or not math.isfinite(niveau)
            or not 0 < niveau < 1
            for niveau in niveaux_tries
        ):
            raise ValueError("Chaque niveau doit être strictement compris entre 0 et 1")
        return niveaux_tries

    def statistiques(
        self,
        nom_attribut: str,
        niveaux: tuple[float, ...] = (0.50, 0.80, 0.95),
    ) -> dict[str, object]:
        """Renvoie moyenne, variance et intervalles empiriques par jour."""
        serie = self._serie(nom_attribut).astype(np.float64)
        niveaux_valides = self._niveaux_valides(niveaux)
        ddof = 1 if self.nombre_simulations > 1 else 0
        intervalles = {}

        for niveau in niveaux_valides:
            alpha = (1 - niveau) / 2
            intervalles[niveau] = {
                "borne_basse": np.quantile(serie, alpha, axis=0),
                "borne_haute": np.quantile(serie, 1 - alpha, axis=0),
            }

        return {
            "jours": np.arange(1, self.nombre_jours + 1),
            "moyenne": np.mean(serie, axis=0),
            "variance": np.var(serie, axis=0, ddof=ddof),
            "ecart_type": np.std(serie, axis=0, ddof=ddof),
            "intervalles_prediction": intervalles,
        }

    def variance(self, nom_attribut: str) -> np.ndarray:
        """Renvoie la variance entre parcours pour chaque jour."""
        return self.statistiques(nom_attribut)["variance"]

    def plot(
        self,
        nom_attribut: str,
        niveaux: tuple[float, ...] = (0.50, 0.80, 0.95),
        type_intervalle: str = "prediction",
    ) -> tuple[object, object]:
        """Trace la moyenne et des bandes de variabilité imbriquées.

        ``prediction`` affiche les quantiles entre joueurs. ``moyenne`` affiche
        l'incertitude statistique sur l'estimation de la moyenne.
        """
        serie = self._serie(nom_attribut).astype(np.float64)
        niveaux_valides = self._niveaux_valides(niveaux)
        if type_intervalle not in {"prediction", "moyenne"}:
            raise ValueError(
                "type_intervalle doit valoir 'prediction' ou 'moyenne'"
            )

        jours = np.arange(1, self.nombre_jours + 1)
        moyenne = np.mean(serie, axis=0)
        figure, axes = plt.subplots(figsize=(11, 6))

        # La bande la plus large est dessinée en premier. La superposition des
        # bandes rend les zones centrales progressivement plus foncées.
        for niveau in reversed(niveaux_valides):
            if type_intervalle == "prediction":
                alpha = (1 - niveau) / 2
                borne_basse = np.quantile(serie, alpha, axis=0)
                borne_haute = np.quantile(serie, 1 - alpha, axis=0)
                etiquette = f"Intervalle central {niveau:.0%}"
            else:
                ddof = 1 if self.nombre_simulations > 1 else 0
                erreur_standard = np.std(serie, axis=0, ddof=ddof) / math.sqrt(
                    self.nombre_simulations
                )
                z = NormalDist().inv_cdf(0.5 + niveau / 2)
                borne_basse = moyenne - z * erreur_standard
                borne_haute = moyenne + z * erreur_standard
                etiquette = f"IC moyenne {niveau:.0%}"

            axes.fill_between(
                jours,
                np.maximum(0, borne_basse),
                borne_haute,
                alpha=0.11,
                color="C0",
                label=etiquette,
            )

        axes.plot(
            jours,
            moyenne,
            color="C0",
            linewidth=2.2,
            label="Moyenne",
        )

        titre, etiquette_y = CONFIGURATION_GRAPHIQUES[nom_attribut]
        axes.set_title(
            f"{titre} — {self.nombre_simulations:,} simulations".replace(
                ",",
                " ",
            )
        )
        axes.set_xlabel("Jour de simulation")
        axes.set_ylabel(
            "Proportion de joueurs présents"
            if nom_attribut == "presences_journee"
            else etiquette_y
        )
        axes.set_xlim(1, max(2, self.nombre_jours))

        if self.nombre_jours <= 12:
            graduations = list(range(1, self.nombre_jours + 1))
        else:
            pas = math.ceil((self.nombre_jours - 1) / 9)
            graduations = list(range(1, self.nombre_jours + 1, pas))
            if graduations[-1] != self.nombre_jours:
                graduations.append(self.nombre_jours)
        axes.set_xticks(
            graduations,
            labels=[str(jour) for jour in graduations],
        )

        axes.set_ylim(bottom=0)
        if nom_attribut == "presences_journee":
            axes.set_ylim(0, 1)
        axes.grid(True, alpha=0.25)
        axes.legend()
        figure.tight_layout()
        plt.show()
        return figure, axes
