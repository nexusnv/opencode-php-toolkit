import type { RoutingRenderContext } from "../routing/state.js";
type SystemPart = {
    type: "text";
    text: string;
    metadata?: Record<string, unknown>;
};
export declare function renderToolkitStatePart(context: RoutingRenderContext): string;
export declare const PHP_TOOLKIT_PART = "php-toolkit";
export declare function removePhpToolkitParts(system: SystemPart[]): SystemPart[];
export declare function l0Part(): SystemPart;
export declare function statePart(text: string): SystemPart;
export {};
