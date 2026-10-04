import test from "node:test";
import assert from "node:assert/strict";
import {
  growthConditionsMatch,
  growthObjectValue,
  growthPathValue,
  growthRuleMatches
} from "./growthRuleEngine.js";

test("reads nested Growth signal paths safely", () => {
  const payload = { member: { inactivityDays: 24 }, membership: { status: "active" } };
  assert.equal(growthPathValue(payload, "member.inactivityDays"), 24);
  assert.equal(growthPathValue(payload, "membership.status"), "active");
  assert.equal(growthPathValue(payload, "missing.path"), undefined);
});

test("supports numeric and equality Growth rules", () => {
  const payload = {
    member: { inactivityDays: 24, visits30d: 1 },
    membership: { status: "active" }
  };

  assert.equal(
    growthRuleMatches(payload, { path: "member.inactivityDays", op: "gte", value: 20 }),
    true
  );
  assert.equal(
    growthRuleMatches(payload, { path: "member.visits30d", op: "gt", value: 2 }),
    false
  );
  assert.equal(
    growthRuleMatches(payload, { path: "membership.status", op: "eq", value: "active" }),
    true
  );
});

test("supports inclusion and existence checks", () => {
  const payload = { member: { segment: "at_risk", phoneE164: "+543855836570" } };

  assert.equal(
    growthRuleMatches(payload, {
      path: "member.segment",
      op: "in",
      value: ["at_risk", "inactive"]
    }),
    true
  );
  assert.equal(
    growthRuleMatches(payload, { path: "member.phoneE164", op: "exists" }),
    true
  );
  assert.equal(
    growthRuleMatches(payload, { path: "member.email", op: "exists" }),
    false
  );
});

test("requires every rule in an all-condition group", () => {
  const payload = {
    member: { inactivityDays: 30, visits30d: 0 },
    membership: { status: "active" }
  };

  assert.equal(
    growthConditionsMatch(payload, {
      all: [
        { path: "member.inactivityDays", op: "gte", value: 20 },
        { path: "member.visits30d", op: "lte", value: 1 },
        { path: "membership.status", op: "eq", value: "active" }
      ]
    }),
    true
  );

  assert.equal(
    growthConditionsMatch(payload, {
      all: [
        { path: "member.inactivityDays", op: "gte", value: 20 },
        { path: "membership.status", op: "eq", value: "cancelled" }
      ]
    }),
    false
  );
});

test("invalid JSON and empty conditions fail safe without matching arbitrary fields", () => {
  assert.deepEqual(growthObjectValue("not-json"), {});
  assert.equal(growthConditionsMatch({ any: "value" }, null), true);
  assert.equal(
    growthConditionsMatch({ any: "value" }, { all: [{ path: "missing", op: "exists" }] }),
    false
  );
});
