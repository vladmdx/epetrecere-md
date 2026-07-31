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
import { useLocale } from "@/hooks/use-locale";
import { LanguageSwitcher } from "@/components/shared/language-switcher";

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
  { href: "/admin/meta", icon: Globe, label: "Meta Pagini" },
  { href: "/admin/seo", icon: Globe, label: "SEO" },
  { href: "/admin/import", icon: Upload, label: "Import" },
  { href: "/admin/homepage-builder", icon: Home, label: "Homepage" },
  { href: "/admin/analytics", icon: BarChart3, label: "Analitice" },
  { href: "/admin/ai-assistant", icon: Bot, label: "AI Assistant" },
  { href: "/admin/duplicates", icon: GitMerge, label: "Duplicate" },
  { href: "/admin/audit", icon: FileText, label: "Audit log" },
  { href: "/admin/setari", icon: Settings, label: "Setări" },
];

const translatedLabels: Record<"ro" | "ru" | "en", Record<string, string>> = {
  ro: {},
  ru: {
    Dashboard: "Панель управления",
    "Eveniment Nou": "Новое событие",
    "Cereri Înregistrare": "Заявки на регистрацию",
    "Cereri Oferte": "Запросы предложений",
    Artiști: "Артисты",
    Categorii: "Категории",
    Săli: "Залы",
    Recenzii: "Отзывы",
    "Fotografii UGC": "Фотографии UGC",
    Blog: "Блог",
    Pagini: "Страницы",
    "Meta Pagini": "Мета страниц",
    Import: "Импорт",
    Homepage: "Главная",
    Analitice: "Аналитика",
    Duplicate: "Дубликаты",
    "Audit log": "Журнал аудита",
    Setări: "Настройки",
  },
  en: {
    Dashboard: "Dashboard",
    "Eveniment Nou": "New Event",
    "Cereri Înregistrare": "Registration Requests",
    "Cereri Oferte": "Quote Requests",
    Artiști: "Artists",
    Categorii: "Categories",
    Săli: "Venues",
    Recenzii: "Reviews",
    "Fotografii UGC": "UGC Photos",
    Blog: "Blog",
    Pagini: "Pages",
    "Meta Pagini": "Page Metadata",
    Import: "Import",
    Homepage: "Homepage",
    Analitice: "Analytics",
    Duplicate: "Duplicates",
    "Audit log": "Audit Log",
    Setări: "Settings",
  },
};

function NavList({
  pathname,
  collapsed,
  onNavigate,
}: {
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { locale } = useLocale();
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
            title={collapsed ? translatedLabels[locale][item.label] || item.label : undefined}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{translatedLabels[locale][item.label] || item.label}</span>}
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
