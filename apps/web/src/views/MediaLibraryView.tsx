import { useEffect, useState } from "react";
import { apiFetch, apiJson } from "../api";

type MediaAsset = {
  id: number;
  brandId: number;
  kind: "image" | "video" | "document";
  originalName: string;
  mimeType: string;
  publicUntil?: string;
  createdAt: string;
  createdBy?: string;
};

export function MediaLibraryView({
  brandId,
  onNotice
}: {
  brandId: number | null;
  onNotice: (message: string) => void;
}) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!brandId) {
      setAssets([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const payload = await apiJson<{ data: MediaAsset[] }>("/api/v1/media?brandId=" + brandId + "&limit=200");
      setAssets(payload.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load().catch((error) => {
      onNotice(error instanceof Error ? error.message : "No se pudo cargar la biblioteca");
    });
  }, [brandId]);

  async function upload(file: File) {
    if (!brandId) return;
    const form = new FormData();
    form.set("brandId", String(brandId));
    form.set("file", file);

    try {
      const response = await apiFetch("/api/v1/media", {
        method: "POST",
        body: form
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message ?? payload?.error ?? "No se pudo subir el archivo");
      onNotice("Archivo agregado a la biblioteca.");
      await load();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "No se pudo subir el archivo");
    }
  }

  async function publicLink(assetId: number) {
    try {
      const payload = await apiJson<{ data: { url: string; expiresAt: string } }>(
        "/api/v1/media/" + assetId + "/public-link",
        { method: "POST" }
      );
      await navigator.clipboard.writeText(payload.data.url);
      onNotice("Enlace temporal copiado. PULSE puede usarlo para publicar por API.");
      await load();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "No se pudo generar el enlace");
    }
  }

  return (
    <section className="workspace-view">
      <div className="view-heading">
        <div>
          <span className="eyebrow">Biblioteca</span>
          <h2>Recursos de marca</h2>
        </div>
        <label className="upload-button">
          Subir archivo
          <input
            type="file"
            accept="image/*,video/*,.pdf"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>

      <article className="panel">
        {loading ? (
          <div className="empty-state compact"><span>Cargando recursos...</span></div>
        ) : assets.length === 0 ? (
          <div className="empty-state compact"><span>La biblioteca todavía está vacía.</span></div>
        ) : (
          <div className="asset-grid">
            {assets.map((asset) => (
              <div className="asset-card" key={asset.id}>
                <div className="asset-preview">
                  <span>{asset.kind === "image" ? "IMG" : asset.kind === "video" ? "VID" : "DOC"}</span>
                </div>
                <div className="asset-copy">
                  <strong title={asset.originalName}>{asset.originalName}</strong>
                  <small>{asset.kind} · {new Date(asset.createdAt).toLocaleDateString("es-AR")}</small>
                </div>
                <button className="mini-button" onClick={() => void publicLink(asset.id)}>Enlace API</button>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
