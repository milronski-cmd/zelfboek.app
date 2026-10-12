"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "Cijfers" },
  { href: "/admin/klanten", label: "Klanten" },
  { href: "/admin/feedback", label: "Feedback" },
  { href: "/admin/storingen", label: "Storingen" },
  { href: "/admin/logboek", label: "Logboek" },
];

export function AdminMenu() {
  const pad = usePathname();
  return (
    <nav aria-label="Beheer" className="order-last -mx-1 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto">
      {ITEMS.map((i) => {
        const actief = i.href === "/admin" ? pad === "/admin" : pad.startsWith(i.href);
        return <Link key={i.href} href={i.href} aria-current={actief ? "page" : undefined} className={actief ? "chip chip-actief shrink-0" : "chip shrink-0"}>{i.label}</Link>;
      })}
    </nav>
  );
}
