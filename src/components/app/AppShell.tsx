import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  BookOpen,
  ChevronDown,
  CreditCard,
  GitFork,
  Inbox,
  LayoutDashboard,
  LogOut,
  Moon,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Plug,
  Radio,
  Settings,
  Share2,
  Shield,
  Sparkles,
  Sun,
  Upload,
  User,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { useAuth } from "@/lib/auth-context";
import { CommandBarProvider } from "@/components/intelligence/AuditXCommandBar";
import {
  NotificationBell,
  NotificationCenter,
} from "@/components/notifications/NotificationCenter";
import { usePendingApprovals } from "@/lib/data-hooks";
import { useAgentHeartbeat } from "@/lib/use-agent-heartbeat";
import { useTheme } from "@/lib/theme-context";

const SIDEBAR_KEY = "wab.sidebar.expanded";
function readSidebarPref(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "true";
  } catch {
    return false;
  }
}
function writeSidebarPref(v: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SIDEBAR_KEY, String(v));
  } catch {
    /* ignore */
  }
}

const primaryItem = { label: "Ask Wab", icon: Sparkles, to: "/app/parser" } as const;

const navGroups = [
  {
    title: "Workspace",
    items: [
      { label: "Portfolio", icon: LayoutDashboard, to: "/app/overview" },
      { label: "Ledger", icon: BookOpen, to: "/app/ledger" },
      { label: "Exceptions", icon: GitFork, to: "/app/reconciliation" },
      { label: "Data Sources", icon: Plug, to: "/app/sources" },
      { label: "Integrations", icon: Share2, to: "/app/integrations" },
      { label: "Tax Center", icon: BarChart3, to: "/app/tax" },
      { label: "Audit Trail", icon: Shield, to: "/app/audit-trail" },
    ],
  },
  {
    title: "Autonomous",
    items: [
      { label: "Activity Feed", icon: Radio, to: "/app/activity" },
      { label: "Review Inbox", icon: Inbox, to: "/app/review" },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Settings", icon: Settings, to: "/app/settings" },
      { label: "Billing", icon: CreditCard, to: "/app/billing" },
    ],
  },
] as const;

const mobileTabs = [
  { label: "Ask Wab", icon: Sparkles, to: "/app/parser" },
  { label: "Portfolio", icon: LayoutDashboard, to: "/app/overview" },
  { label: "Ledger", icon: BookOpen, to: "/app/ledger" },
  { label: "Review", icon: Inbox, to: "/app/review" },
] as const;

function NavItem({
  label,
  icon: Icon,
  to,
  active,
  collapsed,
  accent,
  badge,
  onClick,
}: {
  label: string;
  icon: typeof LayoutDashboard;
  to: string;
  active: boolean;
  collapsed: boolean;
  accent?: boolean;
  badge?: number;
  onClick?: (() => void) | undefined;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      title={label}
      className={`relative flex items-center rounded-xl text-sm font-medium transition-all ${
        collapsed ? "size-10 justify-center" : "gap-3 px-3 py-2.5"
      }`}
      style={{
        background: active || accent ? "var(--sidebar-accent)" : "transparent",
        color: active || accent ? "var(--sidebar-primary)" : "var(--sidebar-foreground)",
        opacity: active || accent ? 1 : 0.72,
      }}
      onMouseEnter={(e) => {
        if (!active && !accent) (e.currentTarget as HTMLElement).style.background = "var(--sidebar-accent)";
      }}
      onMouseLeave={(e) => {
        if (!active && !accent) (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      <Icon size={18} strokeWidth={1.75} />
      {!collapsed && <span className="truncate">{label}</span>}
      {badge != null && badge > 0 && (
        <span
          className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
          style={{ background: "var(--bad)", color: "#fff" }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      {collapsed && badge != null && badge > 0 && (
        <span
          className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
          style={{ background: "var(--bad)", color: "#fff" }}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );
}

function InnerShell({ children }: { children: ReactNode }) {
  const { user, profile, signOut } = useAuth();
  const nav = useNavigate();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const { setTheme, actualTheme } = useTheme();

  const [expanded, setExpanded] = useState(() => readSidebarPref());
  const [moreOpen, setMoreOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const { data: pendingApprovals } = usePendingApprovals(profile?.org_id);
  const reviewBadge = (pendingApprovals ?? []).length;

  useAgentHeartbeat(!!profile?.org_id);

  useEffect(() => {
    writeSidebarPref(expanded);
  }, [expanded]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleSignOut() {
    await signOut();
    setUserMenuOpen(false);
    nav({ to: "/" });
  }

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "User";
  const orgName = profile?.org_name || "My Organisation";
  const plan = profile?.plan || "free";
  const isAskPage = currentPath.startsWith("/app/parser");
  const initials = displayName.charAt(0).toUpperCase();
  const avatarUrl = (profile?.avatar_url || user?.user_metadata?.["avatar_url"]) as string | undefined;

  const isActive = (to: string) => currentPath === to || currentPath.startsWith(to + "/");
  const tabActive = mobileTabs.some((tab) => isActive(tab.to));

  function SidebarContent({ collapsed, onClose }: { collapsed: boolean; onClose?: () => void }) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className={`shrink-0 ${collapsed ? "flex flex-col items-center gap-3 p-3" : "p-4"}`}>
          <div className="flex w-full items-center justify-between">
            {collapsed ? (
              <button
                type="button"
                aria-label="Expand navigation"
                onClick={() => (onClose ? onClose() : setExpanded(true))}
                className="flex size-9 items-center justify-center rounded-xl transition-colors hover:bg-surface-hover"
                style={{ background: "var(--sidebar)", border: "1px solid var(--sidebar-border)" }}
              >
                <LogoMark size={20} />
              </button>
            ) : (
              <>
                <Link to="/app/parser" aria-label="Wab home">
                  <Logo />
                </Link>
                <button
                  type="button"
                  aria-label="Collapse navigation"
                  onClick={() => setExpanded(false)}
                  className="flex size-8 items-center justify-center rounded-xl transition-colors hover:bg-surface-hover"
                  title="Collapse sidebar"
                >
                  <PanelLeft size={16} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
                </button>
              </>
            )}
          </div>

          {!collapsed && (
            <div
              className="mt-4 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs"
              style={{ background: "var(--sidebar-accent)", border: "1px solid var(--sidebar-border)" }}
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{orgName}</p>
                <p style={{ color: "var(--ink-3)" }}>
                  {plan.toUpperCase()} plan
                </p>
              </div>
              <ChevronDown size={14} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
            </div>
          )}
        </div>

        <nav
          className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-thin ${
            collapsed ? "flex flex-col items-center gap-1 px-3" : "space-y-4 px-4"
          }`}
        >
          <NavItem
            label={primaryItem.label}
            icon={primaryItem.icon}
            to={primaryItem.to}
            collapsed={collapsed}
            accent
            active={isActive(primaryItem.to)}
            onClick={onClose}
          />

          {navGroups.map((group) => (
            <div
              key={group.title}
              className={collapsed ? "flex flex-col items-center gap-1" : "space-y-0.5"}
            >
              {!collapsed && (
                <p
                  className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--sidebar-primary)", opacity: 0.45 }}
                >
                  {group.title}
                </p>
              )}
              {collapsed && (
                <div className="my-1 h-px w-6" style={{ background: "var(--sidebar-border)" }} />
              )}
              {group.items.map((item) => (
                <NavItem
                  key={item.label}
                  label={item.label}
                  icon={item.icon}
                  to={item.to}
                  collapsed={collapsed}
                  active={isActive(item.to)}
                  badge={item.to === "/app/review" ? reviewBadge : undefined}
                  onClick={onClose}
                />
              ))}
            </div>
          ))}
        </nav>

        <div ref={collapsed ? undefined : userMenuRef} className="relative shrink-0 p-3">
          <button
            type="button"
            onClick={() => setUserMenuOpen((v) => !v)}
            title={displayName}
            className={`flex w-full items-center rounded-xl transition-colors ${
              collapsed ? "justify-center py-2" : "gap-3 px-3 py-2.5"
            }`}
            style={{ color: "var(--sidebar-foreground)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sidebar-accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <div
              className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold"
              style={{
                background: avatarUrl ? "transparent" : "var(--color-accent)",
                color: "var(--accent-fg)",
              }}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="size-full object-cover" />
              ) : (
                initials
              )}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium">{displayName}</p>
                <p className="truncate text-xs" style={{ color: "var(--ink-3)" }}>
                  {user?.email ?? ""}
                </p>
              </div>
            )}
          </button>

          <AnimatePresence>
            {userMenuOpen && (
              <motion.div
                ref={collapsed ? userMenuRef : undefined}
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: 0.16 }}
                className="overflow-hidden rounded-2xl p-2"
                style={{
                  position: collapsed ? "fixed" : "absolute",
                  ...(collapsed
                    ? { bottom: "16px", left: "72px", minWidth: 220 }
                    : {
                        bottom: "100%",
                        left: "12px",
                        right: "12px",
                        marginBottom: "4px",
                        minWidth: 180,
                      }),
                  zIndex: 9999,
                  border: "1px solid var(--sidebar-border)",
                  background: "var(--sidebar)",
                  boxShadow: "var(--shadow-hover)",
                }}
              >
                <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
                  <div
                    className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold"
                    style={{
                      background: avatarUrl ? "transparent" : "var(--color-accent)",
                      color: "var(--accent-fg)",
                    }}
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={displayName} className="size-full object-cover" />
                    ) : (
                      initials
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{displayName}</p>
                    <p className="truncate text-xs" style={{ color: "var(--ink-3)" }}>
                      {user?.email ?? ""}
                    </p>
                  </div>
                </div>
                <div className="my-1 h-px" style={{ background: "var(--sidebar-border)" }} />
                <Link
                  to="/app/settings"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors"
                  style={{ color: "var(--sidebar-foreground)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sidebar-accent)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <User size={16} strokeWidth={1.75} />
                  Account settings
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors"
                  style={{ color: "var(--bad)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sidebar-accent)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <LogOut size={16} strokeWidth={1.75} />
                  Sign out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-dvh h-screen overflow-hidden"
      style={{
        background: "var(--color-login-bg)",
        fontFamily: "var(--font-body)",
        color: "var(--color-text)",
      }}
    >
      <motion.aside
        animate={{ width: expanded ? 248 : 64 }}
        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
        className="relative hidden h-dvh h-screen min-h-0 shrink-0 overflow-hidden lg:sticky lg:top-0 lg:flex lg:flex-col"
        style={{ background: "var(--sidebar)", borderRight: "1px solid var(--sidebar-border)" }}
      >
        <SidebarContent collapsed={!expanded} />
        {!expanded && (
          <button
            type="button"
            aria-label="Expand navigation"
            onClick={() => setExpanded(true)}
            title="Expand sidebar"
            className="absolute right-0 top-1/2 z-10 flex size-5 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border shadow-sm transition-shadow hover:shadow-md"
            style={{ borderColor: "var(--sidebar-border)", background: "var(--sidebar)" }}
          >
            <PanelRight size={11} strokeWidth={2} style={{ color: "var(--ink-3)" }} />
          </button>
        )}
      </motion.aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className="flex shrink-0 items-center gap-2 border-b px-3 py-2 sm:gap-3 sm:px-6"
          style={{ background: "var(--sidebar)", borderColor: "var(--sidebar-border)" }}
        >
          <div className="min-w-0 lg:hidden">
            <LogoMark size={22} />
          </div>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setTheme(actualTheme === "dark" ? "light" : "dark")}
              className="flex items-center justify-center rounded-xl p-2 transition-colors hover:bg-surface-hover"
              title={actualTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              style={{ color: "var(--ink-2)" }}
            >
              {actualTheme === "dark" ? (
                <Sun size={18} strokeWidth={1.75} />
              ) : (
                <Moon size={18} strokeWidth={1.75} />
              )}
            </button>

            {!isAskPage && (
              <Link
                to="/app/parser"
                className="hidden items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold text-white sm:flex"
                style={{
                  background: "var(--color-accent)",
                  boxShadow: "var(--shadow-accent)",
                }}
              >
                <Upload size={14} strokeWidth={2} />
                Upload statement
              </Link>
            )}

            <div className="relative">
              <NotificationBell userId={user?.id} onClick={() => setNotifOpen(true)} />
              <NotificationCenter open={notifOpen} onClose={() => setNotifOpen(false)} />
            </div>
          </div>
        </header>

        <main
          className={`app-mobile-main min-h-0 flex-1 ${isAskPage ? "overflow-hidden" : "overflow-y-auto scrollbar-thin"}`}
        >
          {children}
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 px-3 lg:hidden"
        style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}
      >
        <div
          className="mx-auto flex max-w-lg items-stretch justify-between rounded-[22px] px-1.5 py-1.5"
          style={{
            background: "color-mix(in oklch, var(--sidebar) 88%, transparent)",
            border: "1px solid var(--sidebar-border)",
            boxShadow: "0 18px 50px color-mix(in oklch, var(--color-text) 18%, transparent)",
            backdropFilter: "blur(22px) saturate(1.4)",
          }}
        >
          {mobileTabs.map((tab) => {
            const active = isActive(tab.to);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                onClick={() => setMoreOpen(false)}
                className="relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px] font-semibold"
                style={{
                  color: active ? "var(--sidebar-primary)" : "var(--ink-3)",
                  background: active ? "var(--sidebar-accent)" : "transparent",
                }}
              >
                <Icon size={18} strokeWidth={active ? 2.1 : 1.7} />
                <span className="max-w-full truncate">{tab.label}</span>
                {tab.to === "/app/review" && reviewBadge > 0 && (
                  <span
                    className="absolute end-2 top-1 flex size-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
                    style={{ background: "var(--bad)" }}
                  >
                    {reviewBadge > 9 ? "9+" : reviewBadge}
                  </span>
                )}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className="relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px] font-semibold"
            style={{
              color: moreOpen || !tabActive ? "var(--sidebar-primary)" : "var(--ink-3)",
              background: moreOpen || !tabActive ? "var(--sidebar-accent)" : "transparent",
            }}
          >
            <MoreHorizontal size={18} strokeWidth={moreOpen || !tabActive ? 2.1 : 1.7} />
            <span className="max-w-full truncate">More</span>
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 lg:hidden"
              style={{ background: "var(--scrim)", backdropFilter: "blur(6px)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMoreOpen(false)}
            />
            <motion.div
              className="fixed inset-x-0 bottom-0 z-50 lg:hidden"
              initial={{ y: "110%" }}
              animate={{ y: 0 }}
              exit={{ y: "110%" }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              <div
                className="mx-auto max-h-[78dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] px-4 pb-28 pt-3"
                style={{
                  background: "var(--sidebar)",
                  border: "1px solid var(--sidebar-border)",
                  boxShadow: "var(--shadow-hover)",
                }}
              >
                <div className="mx-auto mb-4 h-1 w-10 rounded-full" style={{ background: "var(--sidebar-border)" }} />
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-semibold">More</p>
                  <button type="button" onClick={() => setMoreOpen(false)} aria-label="Close navigation">
                    <X size={18} strokeWidth={1.75} />
                  </button>
                </div>
                <div
                  className="mb-4 flex items-center gap-3 rounded-2xl px-3 py-3"
                  style={{ background: "var(--sidebar-accent)", border: "1px solid var(--sidebar-border)" }}
                >
                  <div
                    className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold"
                    style={{
                      background: avatarUrl ? "transparent" : "var(--color-accent)",
                      color: "var(--accent-fg)",
                    }}
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={displayName} className="size-full object-cover" />
                    ) : (
                      initials
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{displayName}</p>
                    <p className="truncate text-xs" style={{ color: "var(--ink-3)" }}>
                      {orgName} · {plan.toUpperCase()}
                    </p>
                  </div>
                </div>
                {navGroups.map((group) => (
                  <div key={group.title} className="mb-4">
                    <p
                      className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--ink-3)" }}
                    >
                      {group.title}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item.to);
                        return (
                          <Link
                            key={item.to}
                            to={item.to}
                            onClick={() => setMoreOpen(false)}
                            className="flex items-center gap-2.5 rounded-2xl px-3 py-3 text-sm font-medium"
                            style={{
                              background: active ? "var(--sidebar-accent)" : "var(--color-login-bg)",
                              color: active ? "var(--sidebar-primary)" : "var(--sidebar-foreground)",
                              border: "1px solid var(--sidebar-border)",
                            }}
                          >
                            <Icon size={16} strokeWidth={1.75} />
                            <span className="truncate">{item.label}</span>
                            {item.to === "/app/review" && reviewBadge > 0 && (
                              <span
                                className="ms-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                                style={{ background: "var(--bad)" }}
                              >
                                {reviewBadge}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="mb-2 flex w-full items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-medium"
                  style={{ color: "var(--bad)", border: "1px solid var(--sidebar-border)" }}
                >
                  <LogOut size={16} strokeWidth={1.75} />
                  Sign out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <CommandBarProvider>
      <InnerShell>{children}</InnerShell>
    </CommandBarProvider>
  );
}
