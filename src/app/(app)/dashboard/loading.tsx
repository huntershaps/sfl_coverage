export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-7 space-y-2.5">
        <div className="skeleton h-8 w-72" />
        <div className="skeleton h-3.5 w-96" />
      </div>

      <div className="mb-8 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-[86px] rounded-2xl" />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="skeleton h-64 rounded-2xl" />
        <div className="skeleton h-64 rounded-2xl" />
      </div>

      <span className="sr-only" role="status">
        Loading your dashboard…
      </span>
    </div>
  );
}
