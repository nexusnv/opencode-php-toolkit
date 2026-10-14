import { execFile } from "node:child_process";
function run(cmd, args, cwd, timeoutMs, signal) {
    return new Promise((resolve) => {
        const child = execFile(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
            resolve({
                ok: !err,
                stdout: String(stdout ?? "").slice(0, 20000),
                stderr: String(err?.message ?? stderr ?? "").slice(0, 8000),
            });
        });
        signal?.addEventListener("abort", () => {
            try {
                child.kill("SIGKILL");
            }
            catch {
                // ignore
            }
        });
    });
}
export async function phpLint(paths, cwd, signal) {
    if (!paths.length)
        return "php_lint: no paths given. Pass one or more .php files.";
    const out = [];
    for (const p of paths.slice(0, 20)) {
        const r = await run("php", ["-l", p], cwd, 15000, signal);
        out.push(`${p}: ${r.ok ? "OK" : "FAIL"}\n${r.stdout}${r.stderr}`.trim());
    }
    return out.join("\n\n").slice(0, 20000) || "php_lint: empty result.";
}
export async function composerValidate(cwd, signal) {
    const r = await run("composer", ["validate", "--no-check-publish"], cwd, 30000, signal);
    if (r.stderr.includes("command not found") || r.stderr.includes("ENOENT")) {
        return "composer not found on PATH. Install from https://getcomposer.org/download/ then retry.";
    }
    return `${r.ok ? "composer validate: OK" : "composer validate: FAIL"}\n${r.stdout}\n${r.stderr}`.trim().slice(0, 12000);
}
export async function composerAudit(cwd, signal) {
    const r = await run("composer", ["audit", "--format=json"], cwd, 60000, signal);
    const combined = `${r.stdout}\n${r.stderr}`.trim();
    if (!r.ok && !r.stdout.includes("{")) {
        return `composer audit could not run:\n${combined.slice(0, 4000)}\nHint: needs composer.json + network. Run \`composer validate\` first.`;
    }
    return `composer audit result:\n${combined.slice(0, 20000)}`;
}
//# sourceMappingURL=php-tools.js.map