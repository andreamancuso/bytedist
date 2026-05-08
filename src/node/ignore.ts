export function createIgnoreMatcher(
  patterns: readonly string[] = []
): (chunkName: string) => boolean {
  const normalizedPatterns = patterns
    .map(normalizeIgnorePattern)
    .filter((pattern) => pattern.length > 0);

  return (chunkName) => normalizedPatterns.some((pattern) => matchesPattern(chunkName, pattern));
}

function normalizeIgnorePattern(pattern: string): string {
  return pattern.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function matchesPattern(chunkName: string, pattern: string): boolean {
  if (pattern.endsWith("/")) {
    return chunkName.startsWith(pattern);
  }

  if (!pattern.includes("*")) {
    return chunkName === pattern;
  }

  return globToRegExp(pattern).test(chunkName);
}

function globToRegExp(pattern: string): RegExp {
  let source = "^";

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];

    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
      continue;
    }

    if (char === "*") {
      source += "[^/]*";
      continue;
    }

    source += escapeRegExp(char ?? "");
  }

  return new RegExp(`${source}$`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
