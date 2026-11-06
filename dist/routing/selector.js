import { CONCERN_SKILL_BY_TARGET } from "./catalog.js";
import { normalizePrompt, stripCodeFences, termToRegex } from "./classifier.js";
import { CONCERN_PRIORITY } from "./signals.js";
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
];
const BROAD_REVIEW_TERMS = [
    "code review",
    "pr review",
    "pull request review",
    "review this pr",
    "review the pr",
    "audit",
];
function matchesAny(text, terms) {
    return terms.some((term) => termToRegex(term).test(text));
}
function slug(target) {
    return target.toLowerCase().replace(/ /g, "-");
}
function contentLength(contentLengths, id) {
    const value = contentLengths.get(id);
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
/**
 * Selects the eight Phase 1 skills. Selection is deterministic: explicit
 * skills first, then intent co-skills, then concern skills by score and fixed
 * concern priority, then the remaining budget.
 */
export function selectSkills(input) {
    const { prompt, intents, concerns, maintainSubtype, questionForm, explicit, activated, unactivated, config, contentLengths, scores, agentDefault, } = input;
    const normalized = stripCodeFences(normalizePrompt(prompt)).replace(/@[a-z0-9-]+/g, " ");
    const featureScale = matchesAny(normalized, FEATURE_SCALE_TERMS);
    const broadReview = matchesAny(normalized, BROAD_REVIEW_TERMS);
    const selected = [];
    const selectedSet = new Set();
    const attach = [];
    const dropped = [];
    const droppedSet = new Set();
    const reasonCodes = [];
    const routerSkillCap = Math.min(Math.max(1, config.maxSkills), 4);
    const routerCharCap = Math.min(Math.max(1, config.maxSkillChars), 16_000);
    let totalChars = 0;
    // Explicit skills bypass the soft budget, so router selections keep their
    // own count and character budget.
    let routerSkillCount = 0;
    let routerChars = 0;
    const drop = (id, reason) => {
        if (droppedSet.has(id))
            return;
        droppedSet.add(id);
        dropped.push({ id, reason });
    };
    const removeDrop = (id) => {
        const index = dropped.findIndex((entry) => entry.id === id);
        if (index >= 0)
            dropped.splice(index, 1);
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
    const tryAdd = (id, reason) => {
        if (selectedSet.has(id))
            return;
        if (activated.has(id))
            return;
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
        if (routerSkillCount >= routerSkillCap) {
            drop(id, "budget:max-skills");
            return;
        }
        const length = contentLength(contentLengths, id);
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
    const concernActive = (target) => concerns.includes(target) && (scores?.[target] ?? 2) >= 2;
    const coSkillsFor = (intent) => {
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
                const subtype = maintainSubtype ?? "refactor";
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
    const effectiveIntents = intents.length > 0 ? intents : agentDefault ? [agentDefault] : [];
    // Question form suppresses intent co-skills entirely; only concern skills
    // that clear the concern threshold are eligible.
    const coSkillSet = new Set();
    if (!questionForm) {
        for (const intent of effectiveIntents) {
            for (const coSkill of coSkillsFor(intent)) {
                coSkillSet.add(coSkill.id);
                tryAdd(coSkill.id, coSkill.reason);
            }
        }
    }
    const concernCandidates = [...CONCERN_SKILL_BY_TARGET.values()]
        .filter((entry) => concerns.includes(entry.target))
        .filter((entry) => !questionForm || concernActive(entry.target))
        .sort((a, b) => {
        const byScore = (scores?.[b.target] ?? 2) - (scores?.[a.target] ?? 2);
        if (byScore !== 0)
            return byScore;
        const byPriority = CONCERN_PRIORITY.indexOf(a.target) -
            CONCERN_PRIORITY.indexOf(b.target);
        if (byPriority !== 0)
            return byPriority;
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
    const securitySuppressed = activated.has("php-security") ||
        securityPrevious?.status === "denied" ||
        securityPrevious?.status === "awaiting-approval" ||
        (securityPrevious?.status === "pending" && securityPrevious.attempts >= 2);
    if (concerns.includes("Security") &&
        securityScore >= 5 &&
        !securitySuppressed &&
        !selectedSet.has("php-security")) {
        const securityLength = contentLength(contentLengths, "php-security");
        const hardSkillCap = 4;
        const hardCharCap = 16_000;
        if (selected.length < hardSkillCap &&
            totalChars + securityLength <= hardCharCap) {
            removeDrop("php-security");
            selected.push("php-security");
            selectedSet.add("php-security");
            attach.push({ id: "php-security" });
            totalChars += securityLength;
            routerChars += securityLength;
            routerSkillCount += 1;
            reasonCodes.push("security:hard-ceiling");
        }
        else {
            // Co-skills outrank concern skills in the fixed tie-break order, so the
            // security exception may replace only a concern/fill skill, never an
            // explicit skill or another intent co-skill.
            let victimIndex = -1;
            for (let index = selected.length - 1; index >= 0; index -= 1) {
                const id = selected[index];
                if (explicitSet.has(id) || coSkillSet.has(id) || id === "php-security")
                    continue;
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
                if (attachIndex >= 0)
                    attach.splice(attachIndex, 1);
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
            }
            else {
                drop("php-security", selected.length >= hardSkillCap ? "budget:max-skills" : "budget:max-chars");
            }
        }
    }
    // Fill any remaining budget from targets already in scope after gating.
    // Phase 1 has one concern skill per target, so this is normally a no-op,
    // but it keeps the ordering rule explicit for future skills.
    const targetsInScope = new Set([...concerns, ...effectiveIntents]);
    const fillCandidates = [...CONCERN_SKILL_BY_TARGET.values()]
        .filter((entry) => targetsInScope.has(entry.target))
        .filter((entry) => !selectedSet.has(entry.id))
        .sort((a, b) => {
        const byScore = (scores?.[b.target] ?? 2) - (scores?.[a.target] ?? 2);
        if (byScore !== 0)
            return byScore;
        const byPriority = CONCERN_PRIORITY.indexOf(a.target) -
            CONCERN_PRIORITY.indexOf(b.target);
        if (byPriority !== 0)
            return byPriority;
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
//# sourceMappingURL=selector.js.map