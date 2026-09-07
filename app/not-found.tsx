import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="page narrow">
      <h1>We couldn’t find that page.</h1>
      <Link className="button" href="/">
        Discover kitchens
      </Link>
    </div>
  );
}
