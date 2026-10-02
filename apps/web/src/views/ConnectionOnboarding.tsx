import type { Platform, SocialAccount } from "../types";

const platformMeta: Array<{
  id: Platform;
  label: string;
  detail: string;
}> = [
  {
    id: "instagram",
    label: "Instagram",
    detail: "Publicación visual y contexto editorial."
  },
  {
    id: "tiktok",
    label: "TikTok",
    detail: "Video, hooks y Direct Post."
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    detail: "Perfil profesional y contenido B2B."
  }
];

export function ConnectionOnboarding({
  accounts,
  onConnect
}: {
  accounts: SocialAccount[];
  onConnect: (platform: Platform) => void;
}) {
  const connected = new Set(
    accounts
      .filter((account) => account.status === "connected")
      .map((account) => account.platform)
  );
  const pending = platformMeta.filter((platform) => !connected.has(platform.id));
  const next = pending[0];

  if (!pending.length) return null;

  return (
    <section className="connection-onboarding">
      <div className="connection-onboarding-copy">
        <span className="eyebrow">Configuración inicial · una sola vez</span>
        <h2>Conectá tus redes y después olvidate de la parte técnica.</h2>
        <p>
          Cada plataforma exige autorización de su propia cuenta. PULSE guarda la
          conexión cifrada y se ocupa de reutilizarla y renovarla cuando la API lo permite.
        </p>
      </div>

      <div className="connection-progress">
        {platformMeta.map((platform, index) => {
          const isConnected = connected.has(platform.id);
          const isNext = next?.id === platform.id;

          return (
            <div
              className={
                isConnected
                  ? "connection-step done"
                  : isNext
                    ? "connection-step current"
                    : "connection-step"
              }
              key={platform.id}
            >
              <span className="connection-step-index">
                {isConnected ? "✓" : String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <strong>{platform.label}</strong>
                <small>{isConnected ? "Conectada" : platform.detail}</small>
              </div>
              {isConnected && <span className="connection-ready">Lista</span>}
            </div>
          );
        })}
      </div>

      {next && (
        <div className="connection-onboarding-action">
          <div>
            <strong>{connected.size}/3 redes listas</strong>
            <span>Solo te pediremos autorización de {next.label} ahora.</span>
          </div>
          <button
            className="primary-button"
            onClick={() => onConnect(next.id)}
          >
            Conectar {next.label}
          </button>
        </div>
      )}
    </section>
  );
}
