export function YoutubeIcon({ size = 48 }) {
  return (
    <svg width={size} height={(size * 63) / 90} viewBox="0 0 90 63" aria-hidden="true">
      <path
        d="M88 10c-1-4-4-7-8-8C73 0 45 0 45 0S17 0 10 2C6 3 3 6 2 10 0 17 0 31.5 0 31.5S0 46 2 53c1 4 4 7 8 8 7 2 35 2 35 2s28 0 35-2c4-1 7-4 8-8 2-7 2-21.5 2-21.5S90 17 88 10z"
        fill="#FF0000"
      />
      <path d="M36 45V18l24 13.5L36 45z" fill="#fff" />
    </svg>
  );
}
