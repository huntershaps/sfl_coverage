export default function ManageEventsLoading() {
  return (
    <div className="mx-auto max-w-[1300px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6 space-y-2.5">
        <div className="skeleton h-9 w-64" />
        <div className="skeleton h-3.5 w-[min(100%,440px)]" />
      </div>
      <div className="mb-6 skeleton h-11 w-full" />
      <div className="surface divide-y divide-line overflow-hidden">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3.5">
            <div className="skeleton size-10 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-3.5 w-2/5" />
              <div className="skeleton h-3 w-24" />
            </div>
            <div className="skeleton h-3 w-24 shrink-0" />
          </div>
        ))}
      </div>
      <span className="sr-only" role="status">
        Loading events…
      </span>
    </div>
  );
}
