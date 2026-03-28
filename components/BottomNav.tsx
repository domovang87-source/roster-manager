"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Home, Kanban, Settings } from "lucide-react";

const navItems = [
  { href: "/home", label: "Home", Icon: Home },
  { href: "/inbox", label: "Log", Icon: ClipboardList },
  { href: "/roster", label: "Roster", Icon: Kanban },
  { href: "/logic-lab", label: "Settings", Icon: Settings },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--rm-border)] bg-[var(--rm-bg)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-around px-4 py-2 sm:px-6">
        {navItems.map(({ href, label, Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 text-[10px] tracking-wide sm:gap-1 sm:text-xs ${
                isActive ? "text-[var(--rm-text)]" : "text-[var(--rm-text-muted)]"
              }`}
            >
              <Icon size={17} strokeWidth={1.25} />
              <span className="uppercase">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
