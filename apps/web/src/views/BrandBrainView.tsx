import { useEffect, useState } from "react";
import { apiJson } from "../api";
import type { Brand, PulseRole } from "../types";

function asLines(value: string[] | string | undefined) {
  if (Array.isArray(value)) return value.join("\n");
  if (!value) return "";
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.join("\n") : String(value);
  } catch {
    return String(value);
  }
}

function lines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

export function BrandBrainView({
  brandId,
  role,
  onNotice
}: {
  brandId: number | null;
  role: PulseRole;
  onNotice: (message: string) => void;
}) {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [description, setDescription] = useState("");
  const [tone, setTone] = useState("");
  const [products, setProducts] = useState("");
  const [claims, setClaims] = useState("");
  const [forbidden, setForbidden] = useState("");
  const [ctas, setCtas] = useState("");
  const canEdit = role === "owner" || role === "admin";

  async function load() {
    if (!brandId) return;
    const payload = await apiJson<{ data: Brand }>("/api/v1/brands/" + brandId);
    setBrand(payload.data);
    setDescription(payload.data.description ?? "");
    setTone(asLines(payload.data.tone));
    setProducts(asLines(payload.data.products));
    setClaims(asLines(payload.data.approvedClaims));
    setForbidden(asLines(payload.data.forbiddenTerms));
    setCtas(asLines(payload.data.ctas));
  }

  useEffect(() => {
    void load().catch((error) => {
      onNotice(error instanceof Error ? error.message : "No se pudo cargar Brand Brain");
    });
  }, [brandId]);

  async function save() {
    if (!brandId || !canEdit) return;
    try {
      await apiJson("/api/v1/brands/" + brandId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          tone: lines(tone),
          products: lines(products),
          approvedClaims: lines(claims),
          forbiddenTerms: lines(forbidden),
          ctas: lines(ctas)
        })
      });
      onNotice("Brand Brain actualizado.");
      await load();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "No se pudo guardar Brand Brain");
    }
  }

  return (
    <section className="workspace-view">
      <div className="view-heading">
        <div>
          <span className="eyebrow">Agentes</span>
          <h2>Brand Brain {brand ? "· " + brand.name : ""}</h2>
        </div>
        <span className="badge">Contexto común, ejecución separada</span>
      </div>

      <article className="panel brand-form">
        <label className="field full-span">
          <span>Descripción de la marca</span>
          <textarea value={description} disabled={!canEdit} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label className="field">
          <span>Tono · uno por línea</span>
          <textarea value={tone} disabled={!canEdit} onChange={(event) => setTone(event.target.value)} />
        </label>
        <label className="field">
          <span>Productos / servicios</span>
          <textarea value={products} disabled={!canEdit} onChange={(event) => setProducts(event.target.value)} />
        </label>
        <label className="field">
          <span>Claims aprobados</span>
          <textarea value={claims} disabled={!canEdit} onChange={(event) => setClaims(event.target.value)} />
        </label>
        <label className="field">
          <span>Términos prohibidos</span>
          <textarea value={forbidden} disabled={!canEdit} onChange={(event) => setForbidden(event.target.value)} />
        </label>
        <label className="field full-span">
          <span>CTAs</span>
          <textarea value={ctas} disabled={!canEdit} onChange={(event) => setCtas(event.target.value)} />
        </label>
        {canEdit && <button className="primary-button" onClick={() => void save()}>Guardar Brand Brain</button>}
      </article>
    </section>
  );
}
