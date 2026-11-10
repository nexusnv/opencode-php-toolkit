import { MAX_ROUTER_SKILL_CHARS } from "../config.js";
import { CONCERN_SKILL_BY_TARGET, PATTERN_CORE_BY_NAME, PATTERN_INDEX, type CatalogEntry } from "./catalog.js";
import { normalizePrompt, stripCodeFences, termToRegex } from "./classifier.js";
import { CONCERN_PRIORITY } from "./signals.js";
import type {
  Concern,
  Intent,
  MaintainSubtype,
  PromotedPattern,
  Target,
  UnactivatedSkill,
} from "./types.js";

export interface SelectorInput {
  prompt: string;
  intents: Intent[];
  concerns: Concern[];
  maintainSubtype: MaintainSubtype | null;
  questionForm: boolean;
  /** Explicit comparison language, independent of question form. */
  comparison?: boolean;
  explicit: ReadonlyArray<{ id: string }>;
  activated: ReadonlySet<string>;
  unactivated: readonly UnactivatedSkill[];
  config: { maxSkills: number; maxSkillChars: number };
  contentLengths: ReadonlyMap<string, number>;
  /** Skills the host can actually resolve; omitted means no availability filter. */
  available?: ReadonlySet<string>;
  /** Skills denied by the session's current permission snapshot. */
  denied?: ReadonlySet<string>;
  scores?: Partial<Record<Target, number>>;
  agentDefault?: Intent | null;
  /** Promoted pattern names matched in the prompt, strongest first. */
  promotedPatterns?: readonly PromotedPattern[];
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
    comparison = false,
    explicit,
    activated,
    unactivated,
    config,
    contentLengths,
    available,
    denied,
    scores,
    agentDefault,
    promotedPatterns = [],
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
  const routerCharCap = Math.min(Math.max(1, config.maxSkillChars), MAX_ROUTER_SKILL_CHARS);
  const hardSkillCap = 4;
  const hardCharCap = MAX_ROUTER_SKILL_CHARS;
  let totalChars = 0;
  // Explicit skills bypass the soft budget, so router selections keep their
  // own count and character budget.
  let routerSkillCount = 0;
  let routerChars = 0;

  const drop = (id: string, reason: string): void => {
    if (droppedSet.has(id)) return;
    droppedSet.add(id);
    dropped.push({ id, reason });
  };
  const removeDrop = (id: string): void => {
    const index = dropped.findIndex((entry) => entry.id === id);
    if (index >= 0) dropped.splice(index, 1);
    droppedSet.delete(id);
  };

  // Explicit skills are user intent: keep every one, never attach them again,
  // and let them bypass the soft budget.
  const explicitIDs = [...new Set(explicit.map((entry) => entry.id))];
  const explicitSet = new Set(explicitIDs);
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
    // Denied and unavailable skills must not consume the router budget: a
    // later permitted candidate should get the slot instead.
    if (denied?.has(id)) {
      drop(id, "permission:denied");
      return;
    }
    if (available && !available.has(id)) {
      drop(id, "skill:unavailable");
      return;
    }

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

    // The hard ceiling applies to the whole selection, including explicit
    // skills, which bypass only the soft router budget.
    if (selected.length >= hardSkillCap) {
      drop(id, "budget:max-skills");
      return;
    }
    const length = contentLength(contentLengths, id);
    if (totalChars + length > hardCharCap) {
      drop(id, "budget:max-chars");
      return;
    }
    if (routerSkillCount >= routerSkillCap) {
      drop(id, "budget:max-skills");
      return;
    }
    if (routerChars + length > routerCharCap) {
      drop(id, "budget:max-chars");
      return;
    }

    selected.push(id);
    selectedSet.add(id);
    attach.push({ id });
    totalChars += length;
    routerChars += length;
    routerSkillCount += 1;
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
  const coSkillSet = new Set<string>();
  if (!questionForm) {
    for (const intent of effectiveIntents) {
      for (const coSkill of coSkillsFor(intent)) {
        coSkillSet.add(coSkill.id);
        tryAdd(coSkill.id, coSkill.reason);
      }
    }
  }

  // Pattern skills are co-skills of the Design intent and of any actionable
  // task with Patterns >= 2. A comparison or knowledge question with several
  // names uses the index because comparing patterns is the index's job.
  const patternChoices = (): Array<{ id: string; reason: string }> => {
    const patternsScore = scores?.["Design patterns"] ?? 0;
    const design = effectiveIntents.includes("Design");
    const actionable = effectiveIntents.some(
      (intent) =>
        intent === "Build" || intent === "Design" || intent === "Review" || intent === "Maintain",
    );

    if (promotedPatterns.length === 0) {
      return design || patternsScore >= 2
        ? [{ id: PATTERN_INDEX.id, reason: "pattern:index" }]
        : [];
    }
    // Design is the one intent where the index is required below the normal
    // Patterns >= 2 gate; every other intent respects the threshold.
    if (!design && patternsScore < 2) return [];
    // Comparisons use the index regardless of question form. A non-comparison
    // question that still carries an actionable intent (for example a how-to
    // request with "please make those changes") selects the core skills.
    if (promotedPatterns.length >= 2 && (comparison || !actionable)) {
      return [{ id: PATTERN_INDEX.id, reason: "pattern:index" }];
    }

    const wanted = promotedPatterns.slice(0, actionable ? 2 : 1);
    const out: Array<{ id: string; reason: string }> = [];
    for (const name of wanted) {
      const entry = PATTERN_CORE_BY_NAME.get(name);
      if (entry) out.push({ id: entry.id, reason: `pattern:${name}` });
    }
    return out;
  };

  for (const choice of patternChoices()) {
    coSkillSet.add(choice.id);
    tryAdd(choice.id, choice.reason);
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

  // High-confidence Security may use the fourth slot or replace the
  // lowest-priority non-explicit router skill (spec §7.5). Explicit skills and
  // permission/activation suppression always win over this exception.
  const securityScore = scores?.["Security"] ?? 0;
  const securityPrevious = unactivatedByID.get("php-security");
  const securitySuppressed =
    activated.has("php-security") ||
    denied?.has("php-security") === true ||
    (available !== undefined && !available.has("php-security")) ||
    securityPrevious?.status === "denied" ||
    securityPrevious?.status === "awaiting-approval" ||
    (securityPrevious?.status === "pending" && securityPrevious.attempts >= 2);
  if (
    concerns.includes("Security") &&
    securityScore >= 5 &&
    !securitySuppressed &&
    !selectedSet.has("php-security")
  ) {
    const securityLength = contentLength(contentLengths, "php-security");
    if (
      selected.length < hardSkillCap &&
      totalChars + securityLength <= hardCharCap
    ) {
      removeDrop("php-security");
      selected.push("php-security");
      selectedSet.add("php-security");
      attach.push({ id: "php-security" });
      totalChars += securityLength;
      routerChars += securityLength;
      routerSkillCount += 1;
      reasonCodes.push("security:hard-ceiling");
    } else {
      // Co-skills outrank concern skills in the fixed tie-break order, so the
      // security exception may replace only a concern/fill skill, never an
      // explicit skill or another intent co-skill.
      let victimIndex = -1;
      for (let index = selected.length - 1; index >= 0; index -= 1) {
        const id = selected[index];
        if (explicitSet.has(id) || coSkillSet.has(id) || id === "php-security") continue;
        if (totalChars - contentLength(contentLengths, id) + securityLength <= hardCharCap) {
          victimIndex = index;
          break;
        }
      }
      if (victimIndex >= 0) {
        const victim = selected[victimIndex];
        const victimLength = contentLength(contentLengths, victim);
        selected.splice(victimIndex, 1);
        selectedSet.delete(victim);
        const attachIndex = attach.findIndex((entry) => entry.id === victim);
        if (attachIndex >= 0) attach.splice(attachIndex, 1);
        totalChars -= victimLength;
        routerChars -= victimLength;
        routerSkillCount -= 1;
        drop(victim, "budget:security-replacement");
        removeDrop("php-security");
        selected.push("php-security");
        selectedSet.add("php-security");
        attach.push({ id: "php-security" });
        totalChars += securityLength;
        routerChars += securityLength;
        routerSkillCount += 1;
        reasonCodes.push("security:hard-ceiling");
      } else {
        drop(
          "php-security",
          selected.length >= hardSkillCap ? "budget:max-skills" : "budget:max-chars",
        );
      }
    }
  }

  // Fill any remaining budget from targets already in scope after gating.
  // Phase 1 has one concern skill per target, so this is normally a no-op,
  // but it keeps the ordering rule explicit for future skills.
  const targetsInScope = new Set<Target>([...concerns, ...effectiveIntents]);
  const fillCandidates: CatalogEntry[] = [...CONCERN_SKILL_BY_TARGET.values()]
    .filter((entry) => targetsInScope.has(entry.target))
    .filter((entry) => !questionForm || concernActive(entry.target as Concern))
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
