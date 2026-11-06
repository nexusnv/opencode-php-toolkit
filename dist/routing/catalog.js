export const CATALOG = [
    { id: "php-architecture", target: "Architecture", kind: "concern", order: 10 },
    { id: "php-security", target: "Security", kind: "concern", order: 20 },
    { id: "php-testing", target: "Testing", kind: "concern", order: 30 },
    { id: "php-debug", target: "Debugging", kind: "concern", order: 40 },
    { id: "php-static-analysis", target: "Static analysis", kind: "concern", order: 50 },
    { id: "php-standards", target: "Coding standards", kind: "concern", order: 60 },
    { id: "php-composer", target: "Dependencies", kind: "concern", order: 70 },
    { id: "php-modernize", target: "Maintain", kind: "maintain-coskill", order: 80 },
];
export const CATALOG_BY_ID = new Map(CATALOG.map((entry) => [entry.id, entry]));
export const CONCERN_SKILL_BY_TARGET = new Map(CATALOG.filter((entry) => entry.kind === "concern").map((entry) => [entry.target, entry]));
//# sourceMappingURL=catalog.js.map