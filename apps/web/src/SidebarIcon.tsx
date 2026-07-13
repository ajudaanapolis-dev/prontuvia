import type { ReactNode } from "react";

type IconName =
  | "home"
  | "calendar"
  | "patients"
  | "record"
  | "documents"
  | "finance"
  | "reports"
  | "communication"
  | "security"
  | "settings";

const paths: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="M3 10.8 12 3l9 7.8" />
      <path d="M5.5 9.5V21h13V9.5" />
      <path d="M9 21v-7h6v7" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4M17 3v4M3 10h18" />
      <path d="M7 14h3M14 14h3M7 18h3" />
    </>
  ),
  patients: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15 15c3.5-.6 5.4 1.1 5.8 4" />
    </>
  ),
  record: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v5h5M9 12h7M9 16h7" />
      <path d="M3.5 7.5v13H15" />
    </>
  ),
  documents: (
    <>
      <rect x="4" y="4" width="13" height="16" rx="2" />
      <path d="M8 8h5M8 12h5M8 16h4" />
      <path d="M17 8h3v12a2 2 0 0 1-2 2H8" />
    </>
  ),
  finance: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h3" />
      <circle cx="17" cy="15" r="1.5" />
    </>
  ),
  reports: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      <path d="m4 7 6-5 6 7 5-5" />
    </>
  ),
  communication: (
    <>
      <path d="M21 11.5a8.2 8.2 0 0 1-8.5 8.1 9.4 9.4 0 0 1-3.8-.8L3 20.5l1.7-5.3A8.2 8.2 0 1 1 21 11.5Z" />
      <path d="M8.5 9.5h7M8.5 13h4.5" />
    </>
  ),
  security: (
    <>
      <path d="M12 2 20 5v6c0 5.2-3.2 9.2-8 11-4.8-1.8-8-5.8-8-11V5z" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
};

export function SidebarIcon({ name }: { name: IconName }) {
  return (
    <svg
      className="sidebar-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
