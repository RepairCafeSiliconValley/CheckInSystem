// Three finder rings + a few scattered modules — the standard QR silhouette.
// Rings are drawn as a single path with opposite winding so the hole shows the
// pill background through, and everything inherits the parent's color.
export default function QrIcon({ size = 14 }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block" }}
    >
      <path d="M1 1h6v6H1V1zm1.5 1.5v3h3v-3h-3z" />
      <path d="M9 1h6v6H9V1zm1.5 1.5v3h3v-3h-3z" />
      <path d="M1 9h6v6H1V9zm1.5 1.5v3h3v-3h-3z" />
      <rect x="9" y="9" width="2.5" height="2.5" />
      <rect x="12.5" y="9" width="2.5" height="2.5" />
      <rect x="9" y="12.5" width="2.5" height="2.5" />
      <rect x="12.5" y="12.5" width="2.5" height="2.5" />
    </svg>
  );
}
