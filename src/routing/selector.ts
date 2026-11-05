import { CONCERN_SKILL_BY_TARGET, type CatalogEntry } from "./catalog.js";
import { normalizePrompt, stripCodeFences, termToRegex } from "./classifier.js";
import { CONCERN_PRIORITY } from "./signals.js";
import type { Concern, Intent, MaintainSubtype, Target, UnactivatedSkill } from "./types.js";

export interface SelectorInput {
  prompt: string;
  intents: Intent[];
  concerns: Concern[];
  maintainSubtype: MaintainSubtype | null;
  questionForm: boolean;
  explicit: ReadonlyArray<{ id: string }>;
  activated: ReadonlySet<string>;
  unactivated: readonly UnactivatedSkill[];
  config: { maxSkills: number; maxSkillChars: number };
  contentLengths: ReadonlyMap<string, number>;
  scores?: Partial<Record<Target, number>>;
  agentDefault?: Intent | null;
}

export interface SelectorResult {
  selected: string[];
  attach: Array<{ id: string }>;
  dropped: Array<{ id: string; reason: string }>;
  reasonCodes: string[];
}

const FEATURE_SCALE_TERMS = [
  "new feature",
  "endpoint",
  "service",
  "module",
  "integration",
  "multiple",
  "providers",
  "gateway",
  "workflow",
] as const;

const BROAD_REVIEW_TERMS = [
  "code review",
  "pr review",
  "pull request review",
  "review this pr",
  "review the pr",
  "audit",
] as const;

function matchesAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => termToRegex(term).test(text));
}

function slug(target: string): string {
  return target.toLowerCase().replace(/ /g, "-");
}

function contentLength(
  contentLengths: ReadonlyMap<string, number>,
  id: string,
): number {
  const value = contentLengths.get(id);
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Selects the eight Phase 1 skills. Selection is deterministic: explicit
 * skills first, then intent co-skills, then concern skills by score and fixed
 * concern priority, then the remaining budget.
 */
export function selectSkills(input: SelectorInput): SelectorResult {
  const {
    prompt,
    intents,
    concerns,
    maintainSubtype,
    questionForm,
    explicit,
    activated,
    unactivated,
    config,
    contentLengths,
    scores,
    agentDefault,
  } = input;

  const normalized = stripCodeFences(normalizePrompt(prompt)).replace(/@[a-z0-9-]+/g, " ");
  const featureScale = matchesAny(normalized, FEATURE_SCALE_TERMS);
  const broadReview = matchesAny(normalized, BROAD_REVIEW_TERMS);

  const selected: string[] = [];
  const selectedSet = new Set<string>();
  const attach: Array<{ id: string }> = [];
  const dropped: Array<{ id: string; reason: string }> = [];
  const droppedSet = new Set<string>();
  const reasonCodes: string[] = [];

  const routerSkillCap = Math.min(Math.max(1, config.maxSkills), 4);
  const routerCharCap = Math.min(Math.max(1, config.maxSkillChars), 16_000);
  let totalChars = 0;

  const drop = (id: string, reason: string): void => {
    if (droppedSet.has(id)) return;
    droppedSet.add(id);
    dropped.push({ id, reason });
  };

  // Explicit skills are user intent: keep every one, never attach them again,
  // and let them bypass the soft budget.
  const explicitIDs = [...new Set(explicit.map((entry) => entry.id))];
  for (const id of explicitIDs) {
    selected.push(id);
    selectedSet.add(id);
    totalChars += contentLength(contentLengths, id);
    reasonCodes.push(`explicit:@${id}`);
  }
  if (explicitIDs.length > config.maxSkills || totalChars > config.maxSkillChars) {
    reasonCodes.push("budget:explicit-overflow");
  }

  const unactivatedByID = new Map(unactivated.map((entry) => [entry.id, entry]));

  const tryAdd = (id: string, reason: string): void => {
    if (selectedSet.has(id)) return;
    if (activated.has(id)) return;

    const previous = unactivatedByID.get(id);
    if (previous?.status === "denied") {
      drop(id, "permission:denied");
      return;
    }
    if (previous?.status === "awaiting-approval") {
      drop(id, "permission:awaiting-approval");
      return;
    }
    if (previous?.status === "pending" && previous.attempts >= 2) {
      drop(id, "activation:not-confirmed");
      return;
    }

    if (selected.length >= routerSkillCap) {
      drop(id, "budget:max-skills");
      return;
    }
    const length = contentLength(contentLengths, id);
    if (totalChars + length > routerCharCap) {
      drop(id, "budget:max-chars");
      return;
    }

    selected.push(id);
    selectedSet.add(id);
    attach.push({ id });
    totalChars += length;
    reasonCodes.push(reason);
  };

  const concernActive = (target: Concern): boolean =>
    concerns.includes(target) && (scores?.[target] ?? 2) >= 2;

  const coSkillsFor = (intent: Intent): Array<{ id: string; reason: string }> => {
    switch (intent) {
      case "Design":
        return [{ id: "php-architecture", reason: "coskill:design-architecture" }];
      case "Build":
        return concernActive("Testing") || featureScale
          ? [{ id: "php-testing", reason: "coskill:build-testing" }]
          : [];
      case "Review": {
        const out = [{ id: "php-standards", reason: "coskill:review-standards" }];
        if (concernActive("Security") || broadReview) {
          out.push({ id: "php-security", reason: "coskill:review-security" });
        }
        return out;
      }
      case "Debug": {
        const out = [{ id: "php-debug", reason: "coskill:debug-debug" }];
        if (concernActive("Testing")) {
          out.push({ id: "php-testing", reason: "coskill:debug-testing" });
        }
        return out;
      }
      case "Test":
        return [{ id: "php-testing", reason: "coskill:test-testing" }];
      case "Maintain": {
        const subtype: MaintainSubtype = maintainSubtype ?? "refactor";
        if (subtype === "modernization") {
          return [
            { id: "php-modernize", reason: "coskill:maintain-modernize" },
            { id: "php-composer", reason: "coskill:maintain-composer" },
          ];
        }
        if (subtype === "dependency") {
          const out = [{ id: "php-composer", reason: "coskill:maintain-composer" }];
          if (concernActive("Testing")) {
            out.push({ id: "php-testing", reason: "coskill:maintain-testing" });
          }
          return out;
        }
        const out = [{ id: "php-architecture", reason: "coskill:maintain-architecture" }];
        if (concernActive("Testing")) {
          out.push({ id: "php-testing", reason: "coskill:maintain-testing" });
        }
        return out;
      }
    }
  };

  const effectiveIntents: Intent[] =
    intents.length > 0 ? intents : agentDefault ? [agentDefault] : [];

  // Question form suppresses intent co-skills entirely; only concern skills
  // that clear the concern threshold are eligible.
  if (!questionForm) {
    for (const intent of effectiveIntents) {
      for (const coSkill of coSkillsFor(intent)) {
        tryAdd(coSkill.id, coSkill.reason);
      }
    }
  }

  const concernCandidates: CatalogEntry[] = [...CONCERN_SKILL_BY_TARGET.values()]
    .filter((entry) => concerns.includes(entry.target as Concern))
    .filter((entry) => !questionForm || concernActive(entry.target as Concern))
    .sort((a, b) => {
      const byScore = (scores?.[b.target] ?? 2) - (scores?.[a.target] ?? 2);
      if (byScore !== 0) return byScore;
      const byPriority =
        CONCERN_PRIORITY.indexOf(a.target as Concern) -
        CONCERN_PRIORITY.indexOf(b.target as Concern);
      if (byPriority !== 0) return byPriority;
      return a.order - b.order;
    });

  for (const entry of concernCandidates) {
    tryAdd(entry.id, `concern:${slug(entry.target)}`);
  }

  // Fill any remaining budget from targets already in scope after gating.
  // Phase 1 has one concern skill per target, so this is normally a no-op,
  // but it keeps the ordering rule explicit for future skills.
  const targetsInScope = new Set<Target>([...concerns, ...effectiveIntents]);
  const fillCandidates: CatalogEntry[] = [...CONCERN_SKILL_BY_TARGET.values()]
    .filter((entry) => targetsInScope.has(entry.target))
    .filter((entry) => !selectedSet.has(entry.id))
    .sort((a, b) => {
      const byScore = (scores?.[b.target] ?? 2) - (scores?.[a.target] ?? 2);
      if (byScore !== 0) return byScore;
      const byPriority =
        CONCERN_PRIORITY.indexOf(a.target as Concern) -
        CONCERN_PRIORITY.indexOf(b.target as Concern);
      if (byPriority !== 0) return byPriority;
      return a.order - b.order;
    });
  for (const entry of fillCandidates) {
    tryAdd(entry.id, `concern:${slug(entry.target)}`);
  }

  return {
    selected,
    attach,
    dropped,
    reasonCodes: [...new Set(reasonCodes)],
  };
}
