import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getExamenCopie } from "../../api/content";
import { AudioPlayer } from "../../components/AudioPlayer";
import { QuizzBubbles } from "../../components/QuizzBubbles";
import { mediaUrl } from "../../api/media";
import { displayLessonCode } from "../../utils/lessonDisplay";
import "../screens.css";

const FORMAT_LABELS = { ecrit: "Écrit", oral: "Oral" };
const TYPE_LABELS = { rapide: "Rapide", long: "Long", tres_long: "Très long" };

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Les observations sont affichées en italique, mais un mot en hébreu au
// milieu d'une phrase française perd en lisibilité en italique — on l'en
// exempte pour qu'il ressorte mieux (cf. QuestionEcriteScreen, même logique).
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
  const average = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const comment = ratings.every((r) => r >= 4) ? "excellent" : "insuffisant";
  return { average, comment };
}

// Le Résumé compte deux fois plus que les Détails dans la note globale du
// rapport (même pondération que ExamenOralScreen).
function computeReportNote(answer) {
  const average = (2 * answer.score_summary + answer.score_details) / 3;
  const comment = average >= 4 ? "Satisfaisant" : "Insatisfaisant";
  return { average, comment };
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

export default function ExamenCopieDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [copie, setCopie] = useState(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    getExamenCopie(id).then(setCopie);
  }, [id]);

  if (!copie) return null;

  const q = copie.questions[index];
  const answer = copie.answers[index];

  return (
    <section className="screen">
      <h1>Copie #{copie.id}</h1>
      <p className="muted">
        {copie.date.split(" ")[0]} — Examen {displayLessonCode(copie.code)} — {FORMAT_LABELS[copie.format]} —{" "}
        {TYPE_LABELS[copie.exam_type]}
      </p>
      <p className="muted">
        Note moyenne : {copie.average_note.toFixed(1)} / 5 — Réponses ≥4★ :{" "}
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

      <hr
        style={{
          width: "100%",
          maxWidth: 320,
          border: "none",
          borderTop: "1px solid var(--border)",
          margin: "1em 0 0",
        }}
      />

      {copie.format === "ecrit" && q.type === "quizz" ? (
        <>
          <p style={{ color: "var(--text)", margin: "1em 0 0", fontSize: "0.96em" }}>{q.french}</p>

          <QuizzBubbles options={q.options} correctKey={q.key} selectedKey={answer.selected_key} disabled />

          <p
            style={{
              fontWeight: 600,
              color: answer.selected_key === q.key ? "var(--success)" : "var(--danger)",
            }}
          >
            {answer.selected_key === q.key ? "Correct" : "Incorrect"}
          </p>
        </>
      ) : copie.format === "ecrit" ? (
        <>
          <p style={{ fontStyle: "italic", color: "var(--textMuted)", margin: "1em 0 0", fontSize: "0.96em" }}>
            {q.french}
          </p>

          <p className="hebrew" style={{ fontSize: "0.8em", margin: 0, marginTop: "1.5em" }}>
            <span style={{ color: "var(--text)" }}>Réponse de l'étudiant : </span>
            <span style={{ fontStyle: "italic", color: "var(--textMuted)" }}>{answer.translation}</span>
          </p>

          <hr style={{ width: "100%", border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />

          <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 320 }}>
            <tbody>
              <tr>
                <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>
                  Note
                </td>
                <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                  <StarRating rating={answer.score} />
                </td>
              </tr>
              {answer.observations.length > 0 && (
                <tr>
                  <td
                    colSpan={2}
                    style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}
                  >
                    <ul
                      style={{
                        margin: 0,
                        paddingInlineStart: "1.2em",
                        fontStyle: "italic",
                        fontSize: "0.85em",
                        color: "var(--textMuted)",
                      }}
                    >
                      {answer.observations.map((obs, i) => (
                        <li key={i}>{renderWithHebrewHighlight(obs)}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      ) : copie.format === "oral" && q.type === "rapport" ? (
        <>
          <AudioPlayer src={mediaUrl(q.voicepath)} barMaxWidth={58.5} toggleSize={27} />

          <p style={{ fontSize: "0.8em", margin: 0, marginTop: "1.5em" }}>
            <span style={{ color: "var(--text)" }}>Rapport de l'étudiant : </span>
            <span style={{ fontStyle: "italic", color: "var(--textMuted)" }}>{answer.rapport}</span>
          </p>

          <hr style={{ width: "100%", border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />

          <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 320 }}>
            <tbody>
              <tr>
                <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>Résumé</td>
                <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                  <StarRating rating={answer.score_summary} />
                </td>
              </tr>
              {answer.justification_summary.length > 0 && (
                <tr>
                  <td
                    colSpan={2}
                    style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}
                  >
                    <ul
                      style={{
                        margin: 0,
                        paddingInlineStart: "1.2em",
                        fontStyle: "italic",
                        fontSize: "0.85em",
                        color: "var(--textMuted)",
                      }}
                    >
                      {answer.justification_summary.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
              <tr>
                <td colSpan={2} style={{ height: "1em", border: "1px solid transparent" }} />
              </tr>
              <tr>
                <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>Détails</td>
                <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                  <StarRating rating={answer.score_details} />
                </td>
              </tr>
              {answer.justification_details.length > 0 && (
                <tr>
                  <td
                    colSpan={2}
                    style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}
                  >
                    <ul
                      style={{
                        margin: 0,
                        paddingInlineStart: "1.2em",
                        fontStyle: "italic",
                        fontSize: "0.85em",
                        color: "var(--textMuted)",
                      }}
                    >
                      {answer.justification_details.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
              <tr>
                <td colSpan={2} style={{ padding: "8px 0", border: "1px solid transparent" }}>
                  <hr
                    style={{
                      width: "100%",
                      border: "none",
                      borderTop: "1px solid var(--border)",
                      margin: 0,
                    }}
                  />
                </td>
              </tr>
              <tr>
                <td colSpan={2} style={{ height: "1em", border: "1px solid transparent" }} />
              </tr>
              <tr>
                <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>
                  Note Globale
                </td>
                <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                  <StarRating rating={Math.round(computeReportNote(answer).average)} />
                </td>
              </tr>
              <tr>
                <td
                  colSpan={2}
                  style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}
                >
                  <ul style={{ margin: 0, paddingInlineStart: "1.2em", fontSize: "0.75em" }}>
                    <li style={{ color: "var(--text)" }}>
                      {computeReportNote(answer).comment}{" "}
                      <span style={{ fontStyle: "italic", color: "var(--textMuted)" }}>
                        La note Résumé compte deux fois plus que la note Détails dans le calcul de la note globale.
                      </span>
                    </li>
                  </ul>
                </td>
              </tr>
            </tbody>
          </table>
        </>
      ) : (
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
                <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>
                  Complétude
                </td>
                <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                  <StarRating rating={answer.rating_completeness} />
                </td>
              </tr>
              {answer.errors_rating_completeness?.length > 0 && (
                <tr>
                  <td
                    colSpan={2}
                    style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}
                  >
                    <ul
                      style={{
                        margin: 0,
                        paddingInlineStart: "1.2em",
                        fontStyle: "italic",
                        fontSize: "0.85em",
                        color: "var(--textMuted)",
                      }}
                    >
                      {answer.errors_rating_completeness.map((e, i) => (
                        <li key={i}>{renderWithHebrewHighlight(e)}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
              <tr>
                <td colSpan={2} style={{ height: "1em", border: "1px solid transparent" }} />
              </tr>
              <tr>
                <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>
                  Grammaire
                </td>
                <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                  <StarRating rating={answer.rating_hebrew} />
                </td>
              </tr>
              {answer.errors_rating_hebrew.length > 0 && (
                <tr>
                  <td
                    colSpan={2}
                    style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}
                  >
                    <ul
                      style={{
                        margin: 0,
                        paddingInlineStart: "1.2em",
                        fontStyle: "italic",
                        fontSize: "0.85em",
                        color: "var(--textMuted)",
                      }}
                    >
                      {answer.errors_rating_hebrew.map((e, i) => (
                        <li key={i}>{renderWithHebrewHighlight(e)}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
              <tr>
                <td colSpan={2} style={{ height: "1em", border: "1px solid transparent" }} />
              </tr>
              <tr>
                <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>
                  Compréhension
                </td>
                <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                  <StarRating rating={answer.rating_comprehension} />
                </td>
              </tr>
              {answer.errors_rating_comprehension.length > 0 && (
                <tr>
                  <td
                    colSpan={2}
                    style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}
                  >
                    <ul
                      style={{
                        margin: 0,
                        paddingInlineStart: "1.2em",
                        fontStyle: "italic",
                        fontSize: "0.85em",
                        color: "var(--textMuted)",
                      }}
                    >
                      {answer.errors_rating_comprehension.map((e, i) => (
                        <li key={i}>{renderWithHebrewHighlight(e)}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
              <tr>
                <td colSpan={2} style={{ height: "1em", border: "1px solid transparent" }} />
              </tr>
              <tr>
                <td colSpan={2} style={{ padding: "8px 0", border: "1px solid transparent" }}>
                  <hr
                    style={{
                      width: "100%",
                      border: "none",
                      borderTop: "1px solid var(--border)",
                      margin: 0,
                    }}
                  />
                </td>
              </tr>
              <tr>
                <td colSpan={2} style={{ height: "1em", border: "1px solid transparent" }} />
              </tr>
              <tr>
                <td style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}>
                  Note Globale
                </td>
                <td style={{ border: "1px solid transparent", padding: "4px 8px" }}>
                  <StarRating rating={Math.round(computeGlobalNote(answer).average)} />
                </td>
              </tr>
              <tr>
                <td
                  colSpan={2}
                  style={{ border: "1px solid transparent", padding: "4px 8px", textAlign: "start" }}
                >
                  <ul
                    style={{
                      margin: 0,
                      paddingInlineStart: "1.2em",
                      fontStyle: "italic",
                      fontSize: "0.85em",
                      color: "var(--textMuted)",
                    }}
                  >
                    <li>{capitalize(computeGlobalNote(answer).comment)}</li>
                  </ul>
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      <button type="button" className="link-btn" onClick={() => navigate("/examen/copies")}>
        Retour à mes copies
      </button>
    </section>
  );
}
