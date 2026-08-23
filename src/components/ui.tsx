import Link from "next/link";
import type { ReactNode, CSSProperties } from "react";
import { cx, initials } from "@/lib/ui";

/* --------------------------------- badge --------------------------------- */

export function Badge({
  children,
  tone = "bg-canvas text-body ring-line",
  className,
  dot,
}: {
  children: ReactNode;
  tone?: string;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold ring-1 ring-inset whitespace-nowrap",
        tone,
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}

/* --------------------------------- button -------------------------------- */

type ButtonProps = {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

const VARIANTS: Record<string, string> = {
  // Ocean blue is the primary action; coral is reserved for the one call to
  // action that matters most on a screen.
  primary:
    "bg-brand-600 text-white font-semibold shadow-sm hover:bg-brand-700 active:bg-brand-700",
  accent:
    "bg-coral-600 text-white font-semibold shadow-sm hover:bg-coral-700 active:bg-coral-700",
  secondary:
    "bg-canvas text-brand-700 font-semibold ring-1 ring-inset ring-line-strong hover:bg-brand-50 hover:ring-brand-300",
  ghost: "text-body hover:text-ink hover:bg-sunken",
  danger:
    "bg-canvas text-red-600 font-semibold ring-1 ring-inset ring-red-200 hover:bg-red-50 hover:ring-red-300",
  success:
    "bg-teal-600 text-white font-semibold shadow-sm hover:bg-teal-700 active:bg-teal-700",
};

const SIZES: Record<string, string> = {
  sm: "h-8 px-3 text-[13px] rounded-lg gap-1.5",
  md: "h-10 px-4 text-[14px] rounded-xl gap-2",
  lg: "h-12 px-6 text-[15px] rounded-xl gap-2",
};

export function Button({
  children,
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex items-center justify-center transition-all duration-150 active:scale-[0.98]",
        "disabled:opacity-45 disabled:pointer-events-none",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = "secondary",
  size = "md",
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center justify-center transition-all duration-150 active:scale-[0.98]",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {children}
    </Link>
  );
}

/* ---------------------------------- card --------------------------------- */

export function Card({
  children,
  className,
  raised,
  style,
}: {
  children: ReactNode;
  className?: string;
  raised?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      style={style}
      className={cx(raised ? "surface-raised" : "surface", "overflow-hidden", className)}
    >
      {children}
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  action,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-end justify-between gap-4 mb-4", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h2 className="text-[19px] sm:text-[22px] text-ink">{title}</h2>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* -------------------------------- avatar --------------------------------- */

/* Mid-dark stops so the white initials clear AA on every variant. */
const AVATAR_RINGS = [
  "from-brand-600 to-brand-700",
  "from-teal-600 to-teal-700",
  "from-violet-600 to-violet-800",
  "from-coral-600 to-coral-700",
  "from-sky-700 to-brand-700",
];

export function Avatar({
  name,
  src,
  size = 40,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const grad = AVATAR_RINGS[h % AVATAR_RINGS.length];

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className={cx("rounded-full object-cover ring-1 ring-line", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white ring-1 ring-line",
        grad,
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

/* ------------------------------ empty states ------------------------------ */

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center justify-center text-center px-6 py-14 sm:py-20",
        className,
      )}
    >
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-canvas ring-1 ring-inset ring-line text-body">
        {icon ?? <IconSparkle />}
      </div>
      <h3 className="text-[18px] text-ink mb-1.5 text-balance">{title}</h3>
      {body && (
        <p className="text-[13.5px] text-slate max-w-[42ch] text-pretty leading-relaxed">
          {body}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* -------------------------------- skeleton -------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} />;
}

export function CardSkeleton() {
  return (
    <div className="surface p-0">
      <Skeleton className="h-40 w-full rounded-none" />
      <div className="p-4 space-y-2.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

/* --------------------------------- fields -------------------------------- */

export function Field({
  label,
  hint,
  error,
  children,
  required,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-body">
        {label}
        {required && <span className="text-brand-600">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1.5 block text-[12px] text-slate">{hint}</span>}
      {error && <span className="mt-1.5 block text-[12px] text-red-600">{error}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl bg-card px-3.5 py-2.5 text-[14px] text-ink ring-1 ring-inset ring-line " +
  "transition-colors placeholder:text-slate hover:ring-line-strong focus:ring-2 focus:ring-brand-500 focus:outline-none";

export const selectClass = inputClass + " appearance-none pr-9 cursor-pointer";

/* --------------------------------- icons ---------------------------------- */
/* Inline 20px stroke icons — no icon package, so nothing to load at runtime. */

const S = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Svg({ children, size = 20, className }: { children: ReactNode; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      {children}
    </svg>
  );
}

export const IconGrid = (p: { size?: number; className?: string }) => (
  <Svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" {...S} /><rect x="14" y="3" width="7" height="7" rx="1.5" {...S} /><rect x="3" y="14" width="7" height="7" rx="1.5" {...S} /><rect x="14" y="14" width="7" height="7" rx="1.5" {...S} /></Svg>
);
export const IconList = (p: { size?: number; className?: string }) => (
  <Svg {...p}><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" {...S} /></Svg>
);
export const IconCalendar = (p: { size?: number; className?: string }) => (
  <Svg {...p}><rect x="3" y="5" width="18" height="16" rx="2.5" {...S} /><path d="M3 10h18M8 3v4M16 3v4" {...S} /></Svg>
);
export const IconHome = (p: { size?: number; className?: string }) => (
  <Svg {...p}><path d="M3.5 10.5 12 4l8.5 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-6v6H5A1.5 1.5 0 0 1 3.5 19z" {...S} /></Svg>
);
export const IconTicket = (p: { size?: number; className?: string }) => (
  <Svg {...p}><path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5v2a2 2 0 0 0 0 4v2a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5v-2a2 2 0 0 0 0-4z" {...S} /><path d="M14 7v11" strokeDasharray="2 2.5" {...S} /></Svg>
);
export const IconInbox = (p: { size?: number; className?: string }) => (
  <Svg {...p}><path d="M3.5 13.5 6 5.5A1.5 1.5 0 0 1 7.4 4.5h9.2A1.5 1.5 0 0 1 18 5.5l2.5 8" {...S} /><path d="M3.5 13.5H8l1.2 2.5h5.6l1.2-2.5h4.5v4A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" {...S} /></Svg>
);
export const IconCheck = (p: { size?: number; className?: string }) => (
  <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7" {...S} /></Svg>
);
export const IconX = (p: { size?: number; className?: string }) => (
  <Svg {...p}><path d="M6 6l12 12M18 6 6 18" {...S} /></Svg>
);
export const IconClock = (p: { size?: number; className?: string }) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" {...S} /><path d="M12 7.5V12l3 2" {...S} /></Svg>
);
export const IconPin = (p: { size?: number; className?: string }) => (
  <Svg {...p}><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" {...S} /><circle cx="12" cy="10" r="2.5" {...S} /></Svg>
);
export const IconBell = (p: { size?: number; className?: string }) => (
  <Svg {...p}><path d="M6 9a6 6 0 1 1 12 0c0 3.5 1.5 5 1.5 5h-15S6 12.5 6 9z" {...S} /><path d="M10 18a2 2 0 0 0 4 0" {...S} /></Svg>
);
export const IconUsers = (p: { size?: number; className?: string }) => (
  <Svg {...p}><circle cx="9" cy="8" r="3.5" {...S} /><path d="M2.5 19.5a6.5 6.5 0 0 1 13 0" {...S} /><path d="M16 5.2a3.5 3.5 0 0 1 0 5.6M18 14.4a6.5 6.5 0 0 1 3.5 5.1" {...S} /></Svg>
);
export const IconUpload = (p: { size?: number; className?: string }) => (
  <Svg {...p}><path d="M12 15V4m0 0L8 8m4-4 4 4" {...S} /><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" {...S} /></Svg>
);
export const IconSearch = (p: { size?: number; className?: string }) => (
  <Svg {...p}><circle cx="11" cy="11" r="6.5" {...S} /><path d="m16 16 4.5 4.5" {...S} /></Svg>
);
export const IconShield = (p: { size?: number; className?: string }) => (
  <Svg {...p}><path d="M12 3.5 19 6v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" {...S} /><path d="m9 12 2 2 4-4" {...S} /></Svg>
);
export const IconSettings = (p: { size?: number; className?: string }) => (
  <Svg {...p}><circle cx="12" cy="12" r="3" {...S} /><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2 2M7.3 16.7l-2 2M18.7 18.7l-2-2M7.3 7.3l-2-2" {...S} /></Svg>
);
export const IconChart = (p: { size?: number; className?: string }) => (
  <Svg {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" {...S} /></Svg>
);
export const IconSparkle = (p: { size?: number; className?: string }) => (
  <Svg {...p}><path d="M12 3.5 13.7 9l5.3 1.7-5.3 1.8L12 18l-1.7-5.5L5 10.7 10.3 9z" {...S} /><path d="M18.5 3.5v3M20 5h-3" {...S} /></Svg>
);
export const IconAlert = (p: { size?: number; className?: string }) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" {...S} /><path d="M12 7.5v5M12 16h.01" {...S} /></Svg>
);
export const IconChevron = (p: { size?: number; className?: string }) => (
  <Svg {...p}><path d="m9 5 7 7-7 7" {...S} /></Svg>
);
export const IconPlus = (p: { size?: number; className?: string }) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" {...S} /></Svg>
);
export const IconEdit = (p: { size?: number; className?: string }) => (
  <Svg {...p}><path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5z" {...S} /></Svg>
);
export const IconNote = (p: { size?: number; className?: string }) => (
  <Svg {...p}><path d="M5 4.5h14v11l-4 4H5z" {...S} /><path d="M19 15.5h-4v4M8.5 9h7M8.5 13h4" {...S} /></Svg>
);
export const IconArchive = (p: { size?: number; className?: string }) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="4" rx="1.2" {...S} /><path d="M5 8v11a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8M10 12h4" {...S} /></Svg>
);
export const IconCamera = (p: { size?: number; className?: string }) => (
  <Svg {...p}><path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-2h8.2l1.2 2h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" {...S} /><circle cx="12" cy="12.5" r="3.5" {...S} /></Svg>
);
