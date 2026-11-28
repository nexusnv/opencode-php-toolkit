import { open } from "node:fs/promises";
/** Reads at most `maxBytes` from a local text file. */
export async function readTextPrefix(path, maxBytes) {
    const limit = Number.isFinite(maxBytes) ? Math.max(0, Math.floor(maxBytes)) : 0;
    if (limit === 0)
        return "";
    const file = await open(path, "r");
    try {
        const buffer = Buffer.allocUnsafe(limit);
        const { bytesRead } = await file.read(buffer, 0, limit, 0);
        return buffer.subarray(0, bytesRead).toString("utf8");
    }
    finally {
        await file.close();
    }
}
//# sourceMappingURL=bounded-read.js.map