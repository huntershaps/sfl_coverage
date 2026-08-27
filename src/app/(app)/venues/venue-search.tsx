"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { IconSearch } from "@/components/ui";

export function VenueSearch({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  function submit(next: string) {
    const p = new URLSearchParams(params.toString());
    if (next.trim()) p.set("q", next.trim());
    else p.delete("q");
    startTransition(() => router.replace(`/venues?${p.toString()}`));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(value);
      }}
      className="relative"
      role="search"
    >
      <IconSearch
        size={16}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate"
      />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => submit(value)}
        placeholder="Search venues, cities, abbreviations…"
        aria-label="Search venues"
        className="h-11 w-full rounded-full bg-card pl-10 pr-4 text-[14px] text-ink ring-1 ring-inset ring-line
                   transition-all placeholder:text-slate hover:ring-line-strong focus:ring-2 focus:ring-brand-500 focus:outline-none"
      />
    </form>
  );
}
