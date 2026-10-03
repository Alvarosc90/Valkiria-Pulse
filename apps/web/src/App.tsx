import { useEffect, useMemo, useState } from "react";
import {
  ApiClientError,
  apiFetch,
  apiJson,
  exchangeTrainiaSso,
  loginRequest,
  logoutRequest,
  refreshAccessToken,
  resendVerificationRequest
} from "./api";
import type {
  AuthContext,
  Brand,
  CalendarEntry,
  Platform,
  SocialAccount,
  TenantOption
} from "./types";
import { ApprovalsView } from "./views/ApprovalsView";
import { AuditView } from "./views/AuditView";
import { BrandBrainView } from "./views/BrandBrainView";
import { CalendarView } from "./views/CalendarView";
import { MediaLibraryView } from "./views/MediaLibraryView";
import { BillingView } from "./views/BillingView";
import { AnalyticsView } from "./views/AnalyticsView";
import { ConnectionOnboarding } from "./views/ConnectionOnboarding";
import { PublicLanding } from "./views/PublicLanding";
import { LegalPage } from "./views/LegalPage";
import { SignupScreen } from "./views/SignupScreen";
import { CookieConsent } from "./views/CookieConsent";
import { PasswordRecoveryPage } from "./views/PasswordRecoveryPage";
import { SecurityView } from "./views/SecurityView";
import { VerifyEmailPage } from "./views/VerifyEmailPage";
import { LEGAL_BY_PATH, LEGAL_PATHS, type LegalType } from "./legal";

type WorkspaceView =
  | "overview"
  | "calendar"
  | "approvals"
  | "media"
  | "agents"
  | "billing"
  | "analytics"
  | "security"
  | "audit";

const platforms: Array<{
  id: Platform;
  label: string;
  agent: string;
  description: string;
}> = [
  {
    id: "instagram",
    label: "Instagram",
    agent: "Instagram Agent",
    description: "Visual-first, captions, piezas y memoria editorial propia."
  },
  {
    id: "tiktok",
    label: "TikTok",
    agent: "TikTok Agent",
    description: "Hooks, video, privacidad y flujo de Direct Post especializado."
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    agent: "LinkedIn Agent",
    description: "Contexto profesional, perfiles y organizaciones separados."
  }
];

const PULSE_LOGO_SRC = "/assets/branding/valkiria-pulse.png";

const navigation: Array<{ id: WorkspaceView; label: string }> = [
  { id: "overview", label: "Resumen" },
  { id: "calendar", label: "Calendarios" },
  { id: "approvals", label: "Publicaciones" },
  { id: "media", label: "Biblioteca" },
  { id: "agents", label: "Agentes" },
  { id: "billing", label: "Plan y uso" },
  { id: "analytics", label: "Analytics" },
  { id: "security", label: "Seguridad" }
];

export default function App() {
  const [booting, setBooting] = useState(true);
  const [auth, setAuth] = useState<AuthContext | null>(null);
  const [showLogin, setShowLogin] = useState(
    () => new URLSearchParams(window.location.search).get("login") === "1"
  );
  const [publicPath, setPublicPath] = useState(() => window.location.pathname);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<WorkspaceView>("overview");
  const [uploadState, setUploadState] = useState<Record<Platform, string>>({
    instagram: "Listo para importar",
    tiktok: "Listo para importar",
    linkedin: "Listo para importar"
  });

  const upcoming = useMemo(
    () => [...entries]
      .sort((a, b) => a.scheduledAtUtc.localeCompare(b.scheduledAtUtc))
      .slice(0, 8),
    [entries]
  );

  const activeBrand = brands.find((brand) => brand.id === brandId) ?? brands[0];

  function openLogin() {
    setShowLogin(true);
    setPublicPath("/");
    window.history.pushState({}, "", "/?login=1");
  }

  function openSignup() {
    setShowLogin(false);
    setPublicPath("/registro");
    window.history.pushState({}, "", "/registro");
  }

  function openRecovery() {
    setShowLogin(false);
    setPublicPath("/recuperar");
    window.history.pushState({}, "", "/recuperar");
  }

  function openLegal(type: LegalType) {
    setShowLogin(false);
    const path = LEGAL_PATHS[type];
    setPublicPath(path);
    window.history.pushState({}, "", path);
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }

  function backToLanding() {
    setShowLogin(false);
    setPublicPath("/");
    window.history.replaceState({}, "", "/");
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }

  function authenticated(nextAuth: AuthContext) {
    setAuth(nextAuth);
    setShowLogin(false);
    setPublicPath("/");
    window.history.replaceState({}, "", "/");
  }

  function changeView(nextView: WorkspaceView) {
    setView(nextView);
    window.history.replaceState({}, "", nextView === "overview" ? "/" : "/?view=" + nextView);
  }

  async function loadAuth(ssoToken?: string) {
    try {
      if (ssoToken) {
        await exchangeTrainiaSso(ssoToken);
        const payload = await apiJson<{ data: AuthContext }>("/api/v1/auth/me");
        setAuth(payload.data);
        return;
      }

      const refreshed = await refreshAccessToken();
      if (!refreshed) return;

      const payload = await apiJson<{ data: AuthContext }>("/api/v1/auth/me");
      setAuth(payload.data);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "No se pudo iniciar la sesión de PULSE"
      );
    } finally {
      setBooting(false);
    }
  }

  async function loadWorkspace() {
    const [brandPayload, calendarPayload] = await Promise.all([
      apiJson<{ data: Brand[] }>("/api/v1/brands"),
      apiJson<{ data: CalendarEntry[] }>("/api/v1/calendars?limit=100")
    ]);

    setBrands(brandPayload.data ?? []);
    setEntries(calendarPayload.data ?? []);

    const nextBrandId = brandId ?? brandPayload.data?.[0]?.id ?? null;
    setBrandId(nextBrandId);

    if (nextBrandId) {
      const accountPayload = await apiJson<{ data: SocialAccount[] }>(
        "/api/v1/social-accounts?brandId=" + nextBrandId
      );
      setAccounts(accountPayload.data ?? []);
    } else {
      setAccounts([]);
    }
  }

  async function refreshCalendar() {
    const payload = await apiJson<{ data: CalendarEntry[] }>(
      "/api/v1/calendars?limit=100"
    );
    setEntries(payload.data ?? []);
  }

  async function refreshAccounts(nextBrandId = brandId) {
    if (!nextBrandId) return;
    const payload = await apiJson<{ data: SocialAccount[] }>(
      "/api/v1/social-accounts?brandId=" + nextBrandId
    );
    setAccounts(payload.data ?? []);
  }

  useEffect(() => {
    const handlePopState = () => {
      setPublicPath(window.location.pathname);
      setShowLogin(
        new URLSearchParams(window.location.search).get("login") === "1"
      );
    };

    window.addEventListener("popstate", handlePopState);

    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(
      window.location.hash.replace(/^#/, "")
    );
    const ssoToken = hashParams.get("sso") ?? params.get("sso");

    if (ssoToken) {
      // Remove the short-lived integration token from the visible URL
      // before exchanging it so browser history and copied links stay clean.
      window.history.replaceState({}, "", "/");
      void loadAuth(ssoToken);
      return;
    }

    const requestedView = params.get("view");
    if (
      requestedView === "calendar" ||
      requestedView === "approvals" ||
      requestedView === "media" ||
      requestedView === "agents" ||
      requestedView === "billing" ||
      requestedView === "analytics" ||
      requestedView === "security" ||
      requestedView === "audit"
    ) {
      setView(requestedView);
    }

    if (params.get("connection") === "success") {
      setNotice((params.get("social") ?? "Red social") + " conectada correctamente.");
      setView("overview");
      window.history.replaceState({}, "", "/");
    } else if (params.get("connection") === "error") {
      setNotice("No se pudo completar la conexión: " + (params.get("reason") ?? "error"));
      setView("overview");
      window.history.replaceState({}, "", "/");
    }

    void loadAuth();

    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!auth) return;
    void loadWorkspace().catch((error) => {
      setNotice(error instanceof Error ? error.message : "No se pudo cargar PULSE");
    });
  }, [auth]);

  useEffect(() => {
    if (!auth || !brandId) return;
    void refreshAccounts(brandId).catch(() => undefined);
  }, [brandId]);

  async function uploadCalendar(platform: Platform, file: File) {
    if (!brandId) {
      setUploadState((current) => ({
        ...current,
        [platform]: "Primero selecciona una marca"
      }));
      return;
    }

    setUploadState((current) => ({ ...current, [platform]: "Importando..." }));

    const form = new FormData();
    form.set("file", file);
    form.set("brandId", String(brandId));
    form.set("platform", platform);
    form.set("timezone", "America/Argentina/Cordoba");

    try {
      const response = await apiFetch("/api/v1/calendars/import", {
        method: "POST",
        body: form
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.message ?? payload?.error ?? "No se pudo importar");
      }

      const data = payload.data;
      setUploadState((current) => ({
        ...current,
        [platform]:
          String(data.valid) + " filas listas · " +
          String(data.invalid) + " con observaciones"
      }));
      await refreshCalendar();
    } catch (error) {
      setUploadState((current) => ({
        ...current,
        [platform]: error instanceof Error ? error.message : "Error de importación"
      }));
    }
  }

  async function connectPlatform(platform: Platform) {
    if (!brandId) return;

    try {
      setNotice("Abriendo autorización de " + platform + "...");
      const payload = await apiJson<{ data: { authorizationUrl: string } }>(
        "/api/v1/connections/" + platform + "/start",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brandId,
            returnTo: "/"
          })
        }
      );

      window.location.assign(payload.data.authorizationUrl);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo iniciar la conexión");
    }
  }

  function clearLocalSession() {
    setAuth(null);
    setShowLogin(false);
    setPublicPath("/");
    setBrands([]);
    setAccounts([]);
    setEntries([]);
    setView("overview");
    window.history.replaceState({}, "", "/");
  }

  async function logout() {
    await logoutRequest();
    clearLocalSession();
  }

  if (booting) {
    return (
      <div className="splash-screen">
        <img
          className="pulse-logo pulse-logo-splash"
          src={PULSE_LOGO_SRC}
          alt="Valkiria PULSE"
        />
        <span>Preparando tu command center...</span>
      </div>
    );
  }

  const legalType = LEGAL_BY_PATH[publicPath];

  if (legalType) {
    return <LegalPage type={legalType} onBack={backToLanding} />;
  }

  if (publicPath === "/verificar-email") {
    return (
      <VerifyEmailPage
        token={new URLSearchParams(window.location.search).get("token")}
        onLogin={openLogin}
        onBack={backToLanding}
      />
    );
  }

  if (publicPath === "/recuperar") {
    return (
      <PasswordRecoveryPage
        token={new URLSearchParams(window.location.search).get("token")}
        onLogin={openLogin}
        onBack={backToLanding}
      />
    );
  }

  if (!auth) {
    if (publicPath === "/registro") {
      return (
        <SignupScreen
          onAuthenticated={authenticated}
          onBack={backToLanding}
          onLogin={openLogin}
          onLegal={(type) => window.open(LEGAL_PATHS[type], "_blank", "noopener,noreferrer")}
        />
      );
    }

    if (showLogin) {
      return (
        <LoginScreen
          onAuthenticated={authenticated}
          onBack={backToLanding}
          onSignup={openSignup}
          onRecover={openRecovery}
        />
      );
    }

    return (
      <>
        <PublicLanding
          onLogin={openLogin}
          onSignup={openSignup}
          onLegal={openLegal}
        />
        <CookieConsent onOpenCookies={() => openLegal("cookies")} />
      </>
    );
  }

  const showAudit = auth.role === "owner" || auth.role === "admin";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img
            className="pulse-logo pulse-logo-sidebar"
            src={PULSE_LOGO_SRC}
            alt="Valkiria PULSE"
          />
        </div>

        <nav>
          {navigation.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "nav-item active" : "nav-item"}
              onClick={() => changeView(item.id)}
            >
              {item.label}
            </button>
          ))}
          {showAudit && (
            <button
              className={view === "audit" ? "nav-item active" : "nav-item"}
              onClick={() => changeView("audit")}
            >
              Auditoría
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="tenant-chip">
            <span className="status-dot" />
            <div>
              <small>{auth.tenant.name}</small>
              <strong>{activeBrand?.name ?? "Sin marca"}</strong>
            </div>
          </div>
          <button className="logout-button" onClick={() => void logout()}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <span className="eyebrow">Social command center</span>
            <h1>
              {view === "overview"
                ? "Tu marca tiene un pulso distinto en cada red."
                : "Valkiria PULSE"}
            </h1>
            <p>
              Tres agentes, tres calendarios y una sola operación. PULSE mantiene
              separado el contexto editorial de Instagram, TikTok y LinkedIn.
            </p>
          </div>
          <button className="primary-button" onClick={() => changeView("calendar")}>
            Nueva publicación
          </button>
        </header>

        {notice && (
          <div className="notice">
            <span>{notice}</span>
            <button onClick={() => setNotice(null)}>×</button>
          </div>
        )}

        <section className="workspace-strip">
          <label>
            <span>Marca activa</span>
            <select
              value={brandId ?? ""}
              onChange={(event) => setBrandId(Number(event.target.value))}
            >
              {brands.map((brand) => (
                <option value={brand.id} key={brand.id}>{brand.name}</option>
              ))}
            </select>
          </label>
          <div>
            <span>Sesión</span>
            <strong>{auth.user.displayName} · {auth.role}</strong>
          </div>
        </section>

        {view === "overview" && (
          <ConnectionOnboarding
            accounts={accounts}
            onConnect={(platform) => void connectPlatform(platform)}
          />
        )}

        {view === "overview" && (
          <>
            <section className="stats-grid">
              <article className="stat-card">
                <span>Programadas</span>
                <strong>
                  {entries.filter((entry) =>
                    ["ready", "scheduled"].includes(entry.status)
                  ).length}
                </strong>
                <small>en los tres calendarios</small>
              </article>
              <article className="stat-card">
                <span>Agentes activos</span>
                <strong>3</strong>
                <small>contexto aislado por red</small>
              </article>
              <article className="stat-card">
                <span>Redes conectadas</span>
                <strong>
                  {accounts.filter((account) => account.status === "connected").length}
                </strong>
                <small>de 3 disponibles</small>
              </article>
              <article className="stat-card">
                <span>Analytics</span>
                <strong>—</strong>
                <small>preparado para permisos futuros</small>
              </article>
            </section>

            <section className="section-block">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Agentes especializados</span>
                  <h2>Un cerebro por plataforma</h2>
                </div>
                <span className="badge">Brand Brain compartido</span>
              </div>

              <div className="platform-grid">
                {platforms.map((platform) => {
                  const account = accounts.find(
                    (item) => item.platform === platform.id
                  );
                  const connected = account?.status === "connected";

                  return (
                    <article className="platform-card" key={platform.id}>
                      <div className="platform-header">
                        <div>
                          <span className={"platform-icon " + platform.id}>
                            {platform.label.slice(0, 2)}
                          </span>
                          <div>
                            <strong>{platform.label}</strong>
                            <small>{platform.agent}</small>
                          </div>
                        </div>
                        <span
                          className={
                            connected
                              ? "connection-state connected"
                              : "connection-state"
                          }
                        >
                          {connected ? "Conectada" : "Sin conectar"}
                        </span>
                      </div>

                      <p>{platform.description}</p>

                      {connected && (
                        <div className="account-line">
                          <span>
                            {account.displayName ??
                              account.username ??
                              "Cuenta conectada"}
                          </span>
                          <small>API lista</small>
                        </div>
                      )}

                      <div className="platform-actions">
                        <label className="upload-button">
                          Subir Excel
                          <input
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void uploadCalendar(platform.id, file);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                      </div>

                      <small className="upload-state">
                        {uploadState[platform.id]}
                      </small>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="section-block two-column">
              <div>
                <div className="section-heading compact">
                  <div>
                    <span className="eyebrow">Calendario unificado</span>
                    <h2>Próximas publicaciones</h2>
                  </div>
                </div>

                <div className="timeline">
                  {upcoming.length === 0 ? (
                    <div className="empty-state">
                      <strong>Todavía no hay publicaciones importadas.</strong>
                      <span>Subí uno de los tres Excel para empezar.</span>
                    </div>
                  ) : (
                    upcoming.map((entry) => (
                      <div className="timeline-row" key={entry.id}>
                        <span className={"network-dot " + entry.platform} />
                        <div className="timeline-copy">
                          <strong>{entry.topic}</strong>
                          <span>{entry.platform} · {entry.status}</span>
                        </div>
                        <time>
                          {new Date(entry.scheduledAtUtc).toLocaleString("es-AR", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </time>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <aside className="agent-panel">
                <span className="eyebrow">Orquestación</span>
                <h2>Social Orchestrator</h2>
                <p>
                  Recibe cada fila importada y la deriva únicamente al agente de su red.
                  El agente crea; el provider publica.
                </p>
                <div className="flow-step">
                  <span>01</span><strong>Calendario</strong><small>intención editorial</small>
                </div>
                <div className="flow-step">
                  <span>02</span><strong>Agente</strong><small>contexto por plataforma</small>
                </div>
                <div className="flow-step">
                  <span>03</span><strong>Provider</strong><small>API determinística</small>
                </div>
                <div className="flow-step">
                  <span>04</span><strong>Historial</strong><small>estado y memoria</small>
                </div>
              </aside>
            </section>
          </>
        )}

        {view === "calendar" && (
          <CalendarView
            brandId={brandId}
            entries={entries}
            onRefresh={refreshCalendar}
            onNotice={setNotice}
          />
        )}

        {view === "approvals" && (
          <ApprovalsView
            role={auth.role}
            onNotice={setNotice}
            onCalendarRefresh={refreshCalendar}
          />
        )}

        {view === "media" && (
          <MediaLibraryView
            brandId={brandId}
            onNotice={setNotice}
          />
        )}

        {view === "agents" && (
          <BrandBrainView
            brandId={brandId}
            role={auth.role}
            onNotice={setNotice}
          />
        )}

        {view === "billing" && (
          <BillingView role={auth.role} onNotice={setNotice} />
        )}

        {view === "analytics" && (
          <AnalyticsView brandId={brandId} onNotice={setNotice} />
        )}

        {view === "security" && (
          <SecurityView
            onNotice={setNotice}
            onSignedOut={clearLocalSession}
          />
        )}

        {view === "audit" && showAudit && (
          <AuditView onNotice={setNotice} />
        )}
      </main>
    </div>
  );
}

function LoginScreen({
  onAuthenticated,
  onBack,
  onSignup,
  onRecover
}: {
  onAuthenticated: (auth: AuthContext) => void;
  onBack: () => void;
  onSignup: () => void;
  onRecover: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);

  async function submit(tenantSlug?: string) {
    setBusy(true);
    setError(null);
    setVerificationNotice(null);

    try {
      const result = await loginRequest({ email, password, tenantSlug });

      if (result.requiresTenantSelection) {
        setTenants(result.tenants ?? []);
        return;
      }

      const me = await apiJson<{ data: AuthContext }>("/api/v1/auth/me");
      onAuthenticated(me.data);
    } catch (loginError) {
      const verificationRequired =
        loginError instanceof ApiClientError &&
        loginError.code === "AUTH_EMAIL_VERIFICATION_REQUIRED";
      setNeedsVerification(verificationRequired);
      setError(
        loginError instanceof Error
          ? loginError.message
          : "No se pudo iniciar sesión"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <section className="login-brand">
        <span className="eyebrow">Valkiria Project</span>
        <div className="login-logo">
          <img
            className="pulse-logo pulse-logo-login"
            src={PULSE_LOGO_SRC}
            alt="Valkiria PULSE"
          />
        </div>
        <h1>Contenido distinto. Contexto correcto. Una sola operación.</h1>
        <p>
          PULSE coordina agentes especializados para Instagram, TikTok y LinkedIn
          sin mezclar la lógica editorial de cada red.
        </p>
      </section>

      <section className="login-card">
        <button className="login-back" onClick={onBack}>← Volver</button>
        <span className="eyebrow">Acceso</span>
        <h2>Entrar a PULSE</h2>

        {tenants.length === 0 ? (
          <>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="tu@email.com"
              />
            </label>

            <label className="field">
              <span>Contraseña</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submit();
                }}
              />
            </label>

            <button
              className="primary-button login-submit"
              disabled={busy || !email || password.length < 8}
              onClick={() => void submit()}
            >
              {busy ? "Ingresando..." : "Ingresar"}
            </button>
          </>
        ) : (
          <div className="tenant-picker">
            <p>Elegí la empresa con la que querés trabajar.</p>
            {tenants.map((tenant) => (
              <button
                key={tenant.id}
                disabled={busy}
                onClick={() => void submit(tenant.slug)}
              >
                <strong>{tenant.name}</strong>
                <span>{tenant.role}</span>
              </button>
            ))}
          </div>
        )}

        {error && <div className="login-error">{error}</div>}

        {needsVerification && (
          <button
            className="login-signup-link"
            disabled={busy || !email}
            onClick={() => {
              setBusy(true);
              setVerificationNotice(null);
              void resendVerificationRequest(email)
                .then((result) => {
                  setVerificationNotice("Si la cuenta sigue pendiente, enviamos un nuevo enlace.");
                  if (result?.devVerificationToken) {
                    window.location.assign(
                      "/verificar-email?token=" +
                        encodeURIComponent(result.devVerificationToken)
                    );
                  }
                })
                .catch((resendError) =>
                  setError(
                    resendError instanceof Error
                      ? resendError.message
                      : "No se pudo reenviar la verificación"
                  )
                )
                .finally(() => setBusy(false));
            }}
          >
            Reenviar verificación de email
          </button>
        )}

        {verificationNotice && (
          <div className="auth-public-message">{verificationNotice}</div>
        )}

        <button className="login-recovery-link" onClick={onRecover}>
          ¿Olvidaste tu contraseña?
        </button>

        <button className="login-signup-link" onClick={onSignup}>
          ¿Todavía no tenés cuenta? Crear prueba de 14 días
        </button>
        <small className="login-footnote">
          Los tokens sociales se mantienen cifrados y nunca se exponen a los agentes.
        </small>
      </section>
    </div>
  );
}
