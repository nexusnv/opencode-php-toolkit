import { createHash } from "node:crypto";
export const METRICS_VERSION = 2;
/** Storage keys are `${STORAGE_PREFIX}${projectKey(path)}` - one doc per project. */
export const STORAGE_PREFIX = "php-toolkit.metrics.";
/** Key used by the first (machine-global) implementation, migrated on first read. */
export const LEGACY_STORAGE_KEY = "php-toolkit.metrics";
/** Upper bound on tracked tool/command names, so a corrupt doc cannot bloat. */
const MAX_ENTRIES = 200;
/** Writes are coalesced so a burst of tool calls costs one storage write. */
const PERSIST_DEBOUNCE_MS = 250;
/** Retries after a failed write, with a bounded number of attempts. */
const MAX_WRITE_RETRIES = 3;
/** Stable, filesystem-safe identifier for a project root. */
export function projectKey(path) {
    return createHash("sha256").update(path).digest("hex").slice(0, 12);
}
export function storageKeyFor(path) {
    return `${STORAGE_PREFIX}${projectKey(path)}`;
}
function initialMetrics(project) {
    return {
        version: METRICS_VERSION,
        startedAt: new Date().toISOString(),
        projectName: project.name,
        projectPath: project.path,
        tools: {},
        commands: {},
        triggerHits: 0,
    };
}
function num(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function nonNegative(value) {
    if (value === undefined)
        return 0;
    return value > 0 ? value : 0;
}
/**
 * Reads tool entries, accepting both the v1 shape (`count`/`okCount`/
 * `errorCount`) and the v2 shape (`runs`/`ok`/`error`). Entries that are not
 * objects are dropped instead of poisoning the counters with NaN.
 */
function migrateTools(raw) {
    if (!raw || typeof raw !== "object")
        return {};
    const out = {};
    for (const [name, value] of Object.entries(raw)) {
        if (!value || typeof value !== "object")
            continue;
        const entry = value;
        const lastStatus = entry.lastStatus === "ok" || entry.lastStatus === "error" ? entry.lastStatus : null;
        out[name] = {
            runs: nonNegative(num(entry.runs) ?? num(entry.count)),
            ok: nonNegative(num(entry.ok) ?? num(entry.okCount)),
            error: nonNegative(num(entry.error) ?? num(entry.errorCount)),
            findings: nonNegative(num(entry.findings)),
            lastUsedAt: typeof entry.lastUsedAt === "string" ? entry.lastUsedAt : "",
            lastStatus,
        };
        if (Object.keys(out).length >= MAX_ENTRIES)
            break;
    }
    return out;
}
function migrateCommands(raw) {
    if (!raw || typeof raw !== "object")
        return {};
    const out = {};
    for (const [name, value] of Object.entries(raw)) {
        if (!value || typeof value !== "object")
            continue;
        const entry = value;
        out[name] = {
            count: nonNegative(num(entry.count)),
            lastUsedAt: typeof entry.lastUsedAt === "string" ? entry.lastUsedAt : "",
        };
        if (Object.keys(out).length >= MAX_ENTRIES)
            break;
    }
    return out;
}
/**
 * Turns whatever is on disk into a valid document. Documents from a newer
 * format are reported as unsupported so the caller can refuse to write over
 * them; older versions are migrated forward.
 */
export function deserialize(raw, project) {
    const base = initialMetrics(project);
    if (!raw || typeof raw !== "object")
        return { metrics: base, supported: true };
    const candidate = raw;
    const version = num(candidate.version) ?? 0;
    if (version > METRICS_VERSION)
        return { metrics: base, supported: false };
    return {
        supported: true,
        metrics: {
            version: METRICS_VERSION,
            startedAt: typeof candidate.startedAt === "string" ? candidate.startedAt : base.startedAt,
            projectName: typeof candidate.projectName === "string" ? candidate.projectName : project.name,
            projectPath: typeof candidate.projectPath === "string" ? candidate.projectPath : project.path,
            tools: migrateTools(candidate.tools),
            commands: migrateCommands(candidate.commands),
            triggerHits: nonNegative(num(candidate.triggerHits)),
        },
    };
}
function emptyDelta() {
    return { tools: {}, commands: {}, triggerHits: 0 };
}
function isEmptyDelta(delta) {
    return (delta.triggerHits === 0 &&
        Object.keys(delta.tools).length === 0 &&
        Object.keys(delta.commands).length === 0);
}
/** Applies pending increments to a document, producing the merged view. */
function applyDelta(base, delta) {
    const tools = {};
    for (const [name, entry] of Object.entries(base.tools)) {
        tools[name] = { ...entry };
    }
    for (const [name, entry] of Object.entries(delta.tools)) {
        const current = tools[name] ?? {
            runs: 0,
            ok: 0,
            error: 0,
            findings: 0,
            lastUsedAt: "",
            lastStatus: null,
        };
        tools[name] = {
            runs: current.runs + entry.runs,
            ok: current.ok + entry.ok,
            error: current.error + entry.error,
            findings: current.findings + entry.findings,
            lastUsedAt: entry.lastUsedAt || current.lastUsedAt,
            lastStatus: entry.lastStatus ?? current.lastStatus,
        };
    }
    const commands = {};
    for (const [name, entry] of Object.entries(base.commands)) {
        commands[name] = { ...entry };
    }
    for (const [name, entry] of Object.entries(delta.commands)) {
        const current = commands[name] ?? { count: 0, lastUsedAt: "" };
        commands[name] = {
            count: current.count + entry.count,
            lastUsedAt: entry.lastUsedAt || current.lastUsedAt,
        };
    }
    return {
        ...base,
        tools,
        commands,
        triggerHits: base.triggerHits + delta.triggerHits,
    };
}
/**
 * Local-only usage + outcome metrics collector for the PHP toolkit.
 *
 * Persists through OpenCode's local storage domain and never emits anything
 * over the network - all data stays inside the user's local environment.
 *
 * One document per project root, so the snapshot a user sees describes the
 * project they are working in rather than every PHP-adjacent directory on the
 * machine.
 *
 * Writes merge pending increments into the latest stored document rather than
 * overwriting it, so two sessions on the same project do not lose each
 * other's counts.
 */
export class MetricsStore {
    storage;
    project;
    base;
    delta = emptyDelta();
    key;
    writable = true;
    wrote = false;
    timer = null;
    retryTimer = null;
    retries = 0;
    reportedFailure = false;
    constructor(storage, project) {
        this.storage = storage;
        this.project = project;
        this.base = initialMetrics(project);
        this.key = storageKeyFor(project.path);
    }
    /** Storage key this store owns. */
    get storageKey() {
        return this.key;
    }
    /** False when the stored document could not be read or is a newer format. */
    get canWrite() {
        return this.writable;
    }
    /**
     * Loads the stored document.
     *
     * Throws only if the storage itself fails. The caller decides whether that
     * is fatal (it must not be) - but the store refuses to write afterwards so
     * a failed read can never erase the history that is still on disk.
     */
    async init() {
        let raw;
        try {
            raw = await this.storage.get(this.key);
        }
        catch (err) {
            this.writable = false;
            throw err;
        }
        const loaded = deserialize(raw, this.project);
        if (!loaded.supported) {
            // A newer format owns this document - do not overwrite it.
            this.writable = false;
            return;
        }
        // A write that already happened merged the latest document itself; do not
        // replace it with the (now stale) copy read above.
        if (!this.wrote)
            this.base = loaded.metrics;
        if (raw === undefined && !this.wrote) {
            await this.adoptLegacyDocument();
        }
    }
    /** The current view: persisted document plus everything not yet written. */
    getSnapshot() {
        return applyDelta(this.base, this.delta);
    }
    async recordTool(input) {
        const now = new Date().toISOString();
        const entry = this.delta.tools[input.tool] ?? {
            runs: 0,
            ok: 0,
            error: 0,
            findings: 0,
            lastUsedAt: "",
            lastStatus: null,
        };
        entry.runs += 1;
        if (input.status === "ok") {
            entry.ok += 1;
        }
        else {
            entry.error += 1;
        }
        entry.findings += nonNegative(input.findings);
        entry.lastUsedAt = now;
        entry.lastStatus = input.status;
        this.delta.tools[input.tool] = entry;
        this.markDirty();
    }
    async recordCommand(input) {
        const now = new Date().toISOString();
        const entry = this.delta.commands[input.name] ?? { count: 0, lastUsedAt: "" };
        entry.count += 1;
        entry.lastUsedAt = now;
        this.delta.commands[input.name] = entry;
        this.markDirty();
    }
    async recordTrigger() {
        this.delta.triggerHits += 1;
        this.markDirty();
    }
    /**
     * Persists pending changes.
     *
     * Writes are coalesced, so a burst of tool calls costs a single storage
     * write. The write merges the pending increments into the document that is
     * on disk right now, so a concurrent session's counts are not lost.
     */
    async flush() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        if (!this.writable) {
            if (!isEmptyDelta(this.delta)) {
                this.reportFailure("metrics storage is not writable; changes were dropped");
            }
            return;
        }
        if (isEmptyDelta(this.delta))
            return;
        const pending = this.delta;
        this.delta = emptyDelta();
        try {
            // Read the latest document first so a concurrent writer's counts survive.
            let latest = this.base;
            try {
                const raw = await this.storage.get(this.key);
                const loaded = deserialize(raw, this.project);
                if (loaded.supported)
                    latest = loaded.metrics;
            }
            catch {
                // Fall back to our own base document.
            }
            const merged = applyDelta(latest, pending);
            await this.storage.set(this.key, merged);
            this.base = merged;
            this.wrote = true;
            this.retries = 0;
            this.reportedFailure = false;
        }
        catch {
            // Keep the change pending so the next flush retries it.
            this.delta = pending;
            this.scheduleRetry();
        }
    }
    /** Documents of the other projects tracked on this machine. */
    async listOtherProjects() {
        const projects = [];
        try {
            let after;
            for (let page = 0; page < 100; page++) {
                const result = await this.storage.scan({
                    prefix: STORAGE_PREFIX,
                    limit: 200,
                    ...(after ? { after } : {}),
                });
                for (const entry of result.entries ?? []) {
                    if (entry.key === this.key)
                        continue;
                    const loaded = deserialize(entry.value, { name: "", path: "" });
                    if (loaded.supported)
                        projects.push(loaded.metrics);
                }
                after = result.next;
                if (!after)
                    return { projects, truncated: false, failed: false };
            }
            return { projects, truncated: true, failed: false };
        }
        catch {
            // A missing cross-project view must never break the snapshot.
            return { projects: [], truncated: false, failed: true };
        }
    }
    /**
     * Picks up the document written by the first (machine-global) implementation
     * so upgrading does not lose the history a user already had.
     */
    async adoptLegacyDocument() {
        try {
            const raw = await this.storage.get(LEGACY_STORAGE_KEY);
            if (raw === undefined)
                return;
            const legacy = deserialize(raw, this.project);
            if (!legacy.supported)
                return;
            const hasHistory = legacy.metrics.triggerHits > 0 ||
                Object.keys(legacy.metrics.tools).length > 0 ||
                Object.keys(legacy.metrics.commands).length > 0;
            if (!hasHistory)
                return;
            this.base = legacy.metrics;
            // Claim it: only one project adopts the machine-global history.
            await this.storage.remove(LEGACY_STORAGE_KEY).catch(() => { });
        }
        catch {
            // No legacy document, or it cannot be read - nothing to migrate.
        }
    }
    markDirty() {
        if (this.timer)
            return;
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.flush();
        }, PERSIST_DEBOUNCE_MS);
        this.timer.unref?.();
    }
    scheduleRetry() {
        if (this.retries >= MAX_WRITE_RETRIES) {
            this.reportFailure("metrics could not be persisted after several attempts");
            return;
        }
        const delay = 1000 * 2 ** this.retries;
        this.retries += 1;
        this.reportFailure(`metrics write failed; retrying in ${delay}ms`);
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            void this.flush();
        }, delay);
        this.retryTimer.unref?.();
    }
    reportFailure(message) {
        if (this.reportedFailure)
            return;
        this.reportedFailure = true;
        console.error(`[php-toolkit] ${message}`);
    }
}
//# sourceMappingURL=store.js.map