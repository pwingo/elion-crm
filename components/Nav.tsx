"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@/app/providers";

const navLinks = [
  { href: "/queue", label: "My Queue" },
  { href: "/contacts", label: "Contacts" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const { user } = useUser();
  const pathname = usePathname();

  if (!user) return null;

  return (
    <nav className="border-b border-[var(--border)] bg-white">
      <div className="mx-auto max-w-6xl px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-[var(--primary)] text-lg tracking-tight">
            Elion
          </span>
          <div className="flex items-center gap-1">
            {navLinks.map(({ href, label }) => {
              const isActive =
                pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    "px-3 py-1.5 rounded text-sm font-medium transition-colors",
                    isActive
                      ? "bg-[var(--primary)] text-white"
                      : "text-gray-600 hover:bg-gray-100",
                  ].join(" ")}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
        <span className="text-sm text-[var(--muted-foreground)]">
          {user.name}
        </span>
      </div>
    </nav>
  );
}
