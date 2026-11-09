/**
 * Glob matching for OpenCode permission rules. `*` matches any run of
 * characters and `?` matches one character; everything else is literal.
 */
export function globMatches(pattern: string, value: string): boolean {
  let source = "";
  for (const char of pattern) {
    if (char === "*") source += ".*";
    else if (char === "?") source += ".";
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`).test(value);
}
