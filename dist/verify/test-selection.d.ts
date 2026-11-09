import type { ProjectProfile } from "../profile.js";
import { type ChangedScope } from "./changed.js";
/** Bounded scan for `*Test.php` files under the test roots. */
export declare const MAX_TEST_SEARCH_ENTRIES = 2000;
/** Above this, a targeted run costs more than it saves; use the full suite. */
export declare const MAX_TARGETED_TESTS = 200;
export interface TestSelection {
    mode: "targeted" | "full-suite" | "none";
    /** Root-relative test paths; always empty for full-suite and none. */
    paths: string[];
    direct: number;
    mapped: number;
    fallbackReason: string | null;
}
export declare function selectTests(input: {
    root: string;
    profile: ProjectProfile;
    changed: ChangedScope;
}): Promise<TestSelection>;
