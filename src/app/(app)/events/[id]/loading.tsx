/**
 * The events-list skeleton would otherwise cascade down to this route, showing a
 * grid of cards while a single event detail page loads.
 */
export default function EventDetailLoading() {
  return (
    <div>
      <div className="relative">
        <div className="skeleton h-[300px] w-full rounded-none sm:h-[380px]" />
      </div>

      <div className="mx-auto max-w-[1200px] px-4 pb-10 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_356px]">
          <div className="space-y-6">
            <div className="skeleton h-[132px] w-full rounded-2xl" />
            <div className="skeleton h-[220px] w-full rounded-2xl" />
          </div>
          <div className="space-y-4">
            <div className="skeleton h-[300px] w-full rounded-2xl" />
          </div>
        </div>
      </div>

      <span className="sr-only" role="status">
        Loading event…
      </span>
    </div>
  );
}
