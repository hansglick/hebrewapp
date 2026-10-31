// Facture de la séance (cf. demande explicite du user), envoyée par le
// serveur à la fin de la conversation : la durée, puis un bloc par modèle (le
// prof, Gemini Live 3.8, puis les modèles Flash de la traduction et des
// jugements), séparés par un trait pointillé. Chaque bloc commence par le nom
// du modèle, puis l'entrée et la sortie (tokens arrondis et prix au tarif de
// la documentation ; en mode texte, l'entrée lue en cache à part) et, sous
// un filet de la colonne des prix, leur somme ; enfin le total. Elle se
// déroule ligne après ligne, chacune de gauche à droite (cf. .ra-bill-row).
// Fournie par RevisionAgentScreen à toutes les tâches (cf. billContext),
// affichée sous le suivi (cf. TaskLayout).

const MODEL_NAMES = {
  "gemini-3.8-live": "Gemini Live 3.8",
  "gemini-3.8-flash": "Gemini 3.8 Flash",
  "gemini-3.5-flash": "Gemini 3.5 Flash",
  "gemini-3.5-flash-lite": "Gemini 3.5 Flash-Lite",
  "gemini-3.5-transcribe": "Gemini 3.5 Transcribe",
  "gemini-3.8-flash-tts": "Gemini 3.8 Flash TTS",
  "gemini-3.8-flash-lite-tts": "Gemini 3.8 Flash-Lite TTS",
  "gemini-3.1-flash-tts-preview": "Gemini 3.1 Flash TTS",
};

const ROW_DELAY_MS = 160; // écart entre le début du déroulé de deux lignes (cf. @keyframes ra-bill-stream)
const START_MS = 500; // la fenêtre de la facture se déroule d'abord (cf. .ra-volet)

// Arrondi au-delà du millier : 4348 → 4.3 K, 52 050 → 52 K ; en dessous, tel quel.
function rounded(n) {
  if (n < 1000) return `${n}`;
  if (n >= 1e6) return `${Number((n / 1e6).toFixed(1))} M`;
  return n < 1e4 ? `${Number((n / 1000).toFixed(1))} K` : `${Math.round(n / 1000)} K`;
}
const tokens = (n) => `${rounded(n)} ${n > 1 ? "tokens" : "token"}`;
const dollars = (amount) =>
  `${amount.toLocaleString("fr-FR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} $`;
const cost = (model) => model.input_cost + model.output_cost;

function duration(seconds) {
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes} min ${String(seconds % 60).padStart(2, "0")} s` : `${seconds} s`;
}

export default function Bill({ bill }) {
  // Rang de chaque ligne dans le déroulé.
  let rank = 0;
  const row = (className, cells) => (
    <div className={`ra-bill-row ${className}`} style={{ "--bill-delay": `${START_MS + rank++ * ROW_DELAY_MS}ms` }}>
      {cells}
    </div>
  );

  return (
    <div className="ra-bill">
      {row(
        "ra-bill-duration",
        <>
          <span>Durée de la conversation</span>
          <span />
          <span className="ra-bill-price">{duration(bill.seconds)}</span>
        </>,
      )}
      {/* role : en mode texte, le prof, qui peut être le même modèle que celui des traductions. */}
      {bill.models.map((model) => (
        <div className="ra-bill-block" key={`${model.role ?? ""}-${model.model}`}>
          {row(
            "ra-bill-model",
            <span>
              {MODEL_NAMES[model.model] ?? model.model}
              {model.role && ` (${model.role})`}
            </span>,
          )}
          {row(
            "",
            <>
              <span>Entrée</span>
              <span className="ra-bill-tokens">
                {tokens(model.input_tokens)}
                {model.cached_tokens > 0 && (
                  <span className="ra-bill-cached"> dont {rounded(model.cached_tokens)} en cache</span>
                )}
              </span>
              <span className="ra-bill-price">{dollars(model.input_cost)}</span>
            </>,
          )}
          {row(
            "",
            <>
              <span>Sortie</span>
              <span className="ra-bill-tokens">{tokens(model.output_tokens)}</span>
              <span className="ra-bill-price">{dollars(model.output_cost)}</span>
            </>,
          )}
          {row(
            "ra-bill-sum",
            <>
              <span />
              <span />
              <span className="ra-bill-price">{dollars(cost(model))}</span>
            </>,
          )}
        </div>
      ))}
      {row(
        "ra-bill-total",
        <>
          <span>Total</span>
          <span />
          <span className="ra-bill-price">{dollars(bill.models.reduce((sum, model) => sum + cost(model), 0))}</span>
        </>,
      )}
    </div>
  );
}
