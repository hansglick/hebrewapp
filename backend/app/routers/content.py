import random

from fastapi import APIRouter, HTTPException

from app.data_loader import get_dataset

router = APIRouter(prefix="/api", tags=["content"])


# --- Binyan : dict, ordre naturel (pas de tirage aléatoire, swipe = suivant dans l'ordre) ---
@router.get("/binyans")
def list_binyans():
    return get_dataset("binyan")


@router.get("/binyans/{nom}")
def get_binyan(nom: str):
    data = get_dataset("binyan")
    if nom not in data:
        raise HTTPException(404, "Binyan introuvable")
    return data[nom]


# --- Racine : dict, tirage aléatoire ---
@router.get("/racines/random")
def random_racine():
    data = get_dataset("racine")
    key = random.choice(list(data.keys()))
    return data[key]


@router.get("/racines/{shoresh}")
def get_racine(shoresh: str):
    data = get_dataset("racine")
    if shoresh not in data:
        raise HTTPException(404, "Racine introuvable")
    return data[shoresh]


# --- Expression : liste, tirage aléatoire ---
@router.get("/expressions/random")
def random_expression():
    data = get_dataset("expression")
    return random.choice(data)


@router.get("/expressions/{index}")
def get_expression(index: int):
    data = get_dataset("expression")
    match = next((item for item in data if item["index"] == index), None)
    if match is None:
        raise HTTPException(404, "Expression introuvable")
    return match


# --- Presse : liste, tirage aléatoire ---
@router.get("/presse/random")
def random_presse():
    data = get_dataset("presse")
    return random.choice(data)


@router.get("/presse/{index}")
def get_presse(index: int):
    data = get_dataset("presse")
    match = next((item for item in data if item["index"] == index), None)
    if match is None:
        raise HTTPException(404, "Une de presse introuvable")
    return match


# --- Chanson : liste sans champ index -> position dans la liste ---
@router.get("/chansons")
def list_chansons():
    return get_dataset("chanson")


@router.get("/chansons/random")
def random_chanson():
    data = get_dataset("chanson")
    return random.choice(data)


@router.get("/chansons/{position}")
def get_chanson(position: int):
    data = get_dataset("chanson")
    if position < 0 or position >= len(data):
        raise HTTPException(404, "Chanson introuvable")
    return data[position]
