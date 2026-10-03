import Link from "next/link";

/** An endless ribbon of what's for sale, by kind of thing, repeated to fill the width. Pauses on hover. */
export function Marquee({ categories }: { categories: { value: string; label: string; count: number }[] }) {
  if (!categories.length) return null;
  const ribbon = Array.from({ length: Math.ceil(10 / categories.length) }, () => categories).flat();
  const items = (hidden: boolean) =>
    ribbon.map((c, i) => (
      <Link key={`${c.value}-${i}`} href={`/shop?category=${c.value}`} tabIndex={hidden ? -1 : undefined} className="flex shrink-0 items-center gap-3 pr-8 hover:text-amber-light">
        <span className="font-display text-xl md:text-2xl">{c.label}</span>
        <span className="text-sm text-paper/60">{c.count}</span>
        <span className="pl-5 text-amber" aria-hidden="true">
          ✦
        </span>
      </Link>
    ));
  return (
    <div className="marquee overflow-hidden bg-tag-dark py-4 text-paper" aria-label="Kinds of things for sale">
      <div className="marquee-track flex w-max">
        <div className="flex">{items(false)}</div>
        <div className="flex" aria-hidden="true">
          {items(true)}
        </div>
      </div>
    </div>
  );
}
