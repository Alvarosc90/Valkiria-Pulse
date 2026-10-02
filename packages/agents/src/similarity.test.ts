import assert from "node:assert/strict";
import test from "node:test";
import { nearestRecentPost, textSimilarity } from "./similarity.js";

test("detects near duplicate social copy", () => {
  const a = "TrainIA conecta tu comunidad deportiva en un solo lugar con menos gestión y más comunidad";
  const b = "TrainIA conecta tu comunidad deportiva en un solo lugar. Menos gestión, más comunidad.";
  assert.ok(textSimilarity(a, b) > 0.6);
});

test("keeps unrelated copy far apart", () => {
  const a = "Automatizá el check-in con QR y simplificá el acceso.";
  const b = "Hoy presentamos una nueva rutina para fuerza de tren inferior.";
  assert.ok(textSimilarity(a, b) < 0.2);
});

test("returns the closest recent post", () => {
  const candidate = "Construimos comunidad con herramientas simples para tu gimnasio";
  const recent = [
    "Un panel para administrar pagos",
    "Construimos comunidad con herramientas simples para tu gimnasio y tu equipo"
  ];
  assert.equal(nearestRecentPost(candidate, recent).text, recent[1]);
});
