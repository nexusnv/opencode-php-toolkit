import { CONCERN_PRIORITY, CONCERN_SIGNALS, INTENT_PRIORITY, INTENT_SIGNALS } from "./signals.js";
const WORD = /[\p{L}\p{N}_]/u;
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function termToRegex(term) {
    const isPrefix = term.endsWith("*");
    const body = escapeRegExp(isPrefix ? term.slice(0, -1) : term);
    return new RegExp(`(?<!${WORD.source})${body}${isPrefix ? "[\\p{L}\\p{N}_]*" : ""}(?!${WORD.source})`, "giu");
}
export function normalizePrompt(prompt) {
    return prompt.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}
export function stripCodeFences(prompt) {
    return prompt
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/~~~[\s\S]*?~~~/g, " ")
        .replace(/[ \t]*\r?\n[ \t]*/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
// Framework names are deliberately excluded: framework terms set
// frameworkContext but do not satisfy PHP context on their own.
const PHP_TERMS = [
    "php",
    "composer",
    "phpunit",
    "pest",
    "phpstan",
    "psalm",
    "php-cs-fixer",
    "psr",
];
const FRAMEWORK_TERMS = [
    "laravel",
    "symfony",
    "wordpress",
    "drupal",
    "magento",
    "cakephp",
    "yii",
    "slim",
    "laminas",
    "mezzio",
];
function hasPhpTerm(text) {
    return PHP_TERMS.some((term) => termToRegex(term).test(text));
}
function attachedPhpFile(files) {
    return files.some((file) => /(?:^|\/)(?:composer\.json|[^/]+\.php)$/i.test(file));
}
const PHP_AGENTS = new Set([
    "php-reviewer",
    "php-debugger",
    "php-modernizer",
    "php-tester",
    "php-architect",
]);
const AGENT_SIGNALS = {
    "php-reviewer": { Review: 3, Security: 2, "Coding standards": 2 },
    "php-debugger": { Debug: 3, Testing: 2, Debugging: 2 },
    "php-modernizer": { Maintain: 3, Dependencies: 2, Testing: 2 },
    "php-tester": { Test: 3, Testing: 3, "Coding standards": 1 },
    "php-architect": { Design: 3, Architecture: 3, "Design patterns": 2, Testing: 1 },
};
const AGENT_DEFAULTS = {
    "php-reviewer": "Review",
    "php-debugger": "Debug",
    "php-modernizer": "Maintain",
    "php-tester": "Test",
    "php-architect": "Design",
};
const QUESTION_FORM = /\b(what is|what are|how does|how do|why|compare|explain)\b/;
// A question is only a knowledge question when it contains no actionable
// build/design/debug/test/maintain verb. Keep this list in sync with the
// intent dictionaries: nouns such as "architecture" or "pattern" do not
// count as action verbs.
const ACTION_VERB = /\b(add|implement|create|build|extend|support|introduce|integrate|generate|scaffold|design|architect|restructure|decouple|modularize|extract|split|abstract|review|audit|inspect|assess|critique|fix|debug|reproduce|test|upgrade|migrate|refactor|modernize|deprecate|clean up|cleanup|simplify|reorganize|consolidate|rename|remove|update)\b/;
const NEGATIVE_SIGNALS = [
    {
        terms: ["just fix", "quick fix", "small fix", "typo", "rename variable", "one-line", "minor change"],
        code: "negative:quick-fix",
        effects: { Architecture: -3, "Design patterns": -3, Design: -1 },
    },
    {
        terms: ["no tests", "don't add tests", "skip tests"],
        code: "negative:no-tests",
        effects: { Testing: -3, Test: -2 },
    },
    {
        terms: ["no refactor", "don't refactor"],
        code: "negative:no-refactor",
        effects: { Maintain: -3, Architecture: -2 },
    },
];
const PATTERN_NAME_TERMS = [
    "strategy",
    "adapter",
    "decorator",
    "state",
    "observer",
    "builder",
    "repository",
    "factory",
    "ports and adapters",
    "pattern",
];
const MAINTAIN_GROUPS = {
    modernization: [
        "upgrade",
        "migrate",
        "deprecation",
        "rector",
        "php 8",
        "compatibility",
        "legacy",
    ],
    dependency: [
        "dependency update",
        "composer update",
        "package update",
        "outdated",
        "lock file",
    ],
    refactor: [
        "refactor",
        "clean up",
        "technical debt",
        "dead code",
        "rename",
        "simplify",
        "reorganize",
        "consolidate",
    ],
};
const UPGRADE_TERMS = ["upgrade", "migrate", "modernize", "deprecation", "rector", "php 8"];
const ALL_TARGETS = [...INTENT_PRIORITY, ...CONCERN_PRIORITY];
function emptyScores() {
    const scores = {};
    for (const target of ALL_TARGETS)
        scores[target] = 0;
    return scores;
}
function slug(target) {
    return target.toLowerCase().replace(/ /g, "-");
}
function consumeRanges(text, ranges) {
    let out = text;
    for (const [start, end] of ranges.sort((a, b) => b[0] - a[0])) {
        out = out.slice(0, start) + " ".repeat(end - start) + out.slice(end);
    }
    return out;
}
/**
 * Matches one target's terms. Longer phrases consume their span first, so
 * "clean architecture" cannot also count as "architecture" for the same
 * target. Different targets are scored independently: the same noun may be a
 * legitimate signal for both an intent and a concern.
 */
function matchTarget(working, entries) {
    const byTerm = new Map();
    for (const entry of entries) {
        for (const term of entry.terms) {
            byTerm.set(term, Math.max(byTerm.get(term) ?? 0, entry.weight));
        }
    }
    const sorted = [...byTerm.entries()].sort((a, b) => b[0].length - a[0].length || b[1] - a[1] || a[0].localeCompare(b[0]));
    let text = working;
    let score = 0;
    const terms = new Map();
    for (const [term, weight] of sorted) {
        const ranges = [];
        for (const match of text.matchAll(termToRegex(term))) {
            const start = match.index ?? 0;
            ranges.push([start, start + match[0].length]);
        }
        if (!ranges.length)
            continue;
        score += weight;
        terms.set(term, weight);
        text = consumeRanges(text, ranges);
    }
    return { score, terms };
}
function matchFileSignals(files) {
    const points = {};
    const reasons = [];
    let php = false;
    let testing = 0;
    let staticAnalysis = 0;
    let standards = 0;
    let maintain = 0;
    let architecture = 0;
    for (const raw of files) {
        const file = raw.replace(/\\/g, "/").replace(/^\.\//, "");
        const base = file.split("/").pop() ?? file;
        if (/\.php$/i.test(base) || base === "composer.json")
            php = true;
        if (/(?:^|\/)(?:tests?|spec)\//.test(file) ||
            /Test\.php$/i.test(base) ||
            /^phpunit\.xml/i.test(base) ||
            base === "Pest.php") {
            testing = 2;
        }
        if (/^phpstan\.neon/i.test(base) || base === "psalm.xml")
            staticAnalysis = 2;
        if (base === ".php-cs-fixer.php" || /^phpcs\.xml/i.test(base))
            standards = 2;
        if (base === "rector.php")
            maintain = 2;
        if (base === "deptrac.yaml" || base === "deptrac.yml")
            architecture = Math.max(architecture, 2);
        if (/(?:^|\/)(?:src\/Domain|Domain)\//.test(file) || /(?:^|\/)migrations\//.test(file)) {
            architecture = Math.max(architecture, 1);
        }
    }
    if (testing) {
        points.Testing = testing;
        reasons.push("file:tests");
    }
    if (staticAnalysis) {
        points["Static analysis"] = staticAnalysis;
        reasons.push("file:static-analysis");
    }
    if (standards) {
        points["Coding standards"] = standards;
        reasons.push("file:standards");
    }
    if (maintain) {
        points.Maintain = maintain;
        reasons.push("file:maintain");
    }
    if (architecture) {
        points.Architecture = architecture;
        reasons.push("file:architecture");
    }
    if (php)
        reasons.push("file:php");
    return { points, php, reasons };
}
function applyNegativeSignals(working, scores, reasons) {
    for (const group of NEGATIVE_SIGNALS) {
        if (!group.terms.some((term) => termToRegex(term).test(working)))
            continue;
        for (const [target, effect] of Object.entries(group.effects)) {
            scores[target] += effect;
        }
        reasons.push(group.code);
    }
}
function patternNamePresent(working) {
    return PATTERN_NAME_TERMS.some((term) => termToRegex(term).test(working));
}
function explicitArchitectureRequest(working) {
    return /\barchitect(?:ure|ural)?\b/.test(working);
}
function bestMaintainSubtype(terms) {
    let best = null;
    let bestScore = 0;
    for (const subtype of ["modernization", "dependency", "refactor"]) {
        const score = MAINTAIN_GROUPS[subtype].reduce((sum, term) => sum + (terms.get(term) ?? 0), 0);
        if (score > bestScore) {
            best = subtype;
            bestScore = score;
        }
    }
    return best;
}
function sortByScoreAndPriority(targets, scores, priority) {
    return [...targets].sort((a, b) => {
        const byScore = scores[b] - scores[a];
        if (byScore !== 0)
            return byScore;
        return priority.indexOf(a) - priority.indexOf(b);
    });
}
export function classify(input) {
    const { prompt, files, agent, profile, architectureMode = "risk" } = input;
    const withoutExplicit = stripCodeFences(normalizePrompt(prompt))
        .replace(/@[a-z0-9-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const scores = emptyScores();
    const frameworkContext = FRAMEWORK_TERMS.filter((term) => termToRegex(term).test(withoutExplicit));
    const fileSignals = matchFileSignals(files);
    const phpContext = hasPhpTerm(withoutExplicit) ||
        attachedPhpFile(files) ||
        (agent !== null && PHP_AGENTS.has(agent));
    if (!phpContext) {
        const reasonCodes = ["php-context:absent"];
        for (const framework of frameworkContext)
            reasonCodes.push(`framework:${framework}`);
        return {
            intents: [],
            concerns: [],
            scores,
            maintainSubtype: null,
            frameworkContext,
            phpContext: false,
            questionForm: false,
            reasonCodes,
        };
    }
    const reasons = [];
    const matchedTerms = new Map();
    const matchedByTarget = new Map();
    for (const entry of INTENT_SIGNALS) {
        const existing = matchedByTarget.get(entry.target) ?? new Map();
        matchedByTarget.set(entry.target, existing);
    }
    for (const entry of CONCERN_SIGNALS) {
        const existing = matchedByTarget.get(entry.target) ?? new Map();
        matchedByTarget.set(entry.target, existing);
    }
    for (const target of ALL_TARGETS) {
        const entries = [...INTENT_SIGNALS, ...CONCERN_SIGNALS].filter((entry) => entry.target === target);
        const match = matchTarget(withoutExplicit, entries);
        scores[target] += match.score;
        for (const [term, weight] of match.terms) {
            matchedTerms.set(term, Math.max(matchedTerms.get(term) ?? 0, weight));
            matchedByTarget.get(target)?.set(term, weight);
        }
    }
    for (const [target, points] of Object.entries(fileSignals.points)) {
        scores[target] += points;
    }
    reasons.push(...fileSignals.reasons);
    if (profile) {
        if (profile.tools.phpunit || profile.tools.pest) {
            scores.Testing += 1;
            reasons.push("profile:phpunit");
        }
        if (profile.tools.phpstan || profile.tools.psalm) {
            scores["Static analysis"] += 1;
            reasons.push("profile:phpstan");
        }
        if (profile.tools.csFixer || profile.tools.phpcs) {
            scores["Coding standards"] += 1;
            reasons.push("profile:standards");
        }
        if (profile.tools.deptrac) {
            scores.Architecture += 1;
            reasons.push("profile:deptrac");
        }
    }
    if (agent && AGENT_SIGNALS[agent]) {
        for (const [target, points] of Object.entries(AGENT_SIGNALS[agent])) {
            scores[target] += points;
        }
        reasons.push(`agent:${agent}`);
    }
    for (const target of ALL_TARGETS) {
        if (scores[target] > 6)
            scores[target] = 6;
    }
    applyNegativeSignals(withoutExplicit, scores, reasons);
    const questionForm = QUESTION_FORM.test(withoutExplicit) && !ACTION_VERB.test(withoutExplicit);
    const rawIntents = INTENT_PRIORITY.filter((intent) => scores[intent] >= 3);
    const gatingApplies = architectureMode !== "off" &&
        rawIntents.some((intent) => intent === "Test" || intent === "Debug" || intent === "Review") &&
        !rawIntents.some((intent) => intent === "Build" || intent === "Design" || intent === "Maintain");
    if (gatingApplies) {
        let gated = false;
        if (scores["Design patterns"] > 0 && !patternNamePresent(withoutExplicit)) {
            scores["Design patterns"] = 0;
            gated = true;
        }
        const architectureWeight3 = [...(matchedByTarget.get("Architecture")?.values() ?? [])].some((weight) => weight === 3);
        if (scores.Architecture > 0 &&
            !architectureWeight3 &&
            !explicitArchitectureRequest(withoutExplicit)) {
            scores.Architecture = 0;
            gated = true;
        }
        if (gated)
            reasons.push("gate:non-design-intent");
    }
    let intents = INTENT_PRIORITY.filter((intent) => scores[intent] >= 3);
    const hasUpgradeSignal = UPGRADE_TERMS.some((term) => matchedTerms.has(term));
    if (intents.includes("Debug") && scores.Design < 5) {
        intents = intents.filter((intent) => intent !== "Design");
    }
    if (intents.includes("Maintain") && hasUpgradeSignal && scores.Debug < 5) {
        intents = intents.filter((intent) => intent !== "Debug");
    }
    if (intents.includes("Review") && scores.Build < 5) {
        intents = intents.filter((intent) => intent !== "Build");
    }
    intents = sortByScoreAndPriority(intents, scores, INTENT_PRIORITY).slice(0, 2);
    let concerns = CONCERN_PRIORITY.filter((concern) => scores[concern] >= 2);
    concerns = sortByScoreAndPriority(concerns, scores, CONCERN_PRIORITY).slice(0, 3);
    if (scores.Security >= 3 && !concerns.includes("Security")) {
        if (concerns.length < 3) {
            concerns.push("Security");
        }
        else {
            concerns[concerns.length - 1] = "Security";
        }
        concerns = sortByScoreAndPriority(concerns, scores, CONCERN_PRIORITY);
    }
    if (intents.length === 0 && agent && AGENT_DEFAULTS[agent]) {
        intents = [AGENT_DEFAULTS[agent]];
    }
    let maintainSubtype = null;
    if (intents.includes("Maintain")) {
        maintainSubtype = bestMaintainSubtype(matchedTerms) ?? "refactor";
    }
    const reasonCodes = [];
    for (const intent of intents)
        reasonCodes.push(`intent:${slug(intent)}`);
    for (const concern of concerns)
        reasonCodes.push(`concern:${slug(concern)}`);
    reasonCodes.push(...reasons);
    for (const framework of frameworkContext)
        reasonCodes.push(`framework:${framework}`);
    if (questionForm)
        reasonCodes.push("question-form");
    return {
        intents,
        concerns,
        scores,
        maintainSubtype,
        frameworkContext,
        phpContext: true,
        questionForm,
        reasonCodes,
    };
}
//# sourceMappingURL=classifier.js.map