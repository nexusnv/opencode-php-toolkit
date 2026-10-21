import { createHash } from "node:crypto";
export const METRICS_VERSION = 2;
/** Storage keys are `${STORAGE_PREFIX}${projectKey(path)}` - one doc per project. */
export const STORAGE_PREFIX = "php-toolkit.metrics.";
/** Upper bound on tracked tool/command names, so a corrupt doc cannot bloat. */
const MAX_ENTRIES = 200;
/** Writes are coalesced so a burst of tool calls costs one storage write. */
const PERSIST_DEBOUNCE_MS = 250;
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
 * Turns whatever is on disk into a valid document. Unknown future versions are
 * discarded rather than misread; older versions are migrated forward.
 */
export function deserialize(raw, project) {
    const base = initialMetrics(project);
    if (!raw || typeof raw !== "object")
        return base;
    const candidate = raw;
    const version = num(candidate.version) ?? 0;
    if (version > METRICS_VERSION)
        return base;
    return {
        version: METRICS_VERSION,
        startedAt: typeof candidate.startedAt === "string" ? candidate.startedAt : base.startedAt,
        projectName: typeof candidate.projectName === "string" ? candidate.projectName : project.name,
        projectPath: typeof candidate.projectPath === "string" ? candidate.projectPath : project.path,
        tools: migrateTools(candidate.tools),
        commands: migrateCommands(candidate.commands),
        triggerHits: nonNegative(num(candidate.triggerHits)),
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
 */
export class MetricsStore {
    storage;
    project;
    doc;
    key;
    dirty = false;
    timer = null;
    constructor(storage, project) {
        this.storage = storage;
        this.project = project;
        this.doc = initialMetrics(project);
        this.key = storageKeyFor(project.path);
    }
    /** Storage key this store owns. */
    get storageKey() {
        return this.key;
    }
    /**
     * Loads the stored document. Throws only if the storage itself fails; the
     * caller decides whether that is fatal (it must not be).
     */
    async init() {
        const raw = await this.storage.get(this.key);
        this.doc = deserialize(raw, this.project);
    }
    getSnapshot() {
        return this.doc;
    }
    async recordTool(input) {
        const entry = this.doc.tools[input.tool] ?? {
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
        entry.lastUsedAt = new Date().toISOString();
        entry.lastStatus = input.status;
        this.doc.tools[input.tool] = entry;
        this.markDirty();
    }
    async recordCommand(input) {
        const entry = this.doc.commands[input.name] ?? { count: 0, lastUsedAt: "" };
        entry.count += 1;
        entry.lastUsedAt = new Date().toISOString();
        this.doc.commands[input.name] = entry;
        this.markDirty();
    }
    async recordTrigger() {
        this.doc.triggerHits += 1;
        this.markDirty();
    }
    /**
     * Persists pending changes. Writes are coalesced, so a burst of tool calls
     * costs a single storage write instead of one per event.
     */
    async flush() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (!this.dirty)
            return;
        this.dirty = false;
        try {
            await this.storage.set(this.key, this.doc);
        }
        catch {
            // Metrics are best-effort: a storage failure must never break the plugin.
            // Keep the change pending so the next flush retries it.
            this.dirty = true;
        }
    }
    /** Documents of the other projects tracked on this machine. */
    async listOtherProjects() {
        const out = [];
        try {
            let after;
            for (let page = 0; page < 10; page++) {
                const result = await this.storage.scan({
                    prefix: STORAGE_PREFIX,
                    limit: 200,
                    ...(after ? { after } : {}),
                });
                for (const entry of result.entries ?? []) {
                    if (entry.key === this.key)
                        continue;
                    out.push(deserialize(entry.value, { name: "", path: "" }));
                }
                after = result.next;
                if (!after)
                    break;
            }
        }
        catch {
            // A missing cross-project view must never break the snapshot.
        }
        return out;
    }
    markDirty() {
        this.dirty = true;
        if (this.timer)
            return;
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.flush();
        }, PERSIST_DEBOUNCE_MS);
        this.timer.unref?.();
    }
}
//# sourceMappingURL=store.js.map