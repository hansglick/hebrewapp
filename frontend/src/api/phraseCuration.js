import { apiFetch, apiFetchJson } from "./http";

export const getPhraseCurationSets = () => apiFetch("/api/phrase-curation/sets");

export const togglePhraseSelection = (setIndex, id, selected) =>
  apiFetchJson("/api/phrase-curation/toggle", { set: setIndex, id, selected });
