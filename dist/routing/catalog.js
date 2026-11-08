// One entry maps one target to one skill. Pattern skills share the
// "Design patterns" target and are chosen by name, not by target score.
export const CATALOG = [
    { id: "php-architecture", target: "Architecture", order: 10, kind: "concern" },
    { id: "php-security", target: "Security", order: 20, kind: "concern" },
    { id: "php-testing", target: "Testing", order: 30, kind: "concern" },
    { id: "php-debug", target: "Debugging", order: 40, kind: "concern" },
    { id: "php-static-analysis", target: "Static analysis", order: 50, kind: "concern" },
    { id: "php-standards", target: "Coding standards", order: 60, kind: "concern" },
    { id: "php-composer", target: "Dependencies", order: 70, kind: "concern" },
    { id: "php-modernize", target: "Maintain", order: 75, kind: "maintain" },
    { id: "php-design-patterns", target: "Design patterns", order: 80, kind: "pattern-index" },
    {
        id: "php-pattern-strategy",
        target: "Design patterns",
        order: 81,
        kind: "pattern-core",
        pattern: "strategy",
    },
    {
        id: "php-pattern-adapter",
        target: "Design patterns",
        order: 82,
        kind: "pattern-core",
        pattern: "adapter",
    },
    {
        id: "php-pattern-decorator",
        target: "Design patterns",
        order: 83,
        kind: "pattern-core",
        pattern: "decorator",
    },
    {
        id: "php-pattern-state",
        target: "Design patterns",
        order: 84,
        kind: "pattern-core",
        pattern: "state",
    },
];
const CONCERN_ENTRIES = CATALOG.filter((entry) => entry.kind === "concern");
export const CONCERN_SKILL_BY_TARGET = new Map(CONCERN_ENTRIES.map((entry) => [entry.target, entry]));
export const PATTERN_INDEX = CATALOG.find((entry) => entry.kind === "pattern-index");
export const PATTERN_CORE_BY_NAME = new Map(CATALOG.filter((entry) => entry.kind === "pattern-core" && entry.pattern !== undefined).map((entry) => [entry.pattern, entry]));
//# sourceMappingURL=catalog.js.map