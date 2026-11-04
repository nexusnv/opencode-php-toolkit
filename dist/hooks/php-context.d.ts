export declare const PHP_SYSTEM_HINT: string;
export declare const PHP_TRIGGER: RegExp;
/**
 * The trigger for injecting the PHP system hint. Deliberately narrower than
 * PHP_TRIGGER: "pest" and "psalm" are ordinary English/Latin words, and the
 * hint is only added on a clear PHP mention.
 */
export declare const PHP_HINT_TRIGGER: RegExp;
/**
 * Minimal, structural view of a chat message - the v2 SessionContext's
 * `messages` is assignable to this, without this module importing the AI
 * schema. Text parts are scanned in full.
 */
type MessageLike = {
    role?: unknown;
    content?: unknown;
};
/** True when a user message in this request mentions the PHP ecosystem. */
export declare function mentionsPhp(messages: ReadonlyArray<MessageLike> | undefined): boolean;
export declare function isDestructiveShell(input: unknown): string | null;
export {};
