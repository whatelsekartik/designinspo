export default function Loading() {
  return (
    <div className="mx-auto max-w-[1840px] px-4 pb-24 pt-[104px] md:px-7 md:pt-[132px]">
      <div className="skeleton h-3 w-40" />
      <div className="mt-6 space-y-3">
        <div className="skeleton h-[52px] w-[70%] md:h-[76px]" />
        <div className="skeleton h-[52px] w-[52%] md:h-[76px]" />
      </div>
      <div className="mt-10 flex gap-2">
        <div className="skeleton h-8 w-24 rounded-full" />
        <div className="skeleton h-8 w-28 rounded-full" />
        <div className="skeleton h-8 w-24 rounded-full" />
      </div>
      <div className="masonry mt-10">
        {[260, 340, 210, 300, 240, 380, 280, 220].map((h, i) => (
          <div key={i} className="masonry-item">
            <div className="skeleton w-full" style={{ height: h }} />
          </div>
        ))}
      </div>
    </div>
  );
}
