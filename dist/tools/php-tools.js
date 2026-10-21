import { execFile } from "node:child_process";
function run(cmd, args, cwd, timeoutMs, signal) {
    return new Promise((resolve) => {
        const child = execFile(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
            resolve({
                ok: !err,
                stdout: String(stdout ?? "").slice(0, 20000),
                stderr: String(err?.message ?? stderr ?? "").slice(0, 8000),
                code: err?.code ?? null,
                killed: Boolean(err?.killed),
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
function isMissingBinary(result) {
    return result.code === "ENOENT" || result.stderr.includes("command not found");
}
/** Counts advisories in `composer audit --format=json` output. */
export function countAdvisories(stdout) {
    try {
        const start = stdout.indexOf("{");
        const end = stdout.lastIndexOf("}");
        if (start === -1 || end <= start)
            return 0;
        const parsed = JSON.parse(stdout.slice(start, end + 1));
        const advisories = parsed?.advisories;
        if (!advisories || typeof advisories !== "object")
            return 0;
        let total = 0;
        for (const list of Object.values(advisories)) {
            if (Array.isArray(list))
                total += list.length;
        }
        return total;
    }
    catch {
        return 0;
    }
}
export async function phpLint(paths, cwd, signal) {
    const files = Array.isArray(paths) ? paths : [];
    if (!files.length) {
        return { text: "php_lint: no paths given. Pass one or more .php files.", status: "ok", findings: 0 };
    }
    const out = [];
    let findings = 0;
    let linted = 0;
    for (const p of files.slice(0, 20)) {
        const r = await run("php", ["-l", p], cwd, 15000, signal);
        if (isMissingBinary(r)) {
            out.push(`${p}: php not found on PATH. Install PHP 8.1+ then retry.`);
            continue;
        }
        if (r.killed) {
            out.push(`${p}: lint timed out or was aborted.`);
            continue;
        }
        linted += 1;
        // The file failed to parse: the lint worked, the code did not.
        if (!r.ok)
            findings += 1;
        out.push(`${p}: ${r.ok ? "OK" : "FAIL"}\n${r.stdout}${r.stderr}`.trim());
    }
    const text = out.join("\n\n").slice(0, 20000) || "php_lint: empty result.";
    if (!linted) {
        return { text, status: "error", findings: 0 };
    }
    return { text, status: "ok", findings };
}
export async function composerValidate(cwd, signal) {
    const r = await run("composer", ["validate", "--no-check-publish"], cwd, 30000, signal);
    if (isMissingBinary(r)) {
        return {
            text: "composer not found on PATH. Install from https://getcomposer.org/download/ then retry.",
            status: "error",
            findings: 0,
        };
    }
    if (r.killed) {
        return { text: "composer validate timed out or was aborted.", status: "error", findings: 0 };
    }
    const text = `${r.ok ? "composer validate: OK" : "composer validate: FAIL"}\n${r.stdout}\n${r.stderr}`
        .trim()
        .slice(0, 12000);
    // A failing validate means the manifest is broken - a finding, not a tool error.
    return { text, status: "ok", findings: r.ok ? 0 : 1 };
}
export async function composerAudit(cwd, signal) {
    const r = await run("composer", ["audit", "--format=json"], cwd, 60000, signal);
    if (isMissingBinary(r)) {
        return {
            text: `composer audit could not run:\n${r.stderr.slice(0, 2000) || "composer not found on PATH."}\nHint: needs composer.json + network. Run \`composer validate\` first.`,
            status: "error",
            findings: 0,
        };
    }
    const combined = `${r.stdout}\n${r.stderr}`.trim();
    if (r.killed || (!r.ok && !r.stdout.includes("{"))) {
        return {
            text: `composer audit could not run:\n${combined.slice(0, 4000)}\nHint: needs composer.json + network. Run \`composer validate\` first.`,
            status: "error",
            findings: 0,
        };
    }
    // composer audit exits non-zero when it finds advisories - that is a finding.
    return {
        text: `composer audit result:\n${combined.slice(0, 20000)}`,
        status: "ok",
        findings: countAdvisories(r.stdout),
    };
}
//# sourceMappingURL=php-tools.js.map