"use client";

import Link from "next/link";
import { BrandMark } from "@/components/public/brand-mark";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  Grid3X3,
  Building2,
  MessageSquare,
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
  Wallet,
  FileSignature,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/use-locale";
import { LanguageSwitcher } from "@/components/shared/language-switcher";

const navItems = [
  { href: "/admin", icon: LayoutDashboard, labelKey: "admin.sidebar.dashboard" },
  { href: "/admin/eveniment-nou", icon: PartyPopper, labelKey: "admin.sidebar.newEvent" },
  { href: "/admin/cereri-inregistrare", icon: UserCheck, labelKey: "admin.sidebar.signupRequests" },
  { href: "/admin/cereri-oferte", icon: Star, labelKey: "admin.sidebar.offerRequests" },
  { href: "/admin/crm", icon: MessageSquare, labelKey: "admin.sidebar.crm" },
  { href: "/admin/finante", icon: Wallet, labelKey: "admin.sidebar.finance" },
  { href: "/admin/contracte", icon: FileSignature, labelKey: "admin.sidebar.contracts" },
  { href: "/admin/artisti", icon: Users, labelKey: "admin.sidebar.artists" },
  { href: "/admin/categorii", icon: Grid3X3, labelKey: "admin.sidebar.categories" },
  { href: "/admin/sali", icon: Building2, labelKey: "admin.sidebar.venues" },
  { href: "/admin/recenzii", icon: Star, labelKey: "admin.sidebar.reviews" },
  { href: "/admin/foto-ugc", icon: Camera, labelKey: "admin.sidebar.ugcPhotos" },
  { href: "/admin/blog", icon: FileText, labelKey: "admin.sidebar.blog" },
  { href: "/admin/pagini", icon: FileText, labelKey: "admin.sidebar.pages" },
  { href: "/admin/meta", icon: Globe, labelKey: "admin.sidebar.metaPages" },
  { href: "/admin/seo", icon: Globe, labelKey: "admin.sidebar.seo" },
  { href: "/admin/import", icon: Upload, labelKey: "admin.sidebar.import" },
  { href: "/admin/homepage-builder", icon: Home, labelKey: "admin.sidebar.homepage" },
  { href: "/admin/statistici", icon: BarChart3, labelKey: "admin.sidebar.statistics" },
  { href: "/admin/analytics", icon: BarChart3, labelKey: "admin.sidebar.analytics" },
  { href: "/admin/ai-assistant", icon: Bot, labelKey: "admin.sidebar.aiAssistant" },
  { href: "/admin/duplicates", icon: GitMerge, labelKey: "admin.sidebar.duplicates" },
  { href: "/admin/audit", icon: FileText, labelKey: "admin.sidebar.auditLog" },
  { href: "/admin/setari", icon: Settings, labelKey: "admin.sidebar.settings" },
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
  const { t } = useLocale();
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
            title={collapsed ? t(item.labelKey) : undefined}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{t(item.labelKey)}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminSidebar() {
  const { t } = useLocale();
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
            <BrandMark className="h-6 w-6" />
            <span className="font-heading text-lg font-bold">
              Admin
            </span>
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            collapsed
              ? t("admin.sidebar.expandMenu")
              : t("admin.sidebar.collapseMenu")
          }
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
        {!collapsed && <LanguageSwitcher />}
        <Link
          href="/"
          target="_blank"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-gold",
            collapsed && "justify-center px-0",
          )}
        >
          <Globe className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{t("dashboard.viewSite")}</span>}
        </Link>
      </div>
    </aside>

      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label={t("admin.sidebar.openMenu")}
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
                <BrandMark className="h-6 w-6" />
                <span className="font-heading text-lg font-bold">
                  Admin
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label={t("admin.sidebar.closeMenu")}
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
              <LanguageSwitcher />
              <Link
                href="/"
                target="_blank"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-gold"
              >
                <Globe className="h-4 w-4 shrink-0" />
                <span>{t("dashboard.viewSite")}</span>
              </Link>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
