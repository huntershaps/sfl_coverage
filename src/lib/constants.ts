export const ROLES = ["super_admin", "admin", "contributor"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin / Editor",
  contributor: "Contributor",
};

export const EVENT_CATEGORIES = [
  "Concert",
  "Music Festival",
  "Sporting Event",
  "Theater",
  "Comedy",
  "Nightlife",
  "Restaurant Event",
  "Food & Drink",
  "Grand Opening",
  "Community Event",
  "Arts & Culture",
  "Fashion",
  "Celebrity Appearance",
  "Conference",
  "Family Event",
  "Other",
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const EVENT_STATUSES = [
  "draft",
  "upcoming",
  "open",
  "requests_pending",
  "assigned",
  "full",
  "cancelled",
  "postponed",
  "archived",
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  draft: "Draft",
  upcoming: "Upcoming",
  open: "Open for Coverage",
  requests_pending: "Requests Pending",
  assigned: "Coverage Assigned",
  full: "Fully Covered",
  cancelled: "Cancelled",
  postponed: "Postponed",
  archived: "Archived",
};

export const REQUEST_STATUSES = [
  "pending",
  "under_review",
  "approved",
  "rejected",
  "waitlisted",
  "withdrawn",
  "cancelled",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "Pending",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Not Approved",
  waitlisted: "Waitlisted",
  withdrawn: "Withdrawn",
  cancelled: "Cancelled",
};

/** Contributor-facing copy for each request state. Deliberately non-harsh on rejection. */
export const REQUEST_STATUS_MESSAGE: Record<RequestStatus, string> = {
  pending: "Your request to cover this event has been submitted.",
  under_review: "Your request is currently being reviewed.",
  approved: "You have been approved to cover this event.",
  rejected: "This one went another direction. Thanks for putting your name in.",
  waitlisted: "You're on the waitlist. We'll reach out if a spot opens up.",
  withdrawn: "You withdrew this request.",
  cancelled: "This request was cancelled.",
};

export const COVERAGE_TYPES = [
  "photography",
  "video",
  "article",
  "interview",
  "social",
  "other",
] as const;
export type CoverageType = (typeof COVERAGE_TYPES)[number];

export const COVERAGE_TYPE_LABEL: Record<CoverageType, string> = {
  photography: "Photography",
  video: "Video",
  article: "Article / Review",
  interview: "Interview",
  social: "Social Media",
  other: "Other",
};

export const SPECIALTIES = [
  "photography",
  "videography",
  "writing",
  "interviews",
  "social",
  "other",
] as const;

export const SPECIALTY_LABEL: Record<string, string> = {
  photography: "Photography",
  videography: "Videography",
  writing: "Writing",
  interviews: "Interviews",
  social: "Social Media",
  other: "Other",
};

export const ASSIGNMENT_STATUSES = ["active", "removed", "completed"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

/** Statuses that occupy a coverage slot. */
export const OCCUPYING_STATUSES: AssignmentStatus[] = ["active", "completed"];
