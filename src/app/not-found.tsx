import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[80vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="eyebrow">404</p>
      <h1 className="display mt-4 text-[42px] text-paper">
        This thread <em>unravelled</em>.
      </h1>
      <p className="mt-3 text-[13px] leading-relaxed text-paper/50">
        The image or collection you were looking for isn&apos;t here. The agent may have moved on — there is always something else to find.
      </p>
      <div className="mt-6 flex gap-2">
        <Link href="/" className="btn btn-primary">Back to the universe</Link>
        <Link href="/search" className="btn">Search</Link>
      </div>
    </div>
  );
}
