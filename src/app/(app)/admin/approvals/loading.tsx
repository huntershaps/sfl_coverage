export default function ApprovalsLoading() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6 space-y-2.5">
        <div className="skeleton h-9 w-72" />
        <div className="skeleton h-3.5 w-[min(100%,480px)]" />
      </div>
      <div className="mb-6 skeleton h-[72px] w-full rounded-2xl" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-[132px] w-full rounded-2xl" />
        ))}
      </div>
      <span className="sr-only" role="status">
        Loading coverage requests…
      </span>
    </div>
  );
}
