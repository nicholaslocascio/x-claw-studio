"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type NavItem = {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Start",
    items: [
      { href: "/", label: "Home", match: (pathname: string) => pathname === "/" },
    ]
  },
  {
    title: "Capture",
    items: [
      { href: "/control", label: "Capture", match: (pathname: string) => pathname.startsWith("/control") },
      { href: "/priority-accounts", label: "Priority Accounts", match: (pathname: string) => pathname.startsWith("/priority-accounts") },
    ]
  },
  {
    title: "Review",
    items: [
      { href: "/queue", label: "Media Review", match: (pathname: string) => pathname.startsWith("/queue") || pathname.startsWith("/usage/") },
      {
        href: "/matches",
        label: "Similar Media",
        match: (pathname: string) => pathname.startsWith("/matches") || pathname.startsWith("/phash")
      },
    ]
  },
  {
    title: "Compose",
    items: [
      { href: "/replies", label: "Replies", match: (pathname: string) => pathname.startsWith("/replies") },
      { href: "/clone", label: "Clone Tweet", match: (pathname: string) => pathname.startsWith("/clone") },
      { href: "/drafts", label: "Draft History", match: (pathname: string) => pathname.startsWith("/drafts") },
    ]
  },
  {
    title: "Research",
    items: [
      { href: "/topics", label: "Topics", match: (pathname: string) => pathname.startsWith("/topics") },
      { href: "/search", label: "Media Search", match: (pathname: string) => pathname.startsWith("/search") },
      { href: "/tweets", label: "Captured Tweets", match: (pathname: string) => pathname.startsWith("/tweets") },
      { href: "/wishlist", label: "Wishlist", match: (pathname: string) => pathname.startsWith("/wishlist") },
    ]
  }
];

function resolveContextLabel(pathname: string): string | null {
  if (pathname.startsWith("/usage/")) {
    return "Media detail";
  }

  if (pathname.startsWith("/queue")) {
    return "Media review";
  }

  if (pathname.startsWith("/control")) {
    return "Capture and runs";
  }

  if (pathname.startsWith("/priority-accounts")) {
    return "Priority accounts";
  }

  if (pathname.startsWith("/replies")) {
    return "Compose";
  }

  if (pathname.startsWith("/clone")) {
    return "Clone tweet";
  }

  if (pathname.startsWith("/matches") || pathname.startsWith("/phash")) {
    return "Similar media";
  }

  if (pathname.startsWith("/topics")) {
    return "Topics";
  }

  if (pathname.startsWith("/search")) {
    return "Media search";
  }

  if (pathname.startsWith("/tweets")) {
    return "Captured tweets";
  }

  if (pathname.startsWith("/wishlist")) {
    return "Wishlist";
  }

  if (pathname.startsWith("/drafts")) {
    return "Draft history";
  }

  return null;
}

export function AppTopNav() {
  const pathname = usePathname();
  const contextLabel = resolveContextLabel(pathname);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="app-top-nav-shell">
      <div className="app-top-nav terminal-window">
        <div className="window-bar">
          <div className="min-w-0">
            <Link href="/" className="inline-flex items-center gap-3 text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan">
              <span className="section-kicker">Twitter Trend</span>
              <span className="hidden text-sm text-muted sm:inline">
                Capture, review, and draft from local data
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            {contextLabel ? <span className="hidden tt-chip sm:inline-flex">{contextLabel}</span> : null}
            <button
              type="button"
              className="tt-link min-w-11 px-3 md:hidden"
              aria-expanded={menuOpen}
              aria-controls="app-primary-nav"
              onClick={() => setMenuOpen((current) => !current)}
            >
              <span>{menuOpen ? "Close" : "Menu"}</span>
            </button>
          </div>
        </div>

        <nav
          id="app-primary-nav"
          aria-label="Primary"
          className={`panel-body pt-4 ${menuOpen ? "block" : "hidden md:block"}`}
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-400">Jump directly to any workspace from the header.</div>
            {contextLabel ? <span className="tt-chip sm:hidden">{contextLabel}</span> : null}
          </div>
          <div className="grid gap-4">
            {NAV_SECTIONS.map((section) => (
              <div key={section.title} className="grid gap-2">
                <div className="tt-data-label">{section.title}</div>
                <div className="grid gap-2 sm:flex sm:flex-wrap">
                  {section.items.map((item) => {
                    const active = item.match(pathname);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={active ? "tt-button" : "tt-link"}
                        onClick={() => setMenuOpen(false)}
                      >
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>
      </div>
    </header>
  );
}
