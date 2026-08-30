# Spécification de l’état du portefeuille et des statistiques joueur

Document destiné à l’ingénieur responsable des mutations et des statistiques
de l’état économique d’un joueur.

## 1. Objectif et périmètre

Le périmètre comprend les points, les tickets bronze/silver/gold, les cartes,
les gems, les pertes d’inactivité et les variations depuis la dernière
connexion.

La simulation d’une trajectoire, la présence, l’apprentissage et
l’enchaînement temporel des examens sont exclus. Un examen n’intervient ici que
lorsque son résultat produit une mutation du portefeuille.

## 2. Architecture recommandée

L’implémentation doit associer deux sources complémentaires :

```text
Portefeuille courant + journal d’événements immuable
```

- `Portefeuille` répond à « combien le joueur possède-t-il maintenant ? ».
- Le journal répond à « que s’est-il passé depuis telle date ou connexion ? ».

Le seul état courant ne permet pas de reconstruire les cartes perdues depuis la
dernière connexion, les tickets déjà consommés ou les points gagnés grâce à un
examen précis.

## 3. État courant

| Champ | Type | Signification |
|---|---|---|
| `points_par_niveau` | `dict[int, list[GainPoints]]` | Lots de points disponibles par niveau d’origine |
| `tickets` | `dict[str, Ticket]` | Tickets achetés mais non consommés |
| `possessions` | `list[int]` | Index uniques des cartes actuelles |
| `gems` | `int` | Compteur actuel de gems |
| `dernier_gain_points` | `datetime | None` | Dernier gain reconnu comme activité |
| `jours_inactivite_traites` | `int` | Périodes d’inactivité déjà appliquées |
| `cartes_debut_inactivite` | `int | None` | Stock figé au début de l’inactivité |
| `etat_arrondi` | `EtatArrondi` | Erreurs reportées entre les tirages |
| `version` | `int` | Version transactionnelle du portefeuille |

Le niveau courant est porté par `Simulation.lecon_courante`. Il peut être joint
au portefeuille dans un modèle de lecture, mais il ne doit pas être confondu
avec le niveau d’origine des points.

## 4. Statistiques instantanées

```python
nombre_cartes = len(portefeuille.possessions)
cartes = list(portefeuille.possessions)
nombre_gems = portefeuille.gems
solde_points = portefeuille.solde

tickets = {
    "bronze": portefeuille.bronze,
    "silver": portefeuille.silver,
    "gold": portefeuille.gold,
}
```

Ces compteurs de tickets représentent uniquement les tickets disponibles. Ils
ne comptent pas les achats historiques ou les tickets déjà consommés.

`portefeuille.etat()` renvoie une copie sérialisable de l’état courant et ne
doit provoquer aucune mutation.

## 5. Points gagnés après un examen réussi

La commande métier doit recevoir au minimum :

```text
niveau global
identifiant et nom de l’examen
type d’examen
nombre de points gagnés
timestamp avec fuseau horaire
identifiant d’idempotence
```

La mutation existante est :

```python
portefeuille.ajouter_points(
    niveau=niveau_examen,
    points=points_gagnes,
    timestamp=timestamp,
)
```

Effets : création d’un lot dans `points_par_niveau`, augmentation du solde,
mise à jour de l’activité, réinitialisation de l’inactivité et incrément de
`version`.

Un examen échoué ne modifie pas le portefeuille. Un bonus réussi crée un gain
distinct associé au même niveau global que l’examen principal.

`GainPoints` ne contient actuellement que les points et leur timestamp. Pour
afficher les points gagnés grâce à un examen précis, enregistrer également :

```python
{
    "type": "POINTS_GAGNES_EXAMEN",
    "exam_id": exam_id,
    "exam_name": exam_name,
    "exam_type": exam_type,
    "niveau": niveau_examen,
    "points": points_gagnes,
    "timestamp": timestamp,
}
```

## 6. Dépense des points

```python
distribution = portefeuille.montant_distribution(montant)
```

Cette méthode prépare une dépense sans modifier l’état. Elle utilise les
niveaux les plus petits en premier, par exemple :

```python
{1: 10.0, 2: 10.0, 3: 5.0}
```

La priorité est le niveau d’origine et non le timestamp. Dans un même niveau,
les lots sont débités dans leur ordre d’insertion.

`portefeuille.soustraire_points(montant)` applique la distribution et
incrémente la version. Un solde insuffisant lève `SoldeInsuffisantError` sans
mutation partielle.

## 7. Achat des tickets bronze, silver et gold

```python
TARIFS_TICKETS = {
    "bronze": 25,
    "silver": 50,
    "gold": 100,
}
```

L’interface peut afficher « argent » et « or », mais les identifiants techniques
sont `silver` et `gold`.

```python
ticket = portefeuille.buy_ticket(
    nom="bronze",
    timestamp=timestamp,
)
```

La même méthode accepte `silver` et `gold`. Elle réalise atomiquement :

1. validation du type et du solde ;
2. sélection et retrait des points par niveaux croissants ;
3. création d’un ticket individuel ;
4. conservation de la distribution exacte des points ;
5. ajout dans `portefeuille.tickets` ;
6. incrément de `version`.

Deux tickets du même métal peuvent avoir une valeur économique différente si
leurs points proviennent de niveaux différents.

Événement recommandé :

```python
{
    "type": "TICKET_ACHETE",
    "ticket_id": ticket.identifiant,
    "ticket_type": ticket.nom,
    "montant_points": ticket.montant_total,
    "distribution_points": ticket.distribution(),
    "timestamp": ticket.achete_le,
}
```

## 8. Sélection d’un ticket à consommer

```python
ticket_id = portefeuille.identifiant_ticket_le_plus_ancien("bronze")
```

La méthode accepte `bronze`, `silver`, `gold` et l’alias `golden`. Elle renvoie
`None` si aucun ticket n’est disponible et ne modifie pas l’état. Elle permet
d’implémenter une politique FIFO séparée pour chaque métal.

## 9. Niveau utilisé lors de la consommation

Le modèle actuel n’utilise pas seulement le niveau courant du joueur. Il
utilise la distribution des niveaux d’origine stockée dans le ticket :

```python
ticket.distribution()  # {niveau: points_utilises}
```

Les quantités attendues de cartes et gems sont la somme des points multipliés
par `f_prime(niveau)` et `g_prime(niveau)` pour chaque niveau du ticket.

Le niveau courant peut être affiché, mais il ne doit pas remplacer les niveaux
du ticket. Utiliser uniquement le niveau courant modifierait le modèle et
rendrait équivalents tous les tickets d’un même métal.

## 10. Calcul et consommation d’un ticket

Le calcul est sans mutation :

```python
resultat = Tirage(
    portefeuille=portefeuille,
    ticket=ticket,
    variance=variance_lognormale,
    rng=rng,
)
```

Il produit des index de nouvelles cartes, des index représentant les gems, un
nouvel état d’arrondi et la version utilisée pour le calcul.

- Les nouvelles cartes sont tirées sans remise parmi les cartes inconnues.
- Les gems sont tirés avec remise parmi les cartes déjà possédées.
- Sans possession, aucun gem n’est produit.
- Si la demande dépasse le pool inconnu, toutes les cartes inconnues sont
  renvoyées.

La mutation atomique est :

```python
portefeuille.update_wallet(resultat)
```

Elle vérifie la version, le ticket et les index, puis ajoute les cartes,
incrémente les gems, met à jour l’arrondi, supprime le ticket et incrémente la
version. Un résultat obsolète lève `ResultatObsoleteError` sans mutation.

Événement recommandé, à construire avant la suppression du ticket :

```python
{
    "type": "TICKET_CONSOMME",
    "ticket_id": ticket.identifiant,
    "ticket_type": ticket.nom,
    "distribution_points": ticket.distribution(),
    "cartes_obtenues": list(resultat.cartes),
    "gems_obtenues": resultat.nombre_gems,
    "index_gems": list(resultat.gems),
    "timestamp": timestamp,
}
```

## 11. Arrondis cumulatifs

`EtatArrondi` conserve l’erreur d’arrondi du nombre total de biens et celle de
la partie cartes. Ces erreurs corrigent les tirages suivants.

L’état d’arrondi ne doit être modifié qu’au moment de
`update_wallet(resultat)`, jamais lors du simple calcul de `Tirage`.

Invariants :

```text
nombre_cartes >= 0
nombre_gems >= 0
nombre_cartes + nombre_gems = total entier
```

## 12. Perte de cartes pour inactivité

Seul un gain de points réinitialise l’activité. Un achat, un tirage ou un gain
de carte/gem ne modifie pas `dernier_gain_points`.

Lectures sans mutation :

```python
secondes = portefeuille.last_activity(now=timestamp)
message = portefeuille.notifications(now=timestamp)
```

Application de la perte :

```python
cartes_supprimees = portefeuille.update_status(now=timestamp)
```

`update_status` calcule la perte cumulative supplémentaire, supprime
aléatoirement les cartes concernées, actualise l’inactivité et incrémente la
version lorsque l’état évolue. La pénalité ne supprime ni gems, ni points, ni
tickets.

## 13. Cartes perdues depuis la dernière connexion

Le portefeuille ne conserve pas l’historique des cartes perdues.
`update_status` renvoie leurs index uniquement lors de l’appel.

Il faut donc enregistrer :

```python
{
    "type": "CARTES_PERDUES_INACTIVITE",
    "cartes_perdues": list(cartes_supprimees),
    "nombre_cartes_perdues": len(cartes_supprimees),
    "timestamp": timestamp,
}
```

La date de dernière connexion doit aussi être persistée dans le profil joueur.

Ordre recommandé lors d’une connexion :

1. lire la date de connexion précédente ;
2. appeler `update_status(now)` ;
3. journaliser les pertes ;
4. calculer le résumé depuis la connexion précédente ;
5. enregistrer la nouvelle connexion ;
6. mettre à jour sa date dans le profil.

## 14. Journal d’événements

Structure générique :

```python
{
    "event_id": "identifiant unique",
    "type": "TYPE_EVENEMENT",
    "timestamp": timestamp,
    "wallet_version_avant": 12,
    "wallet_version_apres": 13,
    "payload": {...},
}
```

Types minimums :

```text
POINTS_GAGNES_EXAMEN
POINTS_DEPENSES
TICKET_ACHETE
TICKET_CONSOMME
CARTES_GAGNEES
GEMS_GAGNES
CARTES_PERDUES_INACTIVITE
CONNEXION
```

Le journal doit être append-only. Une correction produit un événement de
compensation plutôt qu’une modification silencieuse.

## 15. Modèle de lecture pour l’affichage

```python
{
    "actuel": {
        "solde_points": portefeuille.solde,
        "nombre_cartes": len(portefeuille.possessions),
        "cartes": list(portefeuille.possessions),
        "nombre_gems": portefeuille.gems,
        "tickets": {
            "bronze": portefeuille.bronze,
            "silver": portefeuille.silver,
            "gold": portefeuille.gold,
        },
        "niveau_courant": niveau_courant,
    },
    "depuis_derniere_connexion": {
        "points_gagnes": 0.0,
        "points_par_examen": {},
        "cartes_gagnees": [],
        "cartes_perdues": [],
        "gems_gagnes": 0,
        "tickets_achetes": {"bronze": 0, "silver": 0, "gold": 0},
        "tickets_consommes": {"bronze": 0, "silver": 0, "gold": 0},
    },
}
```

La partie `actuel` provient du portefeuille. La partie historique provient du
journal filtré depuis la dernière connexion.

## 16. Fonctions à implémenter

Commandes avec mutation :

```text
enregistrer_examen_reussi(...)
acheter_ticket(type_ticket, ...)
consommer_ticket(ticket_id, ...)
appliquer_inactivite(now, ...)
enregistrer_connexion(now, ...)
```

Lectures strictement sans mutation :

```text
etat_joueur_actuel(...)
statistiques_depuis(timestamp, ...)
resume_depuis_derniere_connexion(...)
historique_points_par_examen(...)
historique_tickets(type_ticket=None, ...)
notifications(...)
```

## 17. Invariants

- le solde et les gems sont positifs ou nuls ;
- les possessions sont uniques et appartiennent au pool ;
- un ticket ne peut être consommé qu’une fois ;
- les compteurs de métaux correspondent aux tickets présents ;
- la distribution des points par niveau est conservée dans chaque ticket ;
- une nouvelle carte n’est pas déjà possédée ;
- un index de gem correspond à une possession existante ;
- une pénalité d’inactivité ne supprime que des cartes ;
- un résultat obsolète n’est jamais appliqué ;
- tous les timestamps contiennent un fuseau horaire ;
- toute commande externe possède un identifiant d’idempotence.

## 18. Tableau des mutations

| Action | État modifié | Historique requis |
|---|---|---|
| Examen réussi | Points, activité, inactivité, version | Examen, niveau, type, points |
| Examen échoué | Aucun | Facultatif |
| Achat de ticket | Points, tickets, version | Métal, prix, distribution |
| Calcul de tirage | Aucun | Aucun avant application |
| Consommation | Cartes, gems, arrondi, tickets, version | Ticket, cartes, gems |
| Perte d’inactivité | Cartes, inactivité, version | Index perdus, nombre |
| Connexion | Profil de connexion | Timestamp |

## 19. Transactions et concurrence

Chaque commande doit être atomique : mutation et événement sont tous deux
enregistrés, ou aucun ne l’est.

Flux recommandé :

1. charger le portefeuille et sa version ;
2. valider la commande ;
3. appliquer la mutation en mémoire ;
4. enregistrer l’état avec contrôle optimiste de version ;
5. enregistrer l’événement dans la même transaction ;
6. renvoyer le modèle de lecture actualisé.

Un identifiant d’idempotence empêche un examen, un achat ou une consommation
d’être appliqué deux fois après une répétition réseau.

## 20. Règle essentielle

`portefeuille.etat()` suffit pour afficher :

```text
cartes actuelles
gems actuelles
solde actuel
tickets actuels
```

Un journal d’événements est indispensable pour afficher :

```text
cartes perdues depuis la dernière connexion
cartes et gems gagnées sur une période
points gagnés grâce à un examen précis
tickets achetés ou consommés sur une période
évolution historique des compteurs
```
