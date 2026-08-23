export default function CalendarLoading() {
  return (
    <div className="mx-auto max-w-[1300px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6 space-y-2.5">
        <div className="skeleton h-9 w-64" />
        <div className="skeleton h-3.5 w-[min(100%,420px)]" />
      </div>
      <div className="mb-6 skeleton h-11 w-full" />
      <div className="skeleton h-[520px] w-full rounded-2xl" />
      <span className="sr-only" role="status">
        Loading the calendar…
      </span>
    </div>
  );
}
