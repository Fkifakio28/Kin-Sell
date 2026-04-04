import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/providers/AuthProvider";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";

/* ── Types ── */
export interface DashboardSection {
  key: string;
  labelKey: string;
  icon: string;
  /** Si true, la section est visible seulement quand `visible` est true. */
  visible?: boolean;
  /** Si défini, naviguer vers ce chemin au lieu de changer la section active. */
  href?: string;
}

export interface DashboardProfile {
  avatarUrl?: string | null;
  displayName: string;
  subtitle?: string;
  badge?: ReactNode;
}

export interface DashboardLayoutProps {
  /** Classe CSS du shell (ex: "ud-shell", "bz-shell", "ad-shell"). */
  shellClassName: string;
  /** Classe CSS supplémentaire de la sidebar (ex: "bz-sidebar"). */
  sidebarClassName?: string;
  /** Section active courante. */
  activeSection: string;
  /** Callback quand on change de section. */
  onSectionChange: (key: string) => void;
  /** Tableau de sections pour la nav. */
  sections: DashboardSection[];
  /** Sections groupées (pour admin) — si fourni, remplace `sections`. */
  groupedSections?: Record<string, DashboardSection[]>;
  /** Profil utilisateur pour la sidebar. */
  profile: DashboardProfile;
  /** CTA upgrade plan (optionnel). */
  upgradeCta?: ReactNode;
  /** Contenu principal du dashboard. */
  children: ReactNode;
  /** Classe suffixe pour les classes internes (par défaut "ud"). */
  classPrefix?: "ud" | "ad";
}

export function DashboardLayout({
  shellClassName,
  sidebarClassName,
  activeSection,
  onSectionChange,
  sections,
  groupedSections,
  profile,
  upgradeCta,
  children,
  classPrefix = "ud",
}: DashboardLayoutProps) {
  const { logout } = useAuth();
  const { t } = useLocaleCurrency();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const px = classPrefix; // "ud" or "ad"
  const collapsedClass = sidebarCollapsed ? ` ${px}-sidebar-collapsed` : "";

  function handleNavClick(section: DashboardSection) {
    if (section.href) {
      navigate(section.href);
      setMobileSidebarOpen(false);
      return;
    }
    if (section.key === "messages" || section.key === "messaging") {
      navigate("/messaging");
      return;
    }
    onSectionChange(section.key);
    setMobileSidebarOpen(false);
  }

  function handleLogout() {
    void logout().then(() => navigate("/"));
  }

  function renderNav(items: DashboardSection[]) {
    return items
      .filter((s) => s.visible !== false)
      .map((section) => (
        <button
          key={section.key}
          type="button"
          className={`${px}-nav-item${activeSection === section.key ? ` ${px}-nav-item--active` : ""}`}
          onClick={() => handleNavClick(section)}
          title={t(section.labelKey)}
        >
          <span className={`${px}-nav-icon`}>{section.icon}</span>
          {!sidebarCollapsed && <span className={`${px}-nav-label`}>{t(section.labelKey)}</span>}
        </button>
      ));
  }

  return (
    <div className={`${shellClassName}${collapsedClass}`}>
      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div className="dash-mob-overlay" onClick={() => setMobileSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`${px}-sidebar${sidebarClassName ? ` ${sidebarClassName}` : ""}${mobileSidebarOpen ? ` ${px}-sidebar-open` : ""}`}>
        <button
          type="button"
          className={`${px}-collapse-btn`}
          onClick={() => setSidebarCollapsed((v) => !v)}
          aria-label={sidebarCollapsed ? t("user.openMenu") : t("user.closeMenu")}
        >
          {sidebarCollapsed ? "▶" : "◀"}
        </button>

        {/* Profile card */}
        <div className={`${px}-profile-card`}>
          <div className={`${px}-avatar`}>
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.displayName} />
            ) : (
              <span className={`${px}-avatar-initials`}>
                {profile.displayName.split(" ").map((p) => p[0]).join("").slice(0, 2)}
              </span>
            )}
            {profile.badge}
          </div>
          {!sidebarCollapsed && (
            <div className={`${px}-profile-info`}>
              <strong className={`${px}-profile-name`}>{profile.displayName}</strong>
              {profile.subtitle && <span className={`${px}-profile-pseudo`}>{profile.subtitle}</span>}
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className={`${px}-nav`} aria-label="Menu dashboard">
          {groupedSections
            ? Object.entries(groupedSections).map(([group, items]) => (
                <div key={group}>
                  {!sidebarCollapsed && <div className={`${px}-nav-section-label`}>{group}</div>}
                  {renderNav(items)}
                </div>
              ))
            : renderNav(sections)}
        </nav>

        {/* Upgrade CTA */}
        {!sidebarCollapsed && upgradeCta}

        {/* Logout */}
        <div className="ud-drawer-logout" style={{ marginTop: "auto" }}>
          <button type="button" className="ud-drawer-logout-btn" onClick={handleLogout}>
            🚪 {t("common.logout")}
          </button>
        </div>
      </aside>

      {/* Mobile hamburger (visible uniquement quand sidebar fermée sur mobile) */}
      <button
        type="button"
        className={`${px}-mobile-toggle`}
        onClick={() => setMobileSidebarOpen(true)}
        aria-label="Ouvrir le menu"
      >
        ☰
      </button>

      {/* Main content */}
      <main className={`${px}-main`}>{children}</main>
    </div>
  );
}
