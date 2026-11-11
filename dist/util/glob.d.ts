/**
 * Glob matching for OpenCode permission rules. `*` matches any run of
 * characters and `?` matches one character; everything else is literal.
 */
export declare function globMatches(pattern: string, value: string): boolean;
