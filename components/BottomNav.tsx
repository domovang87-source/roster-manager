"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain, Home, Kanban } from "lucide-react";

const navItems = [
  { href: "/home", label: "Home", Icon: Home },
  { href: "/roster", label: "Roster", Icon: Kanban },
  { href: "/logic-lab", label: "Logic Lab", Icon: Brain },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--rm-border)] bg-[var(--rm-bg)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-around px-6 py-3">
        {navItems.map(({ href, label, Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 text-xs tracking-wide ${
                isActive ? "text-[var(--rm-text)]" : "text-[var(--rm-text-muted)]"
              }`}
            >
              <Icon size={18} strokeWidth={1.25} />
              <span className="uppercase">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
