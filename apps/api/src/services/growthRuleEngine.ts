export type GrowthRule = {
  path: string;
  op?: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "exists";
  value?: unknown;
};

export function growthObjectValue(input: unknown): Record<string, unknown> {
  if (!input) return {};
  if (typeof input === "object") return input as Record<string, unknown>;
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      return parsed && typeof parsed === "object"
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function growthPathValue(input: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, input);
}

export function growthRuleMatches(
  payload: Record<string, unknown>,
  rule: GrowthRule
) {
  const actual = growthPathValue(payload, rule.path);
  const op = rule.op ?? "eq";

  if (op === "exists") return actual !== undefined && actual !== null;
  if (op === "eq") return actual === rule.value;
  if (op === "neq") return actual !== rule.value;
  if (op === "in") return Array.isArray(rule.value) && rule.value.includes(actual);

  if (typeof actual !== "number" || typeof rule.value !== "number") return false;
  if (op === "gt") return actual > rule.value;
  if (op === "gte") return actual >= rule.value;
  if (op === "lt") return actual < rule.value;
  if (op === "lte") return actual <= rule.value;
  return false;
}

export function growthConditionsMatch(
  payload: Record<string, unknown>,
  raw: unknown
) {
  const conditions = growthObjectValue(raw);
  const rules = Array.isArray(conditions.all)
    ? conditions.all as GrowthRule[]
    : [];

  if (!rules.length) return true;

  return rules.every((rule) =>
    Boolean(rule) &&
    typeof rule.path === "string" &&
    growthRuleMatches(payload, rule)
  );
}
