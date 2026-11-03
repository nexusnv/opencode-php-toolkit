export declare const PHP_SYSTEM_HINT: string;
export declare const PHP_TRIGGER: RegExp;
type MessageLike = {
    role?: unknown;
    content?: unknown;
};
/** True when a user message in this request mentions the PHP ecosystem. */
export declare function mentionsPhp(messages: ReadonlyArray<MessageLike> | undefined): boolean;
export declare function isDestructiveShell(input: unknown): string | null;
export {};
