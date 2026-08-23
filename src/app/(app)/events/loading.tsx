/** Matches the events grid so the fallback has the same shape as the result. */
export default function EventsLoading() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6 space-y-2.5">
        <div className="skeleton h-9 w-72" />
        <div className="skeleton h-3.5 w-[min(100%,440px)]" />
      </div>

      <div className="mb-3 flex gap-2">
        <div className="skeleton h-11 flex-1" />
        <div className="skeleton h-11 w-[124px]" />
      </div>
      <div className="mb-6 flex gap-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-8 w-24 rounded-full" />
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="surface overflow-hidden">
            <div className="skeleton h-40 w-full rounded-none" />
            <div className="space-y-2.5 p-4">
              <div className="skeleton h-3 w-20" />
              <div className="skeleton h-5 w-3/4" />
              <div className="skeleton h-3 w-1/2" />
              <div className="skeleton h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>

      <span className="sr-only" role="status">
        Loading events…
      </span>
    </div>
  );
}
