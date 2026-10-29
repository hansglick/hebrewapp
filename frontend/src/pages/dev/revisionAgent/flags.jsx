// Drapeaux en SVG : Windows n'affiche pas les émojis de drapeaux.

export function FlagIsrael() {
  return (
    <svg
      viewBox="0 0 220 160"
      className="ra-flag"
      role="img"
      aria-label="Hébreu"
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="220" height="160" fill="#fff" />
      <rect y="15" width="220" height="25" fill="#0038b8" />
      <rect y="120" width="220" height="25" fill="#0038b8" />
      <g fill="none" stroke="#0038b8" strokeWidth="5.5">
        <path d="M110 48 82 96h56z" />
        <path d="M110 112 82 64h56z" />
      </g>
    </svg>
  );
}

// round : dans une pastille ronde, trois bandes égales plutôt qu'un drapeau rogné.
export function FlagFrance({ round = false }) {
  return (
    <svg
      viewBox="0 0 3 2"
      className="ra-flag"
      role="img"
      aria-label="Français"
      preserveAspectRatio={round ? "none" : "xMidYMid slice"}
    >
      <rect width="1" height="2" fill="#0055a4" />
      <rect x="1" width="1" height="2" fill="#fff" />
      <rect x="2" width="1" height="2" fill="#ef4135" />
    </svg>
  );
}
