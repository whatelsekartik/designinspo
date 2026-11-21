"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bookmark, Menu, Search, Sparkles, X } from "lucide-react";
import { Wordmark } from "./Logo";
import { SearchOverlay } from "./SearchOverlay";
import { api, cx } from "@/lib/client";

interface Stats {
  images: number;
  saved: number;
  agent: { configured: boolean; running: boolean; provider: string; model: string };
}

export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    let active = true;
    api<Stats>("/api/stats")
      .then((d) => active && setStats(d))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [pathname]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((s) => !s);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const nav = [
    { href: "/", label: "Discover" },
    { href: "/collections", label: "Collections" },
    { href: "/studio", label: "AI Studio" },
  ];

  const agentState = !stats?.agent.configured ? "waiting" : stats.agent.running ? "running" : "paused";

  return (
    <>
      <header
        className={cx(
          "fixed inset-x-0 top-0 z-50 transition-all duration-500",
          scrolled ? "border-b border-white/[0.07] bg-[rgba(10,8,7,0.78)] backdrop-blur-xl" : "border-b border-transparent",
        )}
      >
        <div className="mx-auto flex h-[64px] max-w-[1840px] items-center justify-between gap-6 px-4 md:px-7">
          <Link href="/" className="group flex shrink-0 items-center gap-3" aria-label="INFINITE home">
            <Wordmark />
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cx(
                    "relative rounded-full px-3.5 py-2 text-[12.5px] transition-colors",
                    active ? "text-paper" : "text-paper/55 hover:text-paper/90",
                  )}
                >
                  {item.label}
                  {active && <span className="absolute inset-x-3 -bottom-[1px] h-px bg-paper/70" />}
                  {item.href === "/studio" && (
                    <span className="ml-2 inline-flex align-middle">
                      <span className="pulse-dot" data-state={agentState} />
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSearchOpen(true)}
              className="group hidden items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.03] py-2 pl-3.5 pr-2.5 text-[12px] text-paper/50 transition hover:border-white/20 hover:text-paper/80 sm:flex"
            >
              <Search size={13} />
              <span className="pr-6">Search the universe</span>
              <kbd className="mono rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] text-paper/40">⌘K</kbd>
            </button>
            <button onClick={() => setSearchOpen(true)} className="icon-btn sm:hidden" aria-label="Search">
              <Search size={15} />
            </button>

            <Link href="/collections" className="relative hidden h-9 items-center gap-2 rounded-full px-3 text-[12px] text-paper/60 transition hover:bg-white/5 hover:text-paper sm:flex">
              <Bookmark size={14} />
              <span className="mono text-[11px]">{stats?.saved ?? 0}</span>
            </Link>

            <Link href="/studio" className="hidden h-9 items-center gap-2 rounded-full border border-white/10 px-3.5 text-[12px] text-paper/80 transition hover:border-white/25 hover:bg-white/5 md:flex">
              <Sparkles size={13} className="text-ember" />
              Agent
            </Link>

            <button onClick={() => setMenuOpen((m) => !m)} className="icon-btn md:hidden" aria-label="Menu">
              {menuOpen ? <X size={15} /> : <Menu size={15} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="border-t border-white/10 bg-[rgba(10,8,7,0.96)] px-4 pb-4 pt-2 backdrop-blur-xl md:hidden">
            {[{ href: "/", label: "Discover" }, { href: "/collections", label: "Collections" }, { href: "/studio", label: "AI Studio" }, { href: "/setup", label: "Setup" }].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-between border-b border-white/5 py-3.5 text-[14px] text-paper/80 last:border-0"
              >
                {item.label}
                {item.href === "/studio" && <span className="pulse-dot" data-state={agentState} />}
              </Link>
            ))}
          </div>
        )}
      </header>
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
