import { encode } from "uqr";

/** A plain, crisp QR code (prints well on paper). */
export function QrSvg({ text, size = 200, className = "", label }: { text: string; size?: number; className?: string; label: string }) {
  const { size: n, data } = encode(text, { ecc: "M", border: 2 });
  let d = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (data[y][x]) d += `M${x} ${y}h1v1h-1z`;
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} className={className} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={n} height={n} fill="#fff" />
      <path d={d} fill="#1d2a36" />
    </svg>
  );
}
