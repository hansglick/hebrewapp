import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getTexte } from "../../api/content";
import { markObjectSeen } from "../../api/user";
import { mediaUrl } from "../../api/media";
import { useSwipe } from "../../hooks/useSwipe";
import { AudioPlayer } from "../../components/AudioPlayer";
import { ActionHints } from "../../components/ActionHints";
import { FlagIsrael, FlagFrance } from "../../components/Flag";
import "../screens.css";

// Un texte peut être un dialogue où chaque réplique commence par
// "Protagoniste: ..." — seule la première réplique d'une prise de parole
// porte le nom, les phrases suivantes du même protagoniste n'en ont pas.
// On ne revient à la ligne que lors d'un changement de protagoniste ; les
// textes narratifs (sans aucune étiquette de ce type) restent un seul bloc.
function groupBySpeaker(sortedPhrases, field) {
  const groups = [];
  let currentSpeaker = null;

  for (const phrase of sortedPhrases) {
    const text = phrase[field];
    const match = text.match(/^([^\s:]+)\s*:\s*(.*)$/s);

    if (match && match[1] !== currentSpeaker) {
      currentSpeaker = match[1];
      groups.push({ speaker: match[1], text: match[2] });
    } else if (groups.length === 0) {
      groups.push({ speaker: null, text: match ? match[2] : text });
    } else {
      groups[groups.length - 1].text += " " + (match ? match[2] : text);
    }
  }

  return groups;
}

export default function TexteScreen() {
  const { chapId, code } = useParams();
  const navigate = useNavigate();
  const [texte, setTexte] = useState(null);
  const [view, setView] = useState("hebrew"); // hebrew | french

  useEffect(() => {
    getTexte(code).then(setTexte);
    setView("hebrew");
    markObjectSeen({ objectType: "texte", objectKey: code });
  }, [code]);

  const swipeHandlers = useSwipe({
    onSwipeLeft: () => navigate(`/apprentissage/${chapId}/${code}`),
  });

  if (!texte) return null;

  const sortedPhrases = [...texte.phrases].sort((a, b) => a.index - b.index);
  const hebrewGroups = groupBySpeaker(sortedPhrases, "hebrew");
  const frenchGroups = groupBySpeaker(sortedPhrases, "french");

  return (
    <section className="screen" onPointerDown={swipeHandlers.onPointerDown}>
      <ActionHints {...swipeHandlers.hints} />
      <img
        className="screen-image texte-image"
        style={{ maxHeight: 384, border: "2.68px solid var(--border)" }}
        src={mediaUrl(texte.imagepath)}
        alt={texte.title}
        draggable={false}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {view === "hebrew" && <AudioPlayer src={mediaUrl(texte.voicepath)} />}
        <div className="radio-group">
          <label>
            <input
              type="radio"
              name="langue"
              checked={view === "hebrew"}
              onChange={() => setView("hebrew")}
            />
            <FlagIsrael />
          </label>
          <label>
            <input
              type="radio"
              name="langue"
              checked={view === "french"}
              onChange={() => setView("french")}
            />
            <FlagFrance />
          </label>
        </div>
      </div>

      <hr style={{ width: "100%", border: "none", borderTop: "1px solid var(--border)", margin: 0 }} />

      {view === "hebrew" && (
        <div style={{ marginTop: "1.5em" }}>
          {hebrewGroups.map((group, i) => (
            <p key={i} className="texte-hebrew">
              {group.speaker && <strong>{group.speaker}: </strong>}
              {group.text}
            </p>
          ))}
        </div>
      )}

      {view === "french" && (
        <div style={{ marginTop: "1.5em" }}>
          {frenchGroups.map((group, i) => (
            <p key={i} className="texte-french">
              {group.speaker && <strong>{group.speaker} : </strong>}
              {group.text}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
