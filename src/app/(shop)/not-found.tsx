import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page max-w-xl py-20 text-center">
      <p className="price-tag text-xl">404</p>
      <h1 className="mt-4 text-4xl">Not here any more</h1>
      <p className="mt-3 text-muted">It may have sold, or the link is off. Have a look at what&apos;s still for sale.</p>
      <Link href="/shop" className="btn btn-primary mt-6">
        Browse everything
      </Link>
    </div>
  );
}
