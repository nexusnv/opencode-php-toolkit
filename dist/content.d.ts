export declare const PKG_ROOT: string;
export declare function loadText(rel: string): Promise<string>;
export declare function parseFrontmatter(body: string): {
    front: Record<string, string>;
    content: string;
};
export declare const SKILL_IDS: readonly ["php-standards", "php-static-analysis", "php-testing", "php-security", "php-modernize", "php-composer", "php-architecture", "php-debug"];
export declare const COMMAND_DEFS: readonly [{
    readonly file: "commands/php-review.md";
    readonly name: "php-review";
    readonly fallback: "Review PHP code for correctness, security, and style";
}, {
    readonly file: "commands/php-analyze.md";
    readonly name: "php-analyze";
    readonly fallback: "Run PHP static analysis guidance (PHPStan/Psalm)";
}, {
    readonly file: "commands/php-fix-style.md";
    readonly name: "php-fix-style";
    readonly fallback: "Fix PHP code style (dry-run first)";
}, {
    readonly file: "commands/php-test.md";
    readonly name: "php-test";
    readonly fallback: "Run and improve PHP tests (PHPUnit/Pest)";
}, {
    readonly file: "commands/php-audit.md";
    readonly name: "php-audit";
    readonly fallback: "Audit PHP dependencies and security";
}, {
    readonly file: "commands/php-upgrade.md";
    readonly name: "php-upgrade";
    readonly fallback: "Plan PHP 8.1+ upgrade with Rector dry-run";
}, {
    readonly file: "commands/php-scaffold.md";
    readonly name: "php-scaffold";
    readonly fallback: "Scaffold PSR-4 PHP class + test";
}];
