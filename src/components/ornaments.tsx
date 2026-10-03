import { useId } from "react";

/**
 * Decorations: the everyday things of a sale out on the driveway, as simple shapes. Line drawings
 * use pathLength="1" so they draw themselves when they scroll into view (data-reveal="draw").
 */
type Props = { className?: string; style?: React.CSSProperties };

/** A string of little pennant flags, each swaying a little (animate-float with its own delay). */
export function Bunting({ className = "", flags = 14 }: Props & { flags?: number }) {
  const colors = ["var(--color-amber)", "var(--color-paper)", "var(--color-sky)", "var(--color-leaf)", "var(--color-amber-light)"];
  return (
    <div className={`pointer-events-none flex justify-between ${className}`} aria-hidden="true">
      <svg className="absolute inset-x-0 top-0 h-6 w-full" preserveAspectRatio="none" viewBox="0 0 100 10">
        <path d="M0 2 Q50 9 100 2" fill="none" stroke="currentColor" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
      </svg>
      {Array.from({ length: flags }, (_, i) => {
        const t = (i + 0.5) / flags;
        const sag = 4 * 0.7 * t * (1 - t); // follows the string's curve (in rem)
        return (
          <span key={i} className="animate-float relative block origin-top" style={{ marginTop: `${0.1 + sag}rem`, animationDelay: `${(i % 5) * -1.1}s`, animationDuration: `${5 + (i % 3)}s` }}>
            <svg width="22" height="28" viewBox="0 0 22 28">
              <path d="M0 0 H22 L11 28 Z" fill={colors[i % colors.length]} />
            </svg>
          </span>
        );
      })}
    </div>
  );
}

/** A round "sale" sticker with a jagged edge, turning slowly. */
export function Starburst({ className = "", text = "Everything must go!", style }: Props & { text?: string }) {
  const id = `sb-${useId().replace(/:/g, "")}`;
  const points = Array.from({ length: 40 }, (_, i) => {
    const r = i % 2 ? 44 : 50;
    const a = (i / 40) * Math.PI * 2;
    return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  return (
    <div className={className.includes("absolute") ? className : `relative ${className}`} style={style} aria-hidden="true">
      <svg viewBox="0 0 100 100" className="animate-spin-slow absolute inset-0 h-full w-full">
        <polygon points={points} fill="var(--color-amber)" />
        <circle cx="50" cy="50" r="38" fill="none" stroke="var(--color-paper)" strokeWidth="0.8" strokeDasharray="2 2" />
        <path id={id} d="M50 50 m-30 0 a30 30 0 1 1 60 0 a30 30 0 1 1 -60 0" fill="none" />
        {/* Once round the circle (twice for short words), spaced to fit exactly. */}
        <text fontSize="8" fontWeight="700" fill="var(--color-tag-dark)" style={{ textTransform: "uppercase" }}>
          <textPath href={`#${id}`} textLength="186" lengthAdjust="spacing">
            {Array.from({ length: Math.max(1, Math.floor(30 / (text.length + 3))) }, () => `${text} ★ `).join("")}
          </textPath>
        </text>
      </svg>
      <span className="absolute inset-0 grid place-items-center font-display text-[1.6em] font-bold text-tag-dark">$</span>
    </div>
  );
}

/** Soft rings, like sunlight on the driveway, for behind a section. */
export function SunRings({ className = "" }: Props) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true">
      {[96, 80, 64, 48, 32].map((r, i) => (
        <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="currentColor" strokeWidth={i % 2 ? 0.6 : 1.2} strokeDasharray={i % 2 ? "2 4" : undefined} />
      ))}
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return <line key={i} x1={100 + 100 * Math.cos(a)} y1={100 + 100 * Math.sin(a)} x2={100 + 88 * Math.cos(a)} y2={100 + 88 * Math.sin(a)} stroke="currentColor" strokeWidth="1" />;
      })}
    </svg>
  );
}

/** A house with its garage door up, as a line drawing. */
export function HouseLine({ className = "" }: Props) {
  return (
    <svg viewBox="0 0 120 90" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} data-reveal="draw" aria-hidden="true">
      <path pathLength="1" d="M8 42 L44 14 L80 42 M16 36 V84 H72 V36" />
      <path pathLength="1" d="M28 84 V58 H60 V84 M28 64 H60 M28 70 H60" />
      <path pathLength="1" d="M80 42 H112 V84 H72" />
      <path pathLength="1" d="M88 84 V62 H104 V84" />
      <path pathLength="1" d="M2 84 H118" />
    </svg>
  );
}

/** A price tag on its string, as a line drawing. */
export function TagLine({ className = "", style }: Props) {
  return (
    <svg viewBox="0 0 60 60" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} data-reveal="draw" aria-hidden="true">
      <path pathLength="1" d="M8 30 V10 H28 L52 34 L32 54 Z" />
      <circle pathLength="1" cx="17" cy="19" r="3" />
      <path pathLength="1" d="M17 16 C 12 4, 2 6, 4 14" />
    </svg>
  );
}

/** A thin rule with a tag in the middle, drawn as it scrolls in. */
export function Divider({ className = "" }: Props) {
  return (
    <div className={`container-page flex items-center gap-4 text-amber ${className}`} aria-hidden="true">
      <span className="h-px flex-1 origin-right bg-current/40" data-reveal="grow" />
      <TagLine className="size-9" />
      <span className="h-px flex-1 origin-left bg-current/40" data-reveal="grow" />
    </div>
  );
}
