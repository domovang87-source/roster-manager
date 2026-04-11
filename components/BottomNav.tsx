"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MessageSquare, Users, Settings } from "lucide-react";

const navItems = [
  { href: "/home", label: "Home", Icon: Home },
  { href: "/inbox", label: "Texts", Icon: MessageSquare },
  { href: "/roster", label: "People", Icon: Users },
  { href: "/settings", label: "Settings", Icon: Settings },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--rm-border)] bg-[var(--rm-bg)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-2.5">
        {navItems.map(({ href, label, Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 text-[11px] tracking-wide transition ${
                isActive
                  ? "text-[var(--rm-accent)]"
                  : "text-[var(--rm-text-muted)] hover:text-[var(--rm-text)]"
              }`}
            >
              <Icon size={20} strokeWidth={isActive ? 1.75 : 1.25} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
