"""Couche DB + règles produit du wallet (points, tickets, cartes, gems).

Le moteur pur (`app.wallet_engine.Portefeuille`) ne connaît rien de SQLite :
ce module recharge/persiste son état dans les tables `wallet_*`
(`app.database`) à chaque commande, et ajoute les règles propres à
l'intégration (mapping niveau <-> leçon réelle, division par deux à la
repasse, notifications d'inactivité) qui n'existent dans aucun des fichiers
fournis par le user."""

import json
from datetime import datetime, timedelta, timezone

from app.database import DEFAULT_USER_ID
from app.lesson_order import all_lesson_codes_in_order, exam_type_for, reference_lesson
from app.notifications import create_notification
from app import celeb
from app import wallet_engine as engine


class GemsInsuffisantsError(ValueError):
    """Le user n'a aucun gem disponible pour afficher une fiche de carte."""

NOMBRE_CARTES_COLLECTION = 230
# Carte #78 (Hanoch Levin) : entrée présente dans data/item_celeb.json mais
# jamais livrée en image (le fichier source manque dans
# results/images_celeb/, contrairement aux 229 autres) — exclue du tirage
# pour ne plus jamais pouvoir être gagnée.
CARTES_EXCLUES = frozenset({78})
F1 = 3.5
VARIANCE_LOGNORMALE = 0.4
BASE_POINTS = {"rapide": 10, "long": 25, "tres_long": 50}
HARD_EXAM_BONUS_POINTS = 25
WARNING_SECONDS_BEFORE = 8 * 3600


def _modele_recompenses(codes: list) -> engine.ModeleRecompenses:
    points_max = sum(BASE_POINTS[exam_type_for(c)] for c in codes)
    return engine.ModeleRecompenses(
        f1=F1,
        nombre_cartes=NOMBRE_CARTES_COLLECTION,
        nombre_lecons=len(codes),
        points_max_programme=points_max,
    )


def _parse_dt(value) -> datetime | None:
    if value is None:
        return None
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _load_portefeuille(conn) -> engine.Portefeuille:
    points_par_niveau: dict[int, list[engine.GainPoints]] = {}
    for row in conn.execute(
        "SELECT niveau, points, gagne_le FROM wallet_points WHERE user_id = ? ORDER BY niveau, id",
        (DEFAULT_USER_ID,),
    ):
        points_par_niveau.setdefault(row["niveau"], []).append(
            engine.GainPoints(points=row["points"], gagne_le=_parse_dt(row["gagne_le"]))
        )

    tickets: dict[str, engine.Ticket] = {}
    for row in conn.execute(
        "SELECT id, nom, distribution_points_json, montant_total, achete_le FROM wallet_tickets WHERE user_id = ?",
        (DEFAULT_USER_ID,),
    ):
        distribution = {int(k): v for k, v in json.loads(row["distribution_points_json"]).items()}
        tickets[row["id"]] = engine.Ticket(
            identifiant=row["id"],
            nom=row["nom"],
            distribution_points=tuple(sorted(distribution.items())),
            montant_total=row["montant_total"],
            achete_le=_parse_dt(row["achete_le"]),
        )

    possessions = [
        row["card_index"]
        for row in conn.execute(
            "SELECT card_index FROM wallet_cards WHERE user_id = ? ORDER BY card_index",
            (DEFAULT_USER_ID,),
        )
    ]

    state = conn.execute("SELECT * FROM wallet_state WHERE user_id = ?", (DEFAULT_USER_ID,)).fetchone()
    codes = all_lesson_codes_in_order()

    return engine.Portefeuille(
        points_par_niveau=points_par_niveau,
        tickets=tickets,
        possessions=possessions,
        gems=state["gems"] if state else 0,
        dernier_gain_points=_parse_dt(state["dernier_gain_points"]) if state else None,
        jours_inactivite_traites=state["jours_inactivite_traites"] if state else 0,
        cartes_debut_inactivite=state["cartes_debut_inactivite"] if state else None,
        etat_arrondi=engine.EtatArrondi(
            erreur_total=state["erreur_total"] if state else 0.0,
            erreur_a=state["erreur_a"] if state else 0.0,
        ),
        version=state["version"] if state else 0,
        perte_inactivite=engine.fonction_perte,
        duree_periode_inactivite=engine.SECONDS_PER_DAY,
        nombre_lecons_programme=max(1, len(codes)),
        nombre_cartes_collection=NOMBRE_CARTES_COLLECTION,
        cartes_exclues=CARTES_EXCLUES,
        modele_recompenses=_modele_recompenses(codes) if codes else None,
    )


def _persist(conn, portefeuille: engine.Portefeuille, event_type: str, payload: dict, last_period_warned: int | None = None) -> None:
    """Resync complet des tables wallet_* pour ce user + un événement
    append-only dans wallet_events, en une seule transaction. Volumétrie
    mono-user négligeable : pas besoin de diff incrémental, sauf pour
    wallet_cards où on préserve `acquired_at` des cartes déjà possédées."""
    conn.execute("DELETE FROM wallet_points WHERE user_id = ?", (DEFAULT_USER_ID,))
    for niveau, gains in portefeuille.points_par_niveau.items():
        for gain in gains:
            conn.execute(
                "INSERT INTO wallet_points (user_id, niveau, points, gagne_le) VALUES (?, ?, ?, ?)",
                (DEFAULT_USER_ID, niveau, gain.points, gain.gagne_le.isoformat()),
            )

    conn.execute("DELETE FROM wallet_tickets WHERE user_id = ?", (DEFAULT_USER_ID,))
    for ticket in portefeuille.tickets.values():
        conn.execute(
            """
            INSERT INTO wallet_tickets (id, user_id, nom, distribution_points_json, montant_total, achete_le)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                ticket.identifiant,
                DEFAULT_USER_ID,
                ticket.nom,
                json.dumps(ticket.distribution()),
                ticket.montant_total,
                ticket.achete_le.isoformat(),
            ),
        )

    existing_cards = {
        row["card_index"]
        for row in conn.execute("SELECT card_index FROM wallet_cards WHERE user_id = ?", (DEFAULT_USER_ID,))
    }
    current_cards = set(portefeuille.possessions)
    for index in existing_cards - current_cards:
        conn.execute(
            "DELETE FROM wallet_cards WHERE user_id = ? AND card_index = ?", (DEFAULT_USER_ID, index)
        )
    for index in current_cards - existing_cards:
        conn.execute(
            "INSERT INTO wallet_cards (user_id, card_index) VALUES (?, ?)", (DEFAULT_USER_ID, index)
        )

    fields = [
        "gems = ?",
        "dernier_gain_points = ?",
        "jours_inactivite_traites = ?",
        "cartes_debut_inactivite = ?",
        "erreur_total = ?",
        "erreur_a = ?",
        "version = ?",
    ]
    values = [
        portefeuille.gems,
        portefeuille.dernier_gain_points.isoformat() if portefeuille.dernier_gain_points else None,
        portefeuille.jours_inactivite_traites,
        portefeuille.cartes_debut_inactivite,
        portefeuille.etat_arrondi.erreur_total,
        portefeuille.etat_arrondi.erreur_a,
        portefeuille.version,
    ]
    if last_period_warned is not None:
        fields.append("last_period_warned = ?")
        values.append(last_period_warned)
    values.append(DEFAULT_USER_ID)
    conn.execute(f"UPDATE wallet_state SET {', '.join(fields)} WHERE user_id = ?", values)

    conn.execute(
        "INSERT INTO wallet_events (user_id, type, payload_json) VALUES (?, ?, ?)",
        (DEFAULT_USER_ID, event_type, json.dumps(payload)),
    )
    conn.commit()


def _repeat_index(conn, code: str) -> int:
    return conn.execute(
        "SELECT COUNT(*) AS n FROM wallet_lesson_points_awarded WHERE user_id = ? AND lesson_code = ?",
        (DEFAULT_USER_ID, code),
    ).fetchone()["n"]


def enregistrer_examen_reussi(conn, code: str) -> None:
    """Crédite les points d'une leçon (rapide/long/très long) au wallet.
    Appelée uniquement quand écrit ET oral sont (à nouveau) tous deux
    validés pour `code` (cf. exam_session._finalize) : première fois =
    vraie montée de niveau, fois suivantes = repasse volontaire via
    "Demander une équivalence...". Chaque repasse divise les points par
    deux par rapport à la base (pas de règle de ce type dans les fichiers
    fournis — c'est une règle propre à cette intégration, demandée par le
    user)."""
    codes = all_lesson_codes_in_order()
    if code not in codes:
        return
    base = BASE_POINTS[exam_type_for(code)]
    repeat_index = _repeat_index(conn, code)
    points = base / (2**repeat_index)
    niveau = codes.index(code) + 1

    portefeuille = _load_portefeuille(conn)
    portefeuille.ajouter_points(niveau, points)
    conn.execute(
        "INSERT INTO wallet_lesson_points_awarded (user_id, lesson_code, points) VALUES (?, ?, ?)",
        (DEFAULT_USER_ID, code, points),
    )
    _persist(
        conn,
        portefeuille,
        "POINTS_GAGNES_EXAMEN",
        {"lesson_code": code, "niveau": niveau, "points": points, "repeat_index": repeat_index},
    )


def enregistrer_hard_exam_reussi(conn) -> None:
    """Crédite les 25 points bonus (constante `bonus` du fichier de
    simulation) à chaque réussite du Hard Exam. Pas de division par deux :
    le Hard Exam ne peut de toute façon être retenté qu'après une nouvelle
    vraie montée de niveau (cf. app.hard_exam.is_unlocked), donc jamais
    spammable."""
    codes = all_lesson_codes_in_order()
    if not codes:
        return
    current_level_row = conn.execute(
        "SELECT level FROM user_level WHERE user_id = ?", (DEFAULT_USER_ID,)
    ).fetchone()
    current_level = current_level_row["level"] if current_level_row else None
    ref = reference_lesson(current_level) if current_level is not None else None
    niveau = codes.index(ref) + 1 if ref in codes else len(codes)

    portefeuille = _load_portefeuille(conn)
    portefeuille.ajouter_points(niveau, HARD_EXAM_BONUS_POINTS)
    _persist(
        conn,
        portefeuille,
        "POINTS_GAGNES_HARD_EXAM",
        {"niveau": niveau, "points": HARD_EXAM_BONUS_POINTS},
    )


def points_a_gagner(conn, code: str, exam_type: str) -> float:
    """Preview sans mutation : combien de points cet examen rapportera s'il
    est réussi maintenant. 0 si l'autre format n'est pas encore validé (les
    points ne sont crédités qu'une fois les deux formats réussis, cf.
    `enregistrer_examen_reussi`)."""
    codes = all_lesson_codes_in_order()
    if code not in codes:
        return 0.0
    passed_types = {
        row["exam_type"]
        for row in conn.execute(
            "SELECT exam_type FROM exam_progress WHERE user_id = ? AND lesson_code = ?",
            (DEFAULT_USER_ID, code),
        )
    }
    passed_types_after = passed_types | {exam_type}
    if not {"ecrit", "oral"} <= passed_types_after:
        return 0.0
    base = BASE_POINTS[exam_type_for(code)]
    return base / (2 ** _repeat_index(conn, code))


def recompense_info(conn, code: str) -> dict:
    """Récapitulatif de la récompense d'une leçon pour la fiche d'examen :
    récompense initiale (barème rapide/long/très long), nombre de réussites
    déjà créditées (repeat_index, cf. `enregistrer_examen_reussi`) et
    récompense actuelle qui en découle (divisée par deux à chaque
    réussite). Contrairement à `points_a_gagner`, ne dépend pas de savoir
    quel format (écrit/oral) manque encore — c'est une propriété de la
    leçon, pas d'un format particulier."""
    codes = all_lesson_codes_in_order()
    if code not in codes:
        return {"recompense_initiale": 0, "deja_reussi": False, "nombre_reussites": 0, "recompense_actuelle": 0}
    base = BASE_POINTS[exam_type_for(code)]
    repeat_index = _repeat_index(conn, code)
    return {
        "recompense_initiale": base,
        "deja_reussi": repeat_index > 0,
        "nombre_reussites": repeat_index,
        "recompense_actuelle": base / (2**repeat_index),
    }


def ouvrir_lot(conn, nom: str) -> dict:
    """Achète et ouvre un lot en un seul geste : plus de ticket stocké
    entre-temps — `buy_ticket` + `Tirage` + `update_wallet` s'enchaînent sur
    le même portefeuille en mémoire, et seul le résultat final (points
    débités, cartes/gems crédités) est persisté. Lève
    `engine.SoldeInsuffisantError` si le solde est insuffisant, ou
    `ValueError` si `nom` n'est pas un métal connu."""
    portefeuille = _load_portefeuille(conn)
    ticket = portefeuille.buy_ticket(nom)
    resultat = engine.Tirage(portefeuille, ticket, VARIANCE_LOGNORMALE)
    portefeuille.update_wallet(resultat)
    _persist(
        conn,
        portefeuille,
        "LOT_OUVERT",
        {
            "nom": nom,
            "montant_total": ticket.montant_total,
            "cartes_obtenues": list(resultat.cartes),
            "gems_obtenues": resultat.nombre_gems,
        },
    )

    if resultat.cartes or resultat.nombre_gems:
        morceaux = []
        if resultat.cartes:
            morceaux.append(f"{len(resultat.cartes)} carte(s)")
        if resultat.nombre_gems:
            morceaux.append(f"{resultat.nombre_gems} gem(s)")
        create_notification(
            conn,
            f"Lot {nom} ouvert : vous avez gagné {' et '.join(morceaux)} ! "
            "Découvrez-les dans votre collection.",
            link="/jeu/cartes",
        )

    return {
        "cartes_obtenues": list(resultat.cartes),
        "cartes_images": {i: celeb.image_relative_path(i) for i in resultat.cartes},
        "gems_obtenues": resultat.nombre_gems,
        "wallet": etat_lecture(conn),
    }


def etat_lecture(conn) -> dict:
    portefeuille = _load_portefeuille(conn)
    # Ordre de récence (la plus récemment acquise en premier) pour le
    # carrousel "Cabinet des Cartes" — distinct de `possessions` (ordre par
    # index, utilisé en interne par le moteur pour le tirage aléatoire).
    cartes = [
        row["card_index"]
        for row in conn.execute(
            "SELECT card_index FROM wallet_cards WHERE user_id = ? ORDER BY acquired_at DESC, card_index DESC",
            (DEFAULT_USER_ID,),
        )
    ]
    return {
        "points": portefeuille.solde,
        "gems": portefeuille.gems,
        "nombre_cartes": len(cartes),
        "cartes": cartes,
        # Résolu uniquement pour les cartes possédées : pas question de
        # dévoiler gratuitement l'image d'une carte pas encore obtenue.
        "cartes_images": {i: celeb.image_relative_path(i) for i in cartes},
        "nombre_cartes_collection": NOMBRE_CARTES_COLLECTION,
    }


def voir_fiche_carte(conn, index: int) -> dict:
    """Révèle la fiche (nom hébreu/latin + bio) d'une carte déjà possédée.
    La toute première consultation coûte 1 gem ; une fois débloquée, la
    fiche reste consultable gratuitement pour toujours (`fiche_unlocked`
    sur wallet_cards). Lève `ValueError` si la carte n'est pas possédée,
    `GemsInsuffisantsError` si elle n'est pas encore débloquée et qu'aucun
    gem n'est disponible — dans les deux cas, aucune mutation n'a lieu."""
    portefeuille = _load_portefeuille(conn)
    if index not in portefeuille.possessions:
        raise ValueError("Cette carte n'est pas dans votre collection")

    row = conn.execute(
        "SELECT fiche_unlocked FROM wallet_cards WHERE user_id = ? AND card_index = ?",
        (DEFAULT_USER_ID, index),
    ).fetchone()
    already_unlocked = bool(row["fiche_unlocked"]) if row else False

    info = celeb.get_info(index)
    gems = portefeuille.gems

    if not already_unlocked:
        if portefeuille.gems <= 0:
            raise GemsInsuffisantsError(
                "Il vous faut au moins 1 gem pour afficher la fiche de cette carte"
            )
        portefeuille.gems -= 1
        portefeuille.version += 1
        _persist(conn, portefeuille, "GEM_CONSOMME_FICHE", {"card_index": index})
        conn.execute(
            "UPDATE wallet_cards SET fiche_unlocked = 1 WHERE user_id = ? AND card_index = ?",
            (DEFAULT_USER_ID, index),
        )
        conn.commit()
        gems = portefeuille.gems

    return {
        "index": index,
        "name_hebreu": info["name_hebreu"] if info else None,
        "name_latin": info["name_latin"] if info else None,
        "apports": info["apports"] if info else None,
        "image_url": celeb.image_relative_path(index),
        "gems": gems,
        "unlocked_for_free": already_unlocked,
    }


def tick_inactivite_et_notifications(conn, now: datetime | None = None) -> None:
    """Applique la perte de cartes due depuis la dernière visite et
    notifie (retour après une perte réelle, avertissement 8h avant le
    prochain palier). Appelée à chaque lecture du wallet (cf.
    routers/wallet.py) — pas de worker/cron dans cette app, donc le tick se
    fait paresseusement à chaque requête."""
    if now is None:
        now = datetime.now(timezone.utc)

    portefeuille = _load_portefeuille(conn)
    version_avant = portefeuille.version

    supprimees = portefeuille.update_status(now)
    if supprimees:
        cartes_txt = ", ".join(f"#{i}" for i in sorted(supprimees))
        create_notification(
            conn,
            f"Vous avez perdu {len(supprimees)} carte(s) pendant votre absence : {cartes_txt}.",
        )

    state = conn.execute(
        "SELECT last_period_warned FROM wallet_state WHERE user_id = ?", (DEFAULT_USER_ID,)
    ).fetchone()
    last_warned = state["last_period_warned"] if state else 0

    palier = portefeuille.prochain_palier(now)
    new_last_warned = last_warned
    if (
        palier is not None
        and palier["secondes_restantes"] <= WARNING_SECONDS_BEFORE
        and palier["periode"] > last_warned
    ):
        restantes = timedelta(seconds=palier["secondes_restantes"])
        heures = int(restantes.total_seconds() // 3600)
        minutes = int((restantes.total_seconds() % 3600) // 60)
        create_notification(
            conn,
            f"Il vous reste {heures}h{minutes:02d} avant d'avoir perdu {palier['cumul']} carte(s) "
            "au total depuis le début de votre inactivité — reconnectez-vous pour repartir à zéro !",
        )
        new_last_warned = palier["periode"]

    if portefeuille.version != version_avant or new_last_warned != last_warned:
        _persist(
            conn,
            portefeuille,
            "INACTIVITE_TICK",
            {"cartes_perdues": list(supprimees)},
            last_period_warned=new_last_warned,
        )
