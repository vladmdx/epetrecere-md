"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  Grid3X3,
  Building2,
  MessageSquare,
  CalendarDays,
  FileText,
  Globe,
  Upload,
  Settings,
  Home,
  BarChart3,
  Bot,
  PanelLeftClose,
  PanelLeft,
  Sparkles,
  Star,
  Camera,
  UserCheck,
  PartyPopper,
  Menu,
  X,
  GitMerge,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/admin", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/admin/eveniment-nou", icon: PartyPopper, label: "Eveniment Nou" },
  { href: "/admin/cereri-inregistrare", icon: UserCheck, label: "Cereri Înregistrare" },
  { href: "/admin/cereri-oferte", icon: Star, label: "Cereri Oferte" },
  { href: "/admin/crm", icon: MessageSquare, label: "CRM" },
  { href: "/admin/artisti", icon: Users, label: "Artiști" },
  { href: "/admin/categorii", icon: Grid3X3, label: "Categorii" },
  { href: "/admin/sali", icon: Building2, label: "Săli" },
  { href: "/admin/recenzii", icon: Star, label: "Recenzii" },
  { href: "/admin/foto-ugc", icon: Camera, label: "Fotografii UGC" },
  { href: "/admin/blog", icon: FileText, label: "Blog" },
  { href: "/admin/pagini", icon: FileText, label: "Pagini" },
  { href: "/admin/seo", icon: Globe, label: "SEO" },
  { href: "/admin/import", icon: Upload, label: "Import" },
  { href: "/admin/homepage-builder", icon: Home, label: "Homepage" },
  { href: "/admin/analytics", icon: BarChart3, label: "Analitice" },
  { href: "/admin/ai-assistant", icon: Bot, label: "AI Assistant" },
  { href: "/admin/duplicates", icon: GitMerge, label: "Duplicate" },
  { href: "/admin/audit", icon: FileText, label: "Audit log" },
  { href: "/admin/setari", icon: Settings, label: "Setări" },
];

function NavList({
  pathname,
  collapsed,
  onNavigate,
}: {
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto p-2">
      {navItems.map((item) => {
        const isActive =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-gold/10 text-gold"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              collapsed && "justify-center px-0",
            )}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
    <aside
      className={cn(
        "hidden h-screen lg:flex flex-col border-r border-border/40 bg-sidebar transition-all duration-300",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-border/40 px-4">
        {!collapsed && (
          <Link href="/admin" className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-gold" />
            <span className="font-heading text-lg font-bold">
              e<span className="text-gold">P</span> Admin
            </span>
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label={collapsed ? "Extinde meniul" : "Restrânge meniul"}
          onClick={() => setCollapsed(!collapsed)}
          className="shrink-0"
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Nav */}
      <NavList pathname={pathname} collapsed={collapsed} />

      {/* View Site */}
      <div className="border-t border-border/40 p-2">
        <Link
          href="/"
          target="_blank"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-gold",
            collapsed && "justify-center px-0",
          )}
        >
          <Globe className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Vezi site</span>}
        </Link>
      </div>
    </aside>

      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Deschide meniul"
        className="fixed left-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-lg border border-border/40 bg-background/90 backdrop-blur-sm text-foreground shadow-sm lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-border/40 bg-sidebar shadow-2xl animate-in slide-in-from-left">
            <div className="flex h-16 items-center justify-between border-b border-border/40 px-4">
              <Link
                href="/admin"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2"
              >
                <Sparkles className="h-5 w-5 text-gold" />
                <span className="font-heading text-lg font-bold">
                  e<span className="text-gold">P</span> Admin
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Închide meniul"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent/50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <NavList
              pathname={pathname}
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
            />
            <div className="border-t border-border/40 p-2">
              <Link
                href="/"
                target="_blank"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-gold"
              >
                <Globe className="h-4 w-4 shrink-0" />
                <span>Vezi site</span>
              </Link>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
