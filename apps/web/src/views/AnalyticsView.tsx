import { useEffect, useMemo, useState } from "react";
import { apiJson } from "../api";

type PlatformMetric = {
  platform: "instagram" | "tiktok" | "linkedin";
  impressions: number;
  reach: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
};

type TopPost = {
  calendarEntryId: number;
  platform: string;
  topic: string;
  externalPostId: string;
  engagementScore: number;
  impressions: number;
  views: number;
};

type AnalyticsPayload = {
  days: number;
  platforms: PlatformMetric[];
  topPosts: TopPost[];
  sync: Array<{
    platform: string;
    status: string;
    lastStartedAt?: string | null;
    lastCompletedAt?: string | null;
  }>;
};

const labels: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  linkedin: "LinkedIn"
};

function number(value: number) {
  return new Intl.NumberFormat("es-AR", { notation: "compact" }).format(value);
}

export function AnalyticsView({
  brandId,
  onNotice
}: {
  brandId: number | null;
  onNotice: (message: string | null) => void;
}) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const query = new URLSearchParams({ days: String(days) });
      if (brandId) query.set("brandId", String(brandId));

      const response = await apiJson<{ data: AnalyticsPayload }>(
        "/api/v1/analytics/overview?" + query.toString()
      );
      setData(response.data);
    } catch (error) {
      onNotice(
        error instanceof Error
          ? error.message
          : "No se pudo cargar Analytics"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [days, brandId]);

  const totals = useMemo(() => {
    const rows = data?.platforms ?? [];
    return rows.reduce(
      (acc, row) => ({
        impressions: acc.impressions + row.impressions,
        reach: acc.reach + row.reach,
        views: acc.views + row.views,
        interactions:
          acc.interactions +
          row.likes +
          row.comments +
          row.shares +
          row.saves +
          row.clicks
      }),
      { impressions: 0, reach: 0, views: 0, interactions: 0 }
    );
  }, [data]);

  if (loading) {
    return <div className="panel-loading">Cargando rendimiento social...</div>;
  }

  const empty = !data?.platforms?.length;

  return (
    <section className="analytics-view">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Rendimiento</span>
          <h2>Analytics unificado</h2>
        </div>
        <select
          className="analytics-range"
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
        >
          <option value={7}>7 días</option>
          <option value={30}>30 días</option>
          <option value={90}>90 días</option>
          <option value={365}>1 año</option>
        </select>
      </div>

      <div className="analytics-kpis">
        <article>
          <span>Impresiones</span>
          <strong>{number(totals.impressions)}</strong>
        </article>
        <article>
          <span>Alcance</span>
          <strong>{number(totals.reach)}</strong>
        </article>
        <article>
          <span>Vistas</span>
          <strong>{number(totals.views)}</strong>
        </article>
        <article>
          <span>Interacciones</span>
          <strong>{number(totals.interactions)}</strong>
        </article>
      </div>

      {empty ? (
        <div className="analytics-empty">
          <div>
            <span className="eyebrow">Base lista</span>
            <h3>El modelo de Analytics ya está preparado.</h3>
            <p>
              Todavía no hay métricas sincronizadas. PULSE ya normaliza Instagram,
              TikTok y LinkedIn en un único esquema; falta habilitar los permisos
              de insights de cada proveedor para empezar a poblar estos datos.
            </p>
          </div>
          <div className="permission-grid">
            {["instagram", "tiktok", "linkedin"].map((platform) => (
              <article key={platform}>
                <strong>{labels[platform]}</strong>
                <span>Permisos de métricas pendientes</span>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="analytics-platform-grid">
            {data?.platforms.map((row) => (
              <article key={row.platform}>
                <div className="analytics-platform-head">
                  <strong>{labels[row.platform] ?? row.platform}</strong>
                  <span className={"network-dot " + row.platform} />
                </div>
                <div><span>Impresiones</span><strong>{number(row.impressions)}</strong></div>
                <div><span>Vistas</span><strong>{number(row.views)}</strong></div>
                <div><span>Likes</span><strong>{number(row.likes)}</strong></div>
                <div><span>Compartidos</span><strong>{number(row.shares)}</strong></div>
                <div><span>Clicks</span><strong>{number(row.clicks)}</strong></div>
              </article>
            ))}
          </div>

          <div className="analytics-top-posts">
            <div className="section-heading compact">
              <div>
                <span className="eyebrow">Contenido</span>
                <h2>Mejor rendimiento</h2>
              </div>
            </div>
            <div className="analytics-table">
              {data?.topPosts.map((post, index) => (
                <div className="analytics-row" key={post.calendarEntryId}>
                  <span className="analytics-rank">{index + 1}</span>
                  <div>
                    <strong>{post.topic}</strong>
                    <span>{labels[post.platform] ?? post.platform}</span>
                  </div>
                  <div><span>Score</span><strong>{number(post.engagementScore)}</strong></div>
                  <div><span>Impresiones</span><strong>{number(post.impressions)}</strong></div>
                  <div><span>Vistas</span><strong>{number(post.views)}</strong></div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="analytics-footnote">
        <strong>Feedback editorial</strong>
        <span>
          Cuando lleguen métricas reales, PULSE calculará señales de rendimiento por
          marca y plataforma para alimentar futuras decisiones editoriales sin mezclar
          el contexto entre redes.
        </span>
      </div>
    </section>
  );
}
