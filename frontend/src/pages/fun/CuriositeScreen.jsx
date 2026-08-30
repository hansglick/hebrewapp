import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { getRandomCuriosite } from "../../api/content";
import { mediaUrl } from "../../api/media";
import { useSwipe } from "../../hooks/useSwipe";
import { useRandomBrowser } from "../../hooks/useRandomBrowser";
import { ActionHints } from "../../components/ActionHints";
import { SpeakerIcon } from "../../components/SpeakerIcon";
import { speak } from "../../utils/speech";
import { CURIOSITE_CONFIG } from "./curiositeConfig";
import "../screens.css";

// Écran générique de parcours des contenus "curiosités" (proverbe, tanakh,
// récit, landmark, blague) — un item à la fois, swipe/tap comme
// ExpressionScreen. `lessonCode` restreint le tirage aux nouveautés de cette
// leçon (tuile "Curiosité") ; sans lui, tirage dans tout ce qui est
// débloqué à la progression courante du user (écrans "Fun").
export default function CuriositeScreen({ type, lessonCode }) {
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);
  const config = CURIOSITE_CONFIG[type];

  const { current: item, next, back } = useRandomBrowser(
    (prevItem) => getRandomCuriosite(type, { lessonCode, current: prevItem?.index }),
    [type, lessonCode]
  );

  useEffect(() => {
    setShowDetails(false);
  }, [item]);

  const swipeHandlers = useSwipe({
    onSwipeLeft: () => {
      if (!back()) navigate(-1);
    },
    onSwipeRight: () => next(),
    onSpace: !showDetails ? () => setShowDetails(true) : undefined,
  });

  if (!item) return null;

  const heroFontVar =
    config.heroFont === "biblical" ? "var(--font-hebrew-biblical)" : "var(--font-hebrew)";
  const heroStyle = {
    fontFamily: heroFontVar,
    fontSize: config.heroFontScale
      ? `calc(var(--font-size-hebrew-large) * ${config.heroFontScale})`
      : "var(--font-size-hebrew-large)",
    direction: "rtl",
    cursor: "pointer",
  };
  const speakButton = (
    <button
      type="button"
      className="speak-btn"
      onClick={() => speak(config.speakText ? config.speakText(item) : item[config.heroField])}
    >
      <SpeakerIcon color="var(--text)" />
    </button>
  );

  return (
    <section className="screen" onPointerDown={swipeHandlers.onPointerDown}>
      <ActionHints {...swipeHandlers.hints} />

      {config.speakable &&
        !config.referenceValue &&
        !config.speakerWithHero &&
        !config.speakerBelowImage &&
        !config.speakerTopRight && (
        <div style={{ width: "100%", maxWidth: 320, display: "flex", justifyContent: "flex-end" }}>
          {speakButton}
        </div>
      )}

      <div
        className={`card card-illustration${config.hasImage ? ` curiosite-split curiosite-split-${type}` : ""}`}
        style={{ textAlign: "center" }}
      >
        <div className="curiosite-media">
          {config.hasImage && (
            <>
              <img
                className="screen-image"
                style={{ width: "100%", maxWidth: 420, maxHeight: "none", marginBottom: 12 }}
                src={mediaUrl(item.image_url)}
                alt=""
                draggable={false}
              />
              {config.speakerBelowImage && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                  {speakButton}
                </div>
              )}
              <hr className="curiosite-media-hr" style={{ border: "none", borderTop: "1px solid var(--border)", margin: "0 0 12px" }} />
            </>
          )}
        </div>

        <div className="curiosite-content">
          {config.referenceValue && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.5em",
              }}
            >
              <div
                style={{
                  textAlign: "left",
                  fontSize: "0.8em",
                  fontStyle: "italic",
                  color: "var(--textMuted)",
                }}
              >
                {config.referenceValue(item)}
              </div>
              {config.speakable && speakButton}
            </div>
          )}

          {config.speakerTopRight && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: -12 }}>{speakButton}</div>
          )}

          {config.speakerWithHero ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
              <div />
              <div className="hebrew" style={{ ...heroStyle, justifySelf: "center" }} onClick={() => setShowDetails((s) => !s)}>
                {item[config.heroField]}
              </div>
              <div style={{ justifySelf: "end" }}>{speakButton}</div>
            </div>
          ) : (
            <div className="hebrew" style={heroStyle} onClick={() => setShowDetails((s) => !s)}>
              {item[config.heroField]}
            </div>
          )}

          <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0 0" }} />

          {showDetails && (
            <ul
              style={{
                margin: "1.2em 0 0",
                paddingInlineStart: "1.2em",
                textAlign: "left",
                fontSize: "0.8em",
                color: "var(--textMuted)",
              }}
            >
              {config.bullets.map((bullet) => (
                <li key={bullet.label} style={{ marginBottom: "1em" }}>
                  <div
                    style={{
                      fontStyle: bullet.emphasis ? "normal" : "italic",
                      fontWeight: bullet.emphasis ? "bold" : undefined,
                      fontSize: "0.85em",
                      color: "var(--text)",
                    }}
                  >
                    {bullet.label} :
                  </div>
                  <div>{bullet.value ? bullet.value(item) : item[bullet.field]}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
