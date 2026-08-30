"""Moteur de portefeuille (points, tickets, cartes, gems) — port de
`instructions/wallet_behavior/simulation.py` (partie Portefeuille uniquement,
sans la simulation de trajectoire ni matplotlib/numpy). Les formules ne sont
pas modifiées : ce module est du code de référence déjà validé par le user.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timezone
from inspect import signature
from numbers import Integral
from typing import Callable, Final
from uuid import uuid4

SECONDS_PER_DAY: Final = 86_400

TARIFS_TICKETS: Final = {
    "gold": 100,
    "silver": 50,
    "bronze": 25,
}


class SoldeInsuffisantError(ValueError):
    """Le portefeuille ne contient pas assez de points."""


class ResultatObsoleteError(ValueError):
    """Le portefeuille a changé depuis le calcul du tirage."""


PolitiquePerteInactivite = Callable[..., int]


def fonction_perte(periodes: int, cartes_debut_inactivite: int) -> int:
    """Perte cumulative après `periodes` périodes d'inactivité (doublement,
    plafonné au stock de référence). Reprise telle quelle de
    `instructions/wallet_behavior/init_object.py`."""
    if isinstance(periodes, bool) or not isinstance(periodes, int):
        raise TypeError("periodes doit être un entier")
    if periodes < 0:
        raise ValueError("periodes doit être positif ou nul")
    if isinstance(cartes_debut_inactivite, bool) or not isinstance(cartes_debut_inactivite, int):
        raise TypeError("cartes_debut_inactivite doit être un entier")
    if cartes_debut_inactivite < 0:
        raise ValueError("cartes_debut_inactivite doit être positif ou nul")

    perte_cumulative = int(2 ** (periodes - 1) / 1)
    return min(perte_cumulative, cartes_debut_inactivite)


def _politique_perte_utilise_stock(politique: PolitiquePerteInactivite) -> bool:
    """Détermine si une politique accepte le stock de référence."""
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
        default=fonction_perte,
        repr=False,
        compare=False,
        kw_only=True,
    )
    duree_periode_inactivite: float = field(
        default=SECONDS_PER_DAY,
        kw_only=True,
    )
    nombre_lecons_programme: int = field(
        default=1,
        kw_only=True,
    )
    nombre_cartes_collection: int = field(
        default=230,
        kw_only=True,
    )
    cartes_exclues: frozenset[int] = field(
        default_factory=frozenset,
        repr=False,
        compare=False,
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
        return tuple(
            i for i in range(1, int(self.nombre_cartes_collection) + 1)
            if i not in self.cartes_exclues
        )

    @property
    def periodes_inactivite_traitees(self) -> int:
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
            resultat = self.perte_inactivite(periodes, stock_reference)
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

    def identifiant_ticket_le_plus_ancien(self, type_ticket: str) -> str | None:
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

    def _appliquer_distribution(self, distribution: dict[int, float]) -> None:
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

    def buy_ticket(self, nom: str, timestamp: datetime | None = None) -> Ticket:
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

        periodes_calculees = int(secondes // self.duree_periode_inactivite)
        anciennes_periodes = self.periodes_inactivite_traitees
        periodes = max(anciennes_periodes, periodes_calculees)
        reference_initialisee = False
        if periodes > 0 and self.cartes_debut_inactivite is None:
            self.cartes_debut_inactivite = len(self.possessions)
            reference_initialisee = True
        nombre_a_supprimer = self._perte_entre(anciennes_periodes, periodes)
        supprimees = self._supprimer_possessions_sans_version(nombre_a_supprimer)
        self.periodes_inactivite_traitees = periodes
        if periodes != anciennes_periodes or supprimees or reference_initialisee:
            self.version += 1
        return supprimees

    def _prochaine_periode_avec_perte(
        self,
        apres_periode: int,
        limite_recherche: int = 10_000,
    ) -> tuple[int, int] | None:
        perte_precedente = self._perte_cumulee(apres_periode)
        for periode in range(apres_periode + 1, apres_periode + limite_recherche + 1):
            perte_courante = self._perte_cumulee(periode)
            if perte_courante < perte_precedente:
                raise ValueError(
                    "perte_inactivite doit être croissante ou constante"
                )
            if perte_courante > perte_precedente:
                return periode, perte_courante - perte_precedente
            perte_precedente = perte_courante
        return None

    def prochain_palier(self, now: datetime | None = None) -> dict[str, object] | None:
        """Renvoie {"periode", "secondes_restantes", "cumul"} pour le
        prochain palier de perte non encore traité, ou None si aucun gain
        de points n'a encore eu lieu ou plus aucune perte n'est prévue."""
        secondes = self.last_activity(now)
        if secondes is None or not self.possessions:
            return None
        periode_de_depart = max(
            int(secondes // self.duree_periode_inactivite),
            self.periodes_inactivite_traitees,
        )
        prochaine = self._prochaine_periode_avec_perte(periode_de_depart)
        if prochaine is None:
            return None
        prochaine_periode, _ = prochaine
        secondes_restantes = max(
            0.0,
            prochaine_periode * self.duree_periode_inactivite - secondes,
        )
        stock_reference = (
            self.cartes_debut_inactivite
            if self.cartes_debut_inactivite is not None
            else len(self.possessions)
        )
        cumul = self._perte_cumulee(prochaine_periode)
        return {
            "periode": prochaine_periode,
            "secondes_restantes": secondes_restantes,
            "cumul": min(cumul, stock_reference),
        }

    def etat(self) -> dict[str, object]:
        return {
            "version": self.version,
            "solde": self.solde,
            "points_par_niveau": {
                niveau: [
                    {"points": gain.points, "gagne_le": gain.gagne_le.isoformat()}
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
            "cartes_debut_inactivite": self.cartes_debut_inactivite,
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
    if modele_recompenses is None:
        raise RuntimeError("Le portefeuille doit avoir un modele_recompenses configuré")
    fonction_cartes = modele_recompenses.f_prime
    fonction_gems = modele_recompenses.g_prime
    cartes_theoriques = sum(
        points * fonction_cartes(niveau) for niveau, points in distribution.items()
    )
    gems_theoriques = sum(
        points * fonction_gems(niveau) for niveau, points in distribution.items()
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
    cartes_tirees = tuple(generateur.sample(cartes_inconnues, k=nombre_cartes))

    if possessions_avant_tirage:
        gems_tires = tuple(
            generateur.choice(possessions_avant_tirage) for _ in range(nombre_gems)
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
