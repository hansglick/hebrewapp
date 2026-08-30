from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database import get_connection
from app import wallet
from app.wallet import GemsInsuffisantsError
from app.wallet_engine import SoldeInsuffisantError, TARIFS_TICKETS

router = APIRouter(prefix="/api/wallet", tags=["wallet"])


@router.get("")
def get_wallet():
    conn = get_connection()
    try:
        wallet.tick_inactivite_et_notifications(conn)
        return wallet.etat_lecture(conn)
    finally:
        conn.close()


class LotRequest(BaseModel):
    nom: str


@router.post("/lots/open")
def open_lot(payload: LotRequest):
    if payload.nom not in TARIFS_TICKETS:
        raise HTTPException(400, f"Type de lot inconnu : {payload.nom!r}")
    conn = get_connection()
    try:
        try:
            return wallet.ouvrir_lot(conn, payload.nom)
        except SoldeInsuffisantError as e:
            raise HTTPException(400, str(e))
    finally:
        conn.close()


@router.post("/cartes/{index}/view")
def view_carte(index: int):
    conn = get_connection()
    try:
        try:
            return wallet.voir_fiche_carte(conn, index)
        except GemsInsuffisantsError as e:
            raise HTTPException(400, str(e))
        except ValueError as e:
            raise HTTPException(404, str(e))
    finally:
        conn.close()
