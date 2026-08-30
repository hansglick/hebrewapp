import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getExamenHardCopie } from "../../api/content";
import { AudioPlayer } from "../../components/AudioPlayer";
import { QuizzBubbles } from "../../components/QuizzBubbles";
import { mediaUrl } from "../../api/media";
import "../screens.css";

// Les observations sont affichées en italique, mais un mot en hébreu au
// milieu d'une phrase française perd en lisibilité en italique — on l'en
// exempte pour qu'il ressorte mieux (cf. ExamenCopieDetailScreen, même logique).
function renderWithHebrewHighlight(text) {
  return text
    .split(/([֐-׿]+(?:[\s'"־][֐-׿]+)*)/g)
    .map((part, i) =>
      /[֐-׿]/.test(part) ? (
        <span key={i} className="hebrew" style={{ fontStyle: "normal" }}>
          {part}
        </span>
      ) : (
        part
      )
    );
}

function computeGlobalNote(answer) {
  const ratings = [answer.rating_completeness, answer.rating_hebrew, answer.rating_comprehension];
  return ratings.reduce((a, b) => a + b, 0) / ratings.length;
}

function StarRating({ rating }) {
  return (
    <span aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ color: i <= rating ? "#f5b301" : "var(--textMuted)" }}>
          ★
        </span>
      ))}
    </span>
  );
}

export default function ExamenHardCopieDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [copie, setCopie] = useState(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    getExamenHardCopie(id).then(setCopie);
  }, [id]);

  if (!copie) return null;

  const q = copie.questions[index];
  const answer = copie.answers[index];
  const verbeCorrect =
    q.type === "verbe" ? (answer.submitted || "").trim() === (q.conjugaison || "").trim() : false;

  return (
    <section className="screen">
      <h1>Copie Hard Exam #{copie.id}</h1>
      <p className="muted">
        {copie.date.split(" ")[0]} — {copie.passed ? "Réussi" : "Echec"}
      </p>
      <p className="muted">
        Note moyenne : {copie.average_note.toFixed(1)} / 5 — Taux de bonnes réponses :{" "}
        {Math.round(copie.success_ratio * 100)}%
      </p>

      <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 320 }}>
        <tbody>
          <tr>
            <td style={{ border: "1px solid transparent", padding: "4px 8px", width: "25%", textAlign: "start" }}>
              <button
                type="button"
                className="link-btn"
                style={{ textDecoration: "none", color: "var(--text)" }}
                disabled={index === 0}
                onClick={() => setIndex(index - 1)}
              >
                ◀
              </button>
            </td>
            <td className="muted" style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "center" }}>
              Question {index + 1} / {copie.questions.length}
            </td>
            <td style={{ border: "1px solid transparent", padding: "4px 8px", width: "25%", textAlign: "end" }}>
              <button
                type="button"
                className="link-btn"
                style={{ textDecoration: "none", color: "var(--text)" }}
                disabled={index === copie.questions.length - 1}
                onClick={() => setIndex(index + 1)}
              >
                ▶
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <hr style={{ width: "100%", maxWidth: 320, border: "none", borderTop: "1px solid var(--border)", margin: "1em 0 0" }} />

      {q.type === "verbe" && (
        <>
          <p style={{ margin: "1em 0 0" }}>
            <span className="hebrew" style={{ fontSize: "1.2em" }}>
              {q.verbe}
            </span>{" "}
            <span style={{ fontStyle: "italic", color: "var(--textMuted)" }}>({q.traduction})</span>
          </p>
          <p className="muted" style={{ margin: "4px 0" }}>
            {q.temps} — {q.personne}
          </p>
          <p className="hebrew" style={{ fontSize: "0.9em", margin: "0.4em 0" }}>
            <span style={{ color: "var(--text)" }}>Réponse : </span>
            <span style={{ fontStyle: "italic", color: "var(--textMuted)" }}>{answer.submitted || "—"}</span>
          </p>
          <p style={{ fontWeight: 600, color: verbeCorrect ? "var(--success)" : "var(--danger)" }}>
            {verbeCorrect ? "Correct" : "Incorrect"}
          </p>
          {!verbeCorrect && (
            <p className="hebrew" style={{ fontSize: "0.9em", margin: 0 }}>
              <span style={{ color: "var(--success)", fontWeight: 600 }}>{q.conjugaison}</span>{" "}
              <span style={{ fontStyle: "italic", color: "var(--textMuted)" }}>(solution)</span>
            </p>
          )}
        </>
      )}

      {q.type === "quizz" && (
        <>
          <p style={{ color: "var(--text)", margin: "1em 0 0" }}>{q.french}</p>
          <QuizzBubbles options={q.options} correctKey={q.key} selectedKey={answer.selected_key} disabled />
          <p style={{ fontWeight: 600, color: answer.selected_key === q.key ? "var(--success)" : "var(--danger)" }}>
            {answer.selected_key === q.key ? "Correct" : "Incorrect"}
          </p>
        </>
      )}

      {q.type === "traduction" && (
        <>
          <p style={{ fontStyle: "italic", color: "var(--textMuted)", margin: "1em 0 0", fontSize: "0.96em" }}>
            {q.direction === "hebreu" ? q.french : q.hebrew}
          </p>
          <p className="hebrew" style={{ fontSize: "0.8em", margin: 0, marginTop: "1.5em" }}>
            <span style={{ color: "var(--text)" }}>Réponse de l'étudiant : </span>
            <span style={{ fontStyle: "italic", color: "var(--textMuted)" }}>{answer.translation}</span>
          </p>
          <hr style={{ width: "100%", border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />
          <StarRating rating={answer.score} />
          {answer.observations?.length > 0 && (
            <ul
              style={{
                margin: "4px 0 0",
                paddingInlineStart: "1.2em",
                fontStyle: "italic",
                fontSize: "0.85em",
                color: "var(--textMuted)",
                textAlign: "start",
              }}
            >
              {answer.observations.map((obs, i) => (
                <li key={i}>{renderWithHebrewHighlight(obs)}</li>
              ))}
            </ul>
          )}
        </>
      )}

      {q.type === "oral" && (
        <>
          <p className="hebrew-large">{q.question_hebrew}</p>
          <AudioPlayer src={mediaUrl(q.voicepath)} barMaxWidth={58.5} toggleSize={27} />
          <p className="hebrew" style={{ fontSize: "0.8em", margin: 0, marginTop: "1.5em" }}>
            <span style={{ color: "var(--text)" }}>Réponse de l'étudiant : </span>
            <span style={{ fontStyle: "italic", color: "var(--textMuted)" }}>{answer.verbatim}</span>
          </p>
          <hr style={{ width: "100%", border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />
          <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 320 }}>
            <tbody>
              <tr>
                <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>Complétude</td>
                <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                  <StarRating rating={answer.rating_completeness} />
                </td>
              </tr>
              {answer.errors_rating_completeness?.length > 0 && (
                <tr>
                  <td colSpan={2} style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>
                    <ul style={{ margin: 0, paddingInlineStart: "1.2em", fontStyle: "italic", fontSize: "0.85em", color: "var(--textMuted)" }}>
                      {answer.errors_rating_completeness.map((e, i) => (
                        <li key={i}>{renderWithHebrewHighlight(e)}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
              <tr>
                <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>Grammaire</td>
                <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                  <StarRating rating={answer.rating_hebrew} />
                </td>
              </tr>
              {answer.errors_rating_hebrew?.length > 0 && (
                <tr>
                  <td colSpan={2} style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>
                    <ul style={{ margin: 0, paddingInlineStart: "1.2em", fontStyle: "italic", fontSize: "0.85em", color: "var(--textMuted)" }}>
                      {answer.errors_rating_hebrew.map((e, i) => (
                        <li key={i}>{renderWithHebrewHighlight(e)}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
              <tr>
                <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>Compréhension</td>
                <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                  <StarRating rating={answer.rating_comprehension} />
                </td>
              </tr>
              {answer.errors_rating_comprehension?.length > 0 && (
                <tr>
                  <td colSpan={2} style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>
                    <ul style={{ margin: 0, paddingInlineStart: "1.2em", fontStyle: "italic", fontSize: "0.85em", color: "var(--textMuted)" }}>
                      {answer.errors_rating_comprehension.map((e, i) => (
                        <li key={i}>{renderWithHebrewHighlight(e)}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
              <tr>
                <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>Note Globale</td>
                <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                  <StarRating rating={Math.round(computeGlobalNote(answer))} />
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      <button type="button" className="link-btn" onClick={() => navigate("/examen")}>
        Retour à l'examen
      </button>
    </section>
  );
}
