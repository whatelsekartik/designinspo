import Link from "next/link";
import type { FeedImage } from "@/lib/types";

/** Simple, dense image grid used for related/similar sets on the detail page. */
export function ImageGrid({ images }: { images: FeedImage[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
      {images.map((img) => (
        <Link
          key={img.id}
          href={`/image/${img.id}`}
          className="group relative block overflow-hidden rounded-lg bg-ink-3"
          style={{ aspectRatio: `${img.width || 4} / ${img.height || 5}` }}
        >
          <img
            src={img.urls.thumb}
            alt={img.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
          />
          <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-2 pt-6 text-[10px] text-paper/85 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
            {img.title}
          </span>
        </Link>
      ))}
    </div>
  );
}
