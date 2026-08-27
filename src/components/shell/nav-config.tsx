import type { ReactNode } from "react";
import {
  IconHome,
  IconTicket,
  IconCalendar,
  IconInbox,
  IconCheck,
  IconUpload,
  IconUsers,
  IconSettings,
  IconChart,
  IconEdit,
  IconArchive,
  IconShield,
  IconPin,
} from "@/components/ui";
import type { Role } from "@/lib/constants";

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  /** Matches sub-routes too, e.g. /events/12 highlights Events. */
  match?: string;
  badgeKey?: "pendingRequests" | "myPending";
};

export type NavSection = { label?: string; items: NavItem[] };

export function navFor(role: Role): NavSection[] {
  const mine: NavSection = {
    items: [
      { href: "/dashboard", label: "Dashboard", icon: <IconHome /> },
      { href: "/events", label: "Events", icon: <IconTicket />, match: "/events" },
      { href: "/calendar", label: "Calendar", icon: <IconCalendar /> },
      { href: "/venues", label: "Venues", icon: <IconPin /> },
      {
        href: "/requests",
        label: "My Requests",
        icon: <IconInbox />,
        badgeKey: "myPending",
      },
      { href: "/schedule", label: "My Schedule", icon: <IconCheck /> },
      { href: "/history", label: "Coverage History", icon: <IconArchive /> },
    ],
  };

  if (role === "contributor") return [mine];

  const admin: NavSection = {
    label: "Editorial",
    items: [
      {
        href: "/admin/approvals",
        label: "Approval Center",
        icon: <IconCheck />,
        match: "/admin/approvals",
        badgeKey: "pendingRequests",
      },
      {
        href: "/admin/events",
        label: "Manage Events",
        icon: <IconEdit />,
        match: "/admin/events",
      },
      {
        href: "/admin/import",
        label: "Import Events",
        icon: <IconUpload />,
        match: "/admin/import",
      },
      {
        href: "/admin/contributors",
        label: "Contributors",
        icon: <IconUsers />,
        match: "/admin/contributors",
      },
      { href: "/admin/analytics", label: "Analytics", icon: <IconChart /> },
    ],
  };

  if (role === "admin") return [mine, admin];

  const superAdmin: NavSection = {
    label: "Administration",
    items: [
      { href: "/admin/activity", label: "Activity Log", icon: <IconArchive /> },
      { href: "/admin/backups", label: "Backups", icon: <IconShield /> },
      { href: "/admin/settings", label: "Settings", icon: <IconSettings /> },
    ],
  };

  return [mine, admin, superAdmin];
}

/** The five destinations that get a slot in the mobile tab bar. */
export function mobileNavFor(role: Role): NavItem[] {
  const base: NavItem[] = [
    { href: "/dashboard", label: "Home", icon: <IconHome /> },
    { href: "/events", label: "Events", icon: <IconTicket />, match: "/events" },
    { href: "/calendar", label: "Calendar", icon: <IconCalendar /> },
  ];
  if (role === "contributor")
    return [
      ...base,
      { href: "/requests", label: "Requests", icon: <IconInbox />, badgeKey: "myPending" },
      { href: "/schedule", label: "Schedule", icon: <IconCheck /> },
    ];
  return [
    ...base,
    {
      href: "/admin/approvals",
      label: "Approvals",
      icon: <IconCheck />,
      match: "/admin/approvals",
      badgeKey: "pendingRequests",
    },
    { href: "/schedule", label: "Schedule", icon: <IconInbox /> },
  ];
}
