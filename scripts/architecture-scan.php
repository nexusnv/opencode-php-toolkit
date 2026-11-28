<?php
declare(strict_types=1);

/** Dependency-free, read-only PHP structure scanner. */

const SCANNER_VERSION = '5';
const MAX_DIRECTORY_ENTRIES = 20000;
const CONTENT_HASH_LIMIT = 1048576;
const CONTENT_HASH_BUDGET = 16777216;
const MAX_SOURCE_BYTES = 4194304;
const MAX_TOTAL_SOURCE_BYTES = 67108864;

function emit(array $payload): never
{
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE), "\n";
    exit(0);
}

function tokenText(array|string $token): string
{
    return is_array($token) ? $token[1] : $token;
}

function tokenId(array|string $token): ?int
{
    return is_array($token) ? $token[0] : null;
}

function nextSignificant(array $tokens, int $index): int
{
    while (isset($tokens[$index]) && is_array($tokens[$index]) && in_array($tokens[$index][0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) {
        $index++;
    }
    return $index;
}

function previousSignificant(array $tokens, int $index): int
{
    while ($index >= 0 && is_array($tokens[$index]) && in_array($tokens[$index][0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) {
        $index--;
    }
    return $index;
}

function decodeArchitectureConfig(string $raw): array
{
    $shape = json_decode($raw);
    $data = json_decode($raw, true);
    if (!is_object($shape) || !is_array($data)) return [[], ['php-toolkit.json is malformed; architecture boundaries are disabled.']];
    if (!array_key_exists('architecture', $data)) return [[], []];
    if (!property_exists($shape, 'architecture')) return [[], ['architecture must be an object; architecture boundaries are disabled.']];
    if (!is_object($shape->architecture)) return [[], ['architecture must be an object; architecture boundaries are disabled.']];
    $architecture = $data['architecture'];
    if (!is_array($architecture)) return [[], ['architecture must be an object; architecture boundaries are disabled.']];
    $layers = $architecture['layers'] ?? null;
    if (!is_array($layers) || $layers === []) return [[], ['architecture.layers must be a non-empty object; architecture boundaries are disabled.']];
    $byName = [];
    $prefixes = [];
    foreach ($layers as $name => $layer) {
        $dependencies = is_array($layer) ? ($layer['mayDependOn'] ?? []) : null;
        if (!is_string($name) || !preg_match('/^[A-Za-z][A-Za-z0-9_-]*$/', $name) || !is_array($layer) || !is_array($layer['namespaces'] ?? null) || !is_array($dependencies)) {
            return [[], ['architecture.layers contains an invalid entry; architecture boundaries are disabled.']];
        }
        $namespaces = [];
        foreach ($layer['namespaces'] as $namespace) {
            if (!is_string($namespace) || !preg_match('/^[A-Za-z_][A-Za-z0-9_]*(?:\\\\[A-Za-z_][A-Za-z0-9_]*)*\\\\$/', $namespace) || in_array(strtolower($namespace), $prefixes, true)) {
                return [[], ['architecture layer namespaces must be unique prefixes ending in \\; architecture boundaries are disabled.']];
            }
            $namespaces[] = $namespace;
            $prefixes[] = strtolower($namespace);
        }
        if ($namespaces === []) return [[], ['architecture layer namespace lists cannot be empty; architecture boundaries are disabled.']];
        $byName[$name] = ['namespaces' => $namespaces, 'depends' => $dependencies];
    }
    foreach ($byName as $name => $layer) {
        foreach ($layer['depends'] as $dependency) {
            if (!is_string($dependency) || $dependency === $name || !isset($byName[$dependency])) {
                return [[], ['architecture.layers contains an invalid dependency; architecture boundaries are disabled.']];
            }
        }
    }
    $excludes = [];
    if (isset($architecture['exclude'])) {
        if (!is_array($architecture['exclude'])) return [[], ['architecture.exclude must be an array; configured excludes were ignored.']];
        foreach ($architecture['exclude'] as $exclude) {
            if (!is_string($exclude) || $exclude === '' || str_starts_with($exclude, '/') || preg_match('/^[A-Za-z]:/', $exclude) || preg_match('~(^|[\\\\/])\.\.([\\\\/]|$)~', $exclude)) {
                return [[], ['architecture.exclude contains an unsafe path; architecture boundaries are disabled.']];
            }
            $normalized = trim(str_replace('\\', '/', $exclude), '/');
            $segments = array_values(array_filter(explode('/', $normalized), static fn(string $part): bool => $part !== '.'));
            $excludes[] = implode('/', $segments);
        }
    }
    return [['layers' => $byName, 'exclude' => $excludes], []];
}

function readConfig(string $root): array
{
    $path = $root . DIRECTORY_SEPARATOR . 'php-toolkit.json';
    if (!is_file($path)) return [[], []];
    $raw = file_get_contents($path);
    return decodeArchitectureConfig(is_string($raw) ? $raw : '');
}

function isExcluded(string $relative, array $configured): bool
{
    $parts = explode('/', $relative);
    foreach (['vendor', 'node_modules', '.git', 'var', 'storage'] as $excluded) {
        if (in_array($excluded, $parts, true)) return true;
    }
    foreach ($configured as $prefix) {
        if ($relative === $prefix || str_starts_with($relative, $prefix . '/')) return true;
    }
    return false;
}

function pathWithinRoot(string $root, string $path): ?string
{
    $resolved = realpath($path);
    if ($resolved === false) return null;
    $prefix = rtrim($root, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
    return $resolved === $root || str_starts_with($resolved, $prefix) ? $resolved : null;
}

function findPhpFiles(string $root, array $excludes, int $cap, ?callable $beforeDirectoryOpen = null): array
{
    $files = [];
    $pending = [$root];
    $visitedEntries = 0;
    $truncated = false;
    $diagnostics = [];
    while ($pending !== []) {
        $directory = array_pop($pending);
        if ($beforeDirectoryOpen !== null) $beforeDirectoryOpen($directory);
        clearstatcache(true, $directory);
        $resolvedDirectory = pathWithinRoot($root, $directory);
        if ($resolvedDirectory === null || is_link($directory) || !is_dir($resolvedDirectory)) {
            $diagnostics[] = 'A queued directory changed or could not be resolved within the selected root; scan is incomplete.';
            continue;
        }
        try {
            $iterator = new DirectoryIterator($resolvedDirectory);
        } catch (Throwable) {
            $diagnostics[] = 'A directory could not be opened; scan is incomplete.';
            continue;
        }
        $entries = [];
        try {
            foreach ($iterator as $entry) {
                if ($entry->isDot()) continue;
                $visitedEntries++;
                if ($visitedEntries > MAX_DIRECTORY_ENTRIES) {
                    $truncated = true;
                    break;
                }
                $entries[] = [
                    'name' => $entry->getFilename(),
                    'path' => $entry->getPathname(),
                    'link' => $entry->isLink(),
                    'directory' => $entry->isDir(),
                    'file' => $entry->isFile(),
                    'extension' => strtolower($entry->getExtension()),
                ];
            }
        } catch (Throwable) {
            $diagnostics[] = 'A directory could not be fully read; scan is incomplete.';
        }
        usort($entries, static fn(array $a, array $b): int => strcmp($a['name'], $b['name']));
        $childDirectories = [];
        foreach ($entries as $entry) {
            $path = $entry['path'];
            $relative = str_replace('\\', '/', substr($path, strlen(rtrim($root, DIRECTORY_SEPARATOR)) + 1));
            if (isExcluded($relative, $excludes) || $entry['link']) continue;
            if ($entry['directory']) {
                $childDirectories[] = $path;
            } elseif ($entry['file'] && $entry['extension'] === 'php') {
                clearstatcache(true, $path);
                $resolvedFile = pathWithinRoot($root, $path);
                if ($resolvedFile === null || is_link($path) || !is_file($resolvedFile)) {
                    $diagnostics[] = "A PHP file changed or could not be resolved within the selected root ({$relative}); scan is incomplete.";
                    continue;
                }
                $relative = str_replace('\\', '/', substr($resolvedFile, strlen(rtrim($root, DIRECTORY_SEPARATOR)) + 1));
                if (isExcluded($relative, $excludes)) continue;
                $files[] = $relative;
                if (count($files) > $cap) {
                    $truncated = true;
                    break 2;
                }
            }
        }
        for ($index = count($childDirectories) - 1; $index >= 0; $index--) $pending[] = $childDirectories[$index];
        if ($visitedEntries > MAX_DIRECTORY_ENTRIES) break;
    }
    sort($files, SORT_STRING);
    return ['files' => array_slice($files, 0, $cap), 'truncated' => $truncated, 'diagnostics' => $diagnostics];
}

function addImportTarget(string $statement, int $line, string $namespace, int $scope, array &$imports): void
{
    $pieces = preg_split('/\s+as\s+/i', trim($statement));
    $target = trim($pieces[0] ?? '', " \t\r\n\\");
    if ($target === '' || preg_match('/^(function|const)\s+/i', $target)) return;
    $parts = explode('\\', $target);
    $alias = trim($pieces[1] ?? (string) end($parts));
    if ($alias === '') $alias = basename(str_replace('\\', '/', $target));
    $imports[$scope][strtolower($alias)] = ['target' => $target, 'line' => $line, 'namespace' => $namespace];
}

function addImport(string $statement, int $line, string $namespace, int $scope, array &$imports): void
{
    $open = strpos($statement, '{');
    if ($open !== false) {
        $close = strrpos($statement, '}');
        if ($close === false || $close < $open) return;
        $prefix = trim(substr($statement, 0, $open), " \t\r\n\\");
        if ($prefix === '' || preg_match('/^(function|const)\s+/i', $prefix)) return;
        $members = explode(',', substr($statement, $open + 1, $close - $open - 1));
        foreach ($members as $member) {
            $pieces = preg_split('/\s+as\s+/i', trim($member));
            $name = trim($pieces[0] ?? '', " \t\r\n\\");
            if ($name === '' || preg_match('/^(function|const)\s+/i', $name)) continue;
            addImportTarget($prefix . '\\' . $name . (isset($pieces[1]) ? ' as ' . $pieces[1] : ''), $line, $namespace, $scope, $imports);
        }
        return;
    }

    // PHP applies a function/const modifier to every comma-separated member.
    $modifier = '';
    foreach (explode(',', $statement) as $target) {
        $target = trim($target);
        if (preg_match('/^(function|const)\s+/i', $target, $match)) {
            $modifier = strtolower($match[1]);
            $target = trim(substr($target, strlen($match[0])));
        }
        if ($modifier !== '') continue;
        addImportTarget($target, $line, $namespace, $scope, $imports);
    }
}

function parseFile(string $source, string $relative, array $layers, array &$results): void
{
    $tokens = token_get_all($source);
    $namespace = '';
    $scope = 0;
    $imports = [];
    $references = [];
    $useEndIndex = -1;
    $activeClass = null;
    $pendingClass = null;
    $braceDepth = 0;
    $line = 1;
    $classCount = 0;
    $methodCount = 0;
    $publicMethodCount = 0;
    $staticAccess = false;
    $classStartLine = 1;
    $methodStack = [];
    $matchPending = false;
    $matchDepths = [];

    for ($i = 0, $count = count($tokens); $i < $count; $i++) {
        $token = $tokens[$i];
        $id = tokenId($token);
        $text = tokenText($token);
        $tokenLine = is_array($token) ? $token[2] : $line;

        if ($id === T_NAMESPACE) {
            $name = '';
            for ($j = nextSignificant($tokens, $i + 1); isset($tokens[$j]); $j++) {
                $part = tokenText($tokens[$j]);
                if ($part === ';' || $part === '{') break;
                $name .= $part;
            }
            $namespace = trim($name, " \t\r\n\\");
            // PHP resets imports at every namespace declaration, including
            // repeated bracketed blocks that declare the same namespace.
            $scope++;
        }

        if ($id === T_USE && $activeClass === null && $braceDepth <= 1) {
            $statement = '';
            for ($j = $i + 1; isset($tokens[$j]); $j++) {
                $part = tokenText($tokens[$j]);
                if ($part === ';') break;
                $statement .= $part;
            }
            $useEndIndex = $j;
            $statement = trim($statement);
            addImport($statement, $tokenLine, $namespace, $scope, $imports);
        }

        if ($i > $useEndIndex && in_array($id, [T_NAME_QUALIFIED, T_NAME_FULLY_QUALIFIED, T_NAME_RELATIVE], true)) {
            $previous = previousSignificant($tokens, $i - 1);
            if ($previous < 0 || tokenId($tokens[$previous]) !== T_NAMESPACE) {
                $references[] = ['name' => $text, 'namespace' => $namespace, 'scope' => $scope, 'line' => $tokenLine];
            }
        }

        if (in_array($id, [T_CLASS, T_INTERFACE, T_TRAIT, T_ENUM], true)) {
            $previous = previousSignificant($tokens, $i - 1);
            if ($id !== T_CLASS || ($previous >= 0 && tokenId($tokens[$previous]) !== T_NEW && tokenText($tokens[$previous]) !== '::')) {
                $nameIndex = nextSignificant($tokens, $i + 1);
                $name = tokenId($tokens[$nameIndex]) === T_STRING ? tokenText($tokens[$nameIndex]) : null;
                $pendingClass = $name === null ? null : ['name' => $name, 'start' => $tokenLine, 'methods' => 0, 'public' => 0];
                if ($pendingClass !== null) $classStartLine = $tokenLine;
            }
        }

        if ($activeClass !== null && $id === T_FUNCTION && $braceDepth === $activeClass['depth']) {
            $methodCount++;
            $activeClass['methods']++;
            $nameIndex = nextSignificant($tokens, $i + 1);
            if (tokenText($tokens[$nameIndex]) === '&') $nameIndex = nextSignificant($tokens, $nameIndex + 1);
            $methodName = tokenId($tokens[$nameIndex]) === T_STRING ? strtolower(tokenText($tokens[$nameIndex])) : '';
            $isPublic = true;
            for ($j = $i - 1; $j >= 0 && !in_array(tokenText($tokens[$j]), [';', '{', '}'], true); $j--) {
                if (tokenId($tokens[$j]) === T_PRIVATE || tokenId($tokens[$j]) === T_PROTECTED) $isPublic = false;
                if (tokenId($tokens[$j]) === T_PUBLIC) $isPublic = true;
            }
            if ($isPublic) { $publicMethodCount++; $activeClass['public']++; }
            $open = $nameIndex + 1;
            while (isset($tokens[$open]) && tokenText($tokens[$open]) !== '(' && tokenText($tokens[$open]) !== '{' && tokenText($tokens[$open]) !== ';') $open++;
            if (isset($tokens[$open]) && tokenText($tokens[$open]) === '(') {
                $depth = 0; $params = 0; $hasValue = false;
                for ($j = $open; isset($tokens[$j]); $j++) {
                    $part = tokenText($tokens[$j]);
                    if ($part === '(') $depth++;
                    elseif ($part === ')') { $depth--; if ($depth === 0) { if ($hasValue) $params++; break; } }
                    elseif ($depth === 1 && $part === ',') { $params++; $hasValue = false; }
                    elseif ($depth === 1 && !in_array($part, [' ', "\n", "\r", "\t"], true)) $hasValue = true;
                }
                if ($methodName === '__construct' && $params > 4) {
                    $results[] = hypothesis($relative, $tokenLine, 'Constructor has more than 4 parameters.', 'constructor-parameters', 'medium');
                }
            }
            $methodStack[] = ['name' => $methodName, 'start' => $tokenLine, 'depth' => $braceDepth, 'branches' => 0, 'instanceof' => 0];
        }

        if ($activeClass !== null && $methodStack !== []) {
            $last = count($methodStack) - 1;
            if (in_array($id, [T_CASE, T_DEFAULT, T_ELSEIF, T_IF, T_WHILE, T_FOR, T_FOREACH, T_CATCH], true)) $methodStack[$last]['branches']++;
            if ($id === T_INSTANCEOF) $methodStack[$last]['instanceof']++;
            if ($id === T_MATCH) $matchPending = true;
            if ($id === T_DOUBLE_ARROW && $matchDepths !== []) $methodStack[$last]['branches']++;
            if ($id === T_STATIC || $id === T_DOUBLE_COLON) $staticAccess = true;
        }

        if ($text === '{') {
            $braceDepth++;
            if ($matchPending) { $matchDepths[] = $braceDepth; $matchPending = false; }
            if ($pendingClass !== null && $activeClass === null) {
                $activeClass = $pendingClass + ['depth' => $braceDepth];
                $pendingClass = null;
                $classCount++;
            } elseif ($activeClass === null && $pendingClass === null) {
                // no-op
            }
        } elseif ($text === '}') {
            if ($matchDepths !== [] && end($matchDepths) === $braceDepth) array_pop($matchDepths);
            if ($activeClass !== null && $braceDepth === $activeClass['depth']) {
                $classLines = max(1, $tokenLine - $activeClass['start'] + 1);
                if ($activeClass['public'] > 15) $results[] = hypothesis($relative, $activeClass['start'], 'Class exposes more than 15 public methods.', 'large-public-api', 'medium');
                if ($classLines > 400) $results[] = hypothesis($relative, $activeClass['start'], 'Class spans more than 400 lines.', 'large-class', 'medium');
                if ($staticAccess) $results[] = hypothesis($relative, $activeClass['start'], 'Class uses static access; review for singleton or service-locator coupling.', 'static-singleton-access', 'low');
                $activeClass = null;
                $staticAccess = false;
            }
            if ($methodStack !== [] && $activeClass !== null && $braceDepth === $activeClass['depth'] + 1) {
                $last = count($methodStack) - 1;
                $method = array_pop($methodStack);
                $methodLines = max(1, $tokenLine - $method['start'] + 1);
                if ($methodLines > 50) $results[] = hypothesis($relative, $method['start'], 'Method spans more than 50 lines.', 'long-method', 'medium');
                if ($method['branches'] >= 3) $results[] = hypothesis($relative, $method['start'], 'Method contains at least 3 conditional branches.', 'branching-logic', 'medium');
                if ($method['instanceof'] >= 3) $results[] = hypothesis($relative, $method['start'], 'Method contains an instanceof chain with at least 3 checks.', 'instanceof-chain', 'medium');
            }
            $braceDepth--;
        }

        if (is_array($token)) $line = $token[2] + substr_count($text, "\n");
        else $line += substr_count($text, "\n");
    }

    if ($classCount > 0) {
        $results[] = metric($relative, null, "{$classCount} class-like declaration(s), {$methodCount} method(s), {$publicMethodCount} public method(s).");
    }
    foreach ($imports as $namespaceImports) {
        foreach ($namespaceImports as $alias => $import) {
            addBoundaryFinding($relative, $import['namespace'], $import['target'], $alias, $import['line'], $layers, $results);
        }
    }
    foreach ($references as $reference) {
        $name = $reference['name'];
        $namespaceName = $reference['namespace'];
        $normalized = ltrim($name, '\\');
        if (str_starts_with($name, '\\\\')) continue;
        if (str_starts_with(strtolower($name), 'namespace\\')) {
            $target = trim($namespaceName . '\\' . substr($name, strlen('namespace\\')), '\\');
        } elseif (str_starts_with($name, '\\')) {
            $target = $normalized;
        } else {
            $segments = explode('\\', $normalized);
            $alias = strtolower($segments[0] ?? '');
            $import = $imports[$reference['scope']][$alias] ?? null;
            $target = $import
                ? $import['target'] . (count($segments) > 1 ? '\\' . implode('\\', array_slice($segments, 1)) : '')
                : trim($namespaceName . '\\' . $normalized, '\\');
        }
        addBoundaryFinding($relative, $namespaceName, $target, $name, $reference['line'], $layers, $results);
    }
}

function addBoundaryFinding(string $file, string $namespace, string $target, string $alias, int $line, array $layers, array &$results): void
{
    $fromLayer = layerFor($namespace, $layers);
    $toLayer = layerFor($target, $layers);
    if ($fromLayer !== null && $toLayer !== null && $fromLayer !== $toLayer && !in_array($toLayer, $layers[$fromLayer]['depends'], true)) {
        $results[] = [
            'kind' => 'finding', 'severity' => 'error', 'file' => $file,
            'line' => $line, 'message' => "{$fromLayer} may not depend on {$toLayer} ({$alias}).",
            'evidence' => $target, 'confidence' => 'high',
        ];
    }
}

function layerFor(string $namespace, array $layers): ?string
{
    $match = null;
    $length = -1;
    foreach ($layers as $name => $layer) {
        foreach ($layer['namespaces'] as $prefix) {
            $normalized = strtolower(rtrim($prefix, '\\'));
            $candidate = strtolower($namespace);
            if (($candidate === $normalized || str_starts_with($candidate, $normalized . '\\')) && strlen($normalized) > $length) {
                $match = $name;
                $length = strlen($normalized);
            }
        }
    }
    return $match;
}

function hypothesis(string $file, int $line, string $message, string $pattern, string $confidence): array
{
    return ['kind' => 'hypothesis', 'severity' => 'info', 'file' => $file, 'line' => $line, 'message' => $message, 'candidatePatterns' => [$pattern], 'confidence' => $confidence];
}

function metric(string $file, ?int $line, string $message): array
{
    return ['kind' => 'metric', 'severity' => 'info', 'file' => $file, 'line' => $line, 'message' => $message];
}

if (realpath((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) {
$args = getopt('', ['directory:', 'format:', 'max-files:', 'config:']);
$root = isset($args['directory']) ? realpath((string) $args['directory']) : false;
if ($root === false || !is_dir($root)) emit(['status' => 'error', 'diagnostics' => ['A valid --directory is required.'], 'results' => [], 'filesScanned' => 0, 'truncated' => false]);
if (($args['format'] ?? 'json') !== 'json') emit(['status' => 'error', 'diagnostics' => ['Only --format json is supported.'], 'results' => [], 'filesScanned' => 0, 'truncated' => false]);
$requested = isset($args['max-files']) ? max(1, (int) $args['max-files']) : 500;
$cap = min(500, $requested);
// When the caller supplies a validated policy snapshot, use it instead of
// re-reading php-toolkit.json so cache identity and scan rules cannot diverge.
[$config, $diagnostics] = isset($args['config'])
    ? decodeArchitectureConfig((string) $args['config'])
    : readConfig($root);
$fileScan = findPhpFiles($root, $config['exclude'] ?? [], $cap);
$files = $fileScan['files'];
$truncated = $fileScan['truncated'];
$diagnostics = array_merge($diagnostics, $fileScan['diagnostics']);
$results = [];
$filesScanned = 0;
$fingerprints = [];
$hashedBytes = 0;
$scannedBytes = 0;
foreach ($files as $relative) {
    $path = $root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
    clearstatcache(true, $path);
    $resolvedFile = pathWithinRoot($root, $path);
    if ($resolvedFile === null || is_link($path) || !is_file($resolvedFile)) {
        $diagnostics[] = "A PHP file changed or could not be resolved within the selected root ({$relative}); scan is incomplete.";
        continue;
    }
    $before = @stat($resolvedFile);
    $fileSize = is_array($before) ? (int) $before['size'] : 0;
    if ($fileSize > MAX_SOURCE_BYTES || $scannedBytes + $fileSize > MAX_TOTAL_SOURCE_BYTES) {
        $diagnostics[] = "A PHP file exceeded the source-byte limit ({$relative}); scan is incomplete.";
        continue;
    }
    $source = @file_get_contents($resolvedFile);
    clearstatcache(true, $path);
    $resolvedAfterRead = pathWithinRoot($root, $path);
    $after = $resolvedAfterRead !== null && !is_link($path) ? @stat($resolvedAfterRead) : false;
    if (!is_array($before) || !is_array($after) || $resolvedAfterRead === null || $before['dev'] !== $after['dev'] || $before['ino'] !== $after['ino']) {
        $diagnostics[] = "A PHP file changed or escaped the selected root while being read ({$relative}); scan is incomplete.";
        continue;
    }
    if (is_string($source)) {
        parseFile($source, $relative, $config['layers'] ?? [], $results);
        $filesScanned++;
        $scannedBytes += strlen($source);
        if ($before['size'] !== $after['size'] || $before['mtime'] !== $after['mtime']) {
            $diagnostics[] = "A PHP file changed while being read ({$relative}); scan is incomplete.";
        }
        $size = is_array($before) ? (int) $before['size'] : strlen($source);
        $mtime = (int) $after['mtime'];
        if ($size <= CONTENT_HASH_LIMIT && $hashedBytes + $size <= CONTENT_HASH_BUDGET) {
            $fingerprints[$relative] = 'content:' . hash('sha256', $source);
            $hashedBytes += $size;
        } else {
            $fingerprints[$relative] = "metadata:{$after['dev']}:{$after['ino']}:{$after['size']}:{$mtime}";
        }
    } else {
        $diagnostics[] = "A PHP file could not be read ({$relative}); scan is incomplete.";
    }
}
usort($results, static fn(array $a, array $b): int => [$a['file'] ?? '', $a['line'] ?? 0, $a['kind'], $a['message']] <=> [$b['file'] ?? '', $b['line'] ?? 0, $b['kind'], $b['message']]);
$incomplete = $diagnostics !== [] || $filesScanned < count($files);
emit(['status' => $incomplete ? 'error' : 'ok', 'scannerVersion' => SCANNER_VERSION, 'filesScanned' => $filesScanned, 'truncated' => $truncated, 'diagnostics' => $diagnostics, 'fingerprints' => (object) $fingerprints, 'results' => $results]);
}
