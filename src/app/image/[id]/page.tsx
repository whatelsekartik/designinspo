import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getImage, getRelated, getSimilar, recordView } from "@/lib/repo/images";
import { ImageActions } from "@/components/ImageActions";
import { ImageGrid } from "@/components/ImageGrid";
import { formatDate } from "@/lib/client";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const image = getImage(id);
  if (!image) return { title: "Not found — INFINITE" };
  return {
    title: `${image.title} — ${image.categoryLabel} · INFINITE`,
    description: image.description.slice(0, 180),
    openGraph: { title: image.title, description: image.description.slice(0, 180), images: [image.urls.full] },
  };
}

export default async function ImagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const image = getImage(id);
  if (!image) notFound();
  recordView(id, "page");
  const related = getRelated(id, 8);
  const similar = getSimilar(id, 16);
  const palette = image.palette.slice(0, 6);

  return (
    <div className="mx-auto max-w-[1560px] px-4 pb-24 pt-[92px] md:px-8 md:pt-[104px]">
      <Link href="/" className="mono inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-paper/40 hover:text-paper">
        <ArrowLeft size={12} /> Discover
      </Link>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1.6fr_420px] lg:items-start">
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0d0a08]">
          <img
            src={image.urls.full}
            alt={image.title}
            className="mx-auto block max-h-[78vh] w-auto max-w-full object-contain"
            style={{ backgroundImage: image.blurData ? `url(${image.blurData})` : undefined, backgroundSize: "cover" }}
          />
          <div className="absolute bottom-3 left-3 flex gap-1.5">
            {palette.map((c) => (
              <span key={c} className="h-3 w-3 rounded-full ring-1 ring-white/20" style={{ background: c }} title={c} />
            ))}
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/?category=${image.categoryId}`}
              className="chip !h-7 !cursor-pointer !text-[10.5px]"
              style={{ borderColor: `${image.categoryAccent}55`, color: "#f3dcc9" }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: image.categoryAccent }} />
              {image.categoryLabel}
            </Link>
            <Link href={`/search?aesthetic=${encodeURIComponent(image.aesthetic)}`} className="mono text-[10px] uppercase tracking-[0.16em] text-muted hover:text-paper">
              {image.aesthetic}
            </Link>
          </div>

          <h1 className="serif mt-4 text-[clamp(28px,3.4vw,40px)] leading-[1.05] text-paper">{image.title}</h1>
          <p className="mt-3 text-[13.5px] leading-relaxed text-paper/55">{image.description}</p>

          <ImageActions image={image} />

          <div className="mt-5 flex flex-wrap gap-1.5">
            {image.tags.slice(0, 12).map((tag) => (
              <Link key={tag} href={`/search?q=${encodeURIComponent(tag)}`} className="chip !h-6 !px-2.5 !text-[10.5px]">
                {tag}
              </Link>
            ))}
          </div>

          <div className="mt-6 rounded-xl border border-white/[0.08] bg-black/25 p-3.5">
            <p className="label !text-[9px]">Generation prompt</p>
            <p className="mono mt-2 text-[10.5px] leading-relaxed text-paper/55">{image.prompt}</p>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/[0.07] pt-5">
            {[
              ["Generated", formatDate(image.publishedAt)],
              ["Dimensions", `${image.width} × ${image.height}`],
              ["Ratio", image.ratioLabel],
              ["Model", image.model || "—"],
              ["Provider", image.provider || "—"],
              ["Saves", String(image.saves)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="label !text-[9px]">{k}</dt>
                <dd className="mono mt-1 text-[10.5px] text-paper/70">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-14">
          <div className="flex items-baseline justify-between border-b border-white/[0.07] pb-3">
            <h2 className="serif text-[20px] text-paper">More like this</h2>
            <Link href={`/search?aesthetic=${encodeURIComponent(image.aesthetic)}`} className="mono text-[9.5px] uppercase tracking-[0.14em] text-paper/35 hover:text-paper">
              Explore aesthetic →
            </Link>
          </div>
          <div className="mt-5">
            <ImageGrid images={related} />
          </div>
        </section>
      )}

      {similar.length > 0 && (
        <section className="mt-12">
          <div className="flex items-baseline justify-between border-b border-white/[0.07] pb-3">
            <h2 className="serif text-[20px] text-paper">Visually similar</h2>
            <p className="mono text-[9.5px] uppercase tracking-[0.14em] text-white/25">matched on tags, palette + direction</p>
          </div>
          <div className="mt-5">
            <ImageGrid images={similar} />
          </div>
        </section>
      )}
    </div>
  );
}
