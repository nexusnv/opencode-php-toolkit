<?php
declare(strict_types=1);

/** Dependency-free, read-only PHP structure scanner. */

const SCANNER_VERSION = '2';
const MAX_DIRECTORY_ENTRIES = 20000;

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

function readConfig(string $root): array
{
    $path = $root . DIRECTORY_SEPARATOR . 'php-toolkit.json';
    if (!is_file($path)) return [[], []];
    $raw = file_get_contents($path);
    $data = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($data)) return [[], ['php-toolkit.json is malformed; architecture boundaries are disabled.']];
    $architecture = $data['architecture'] ?? null;
    if (!is_array($architecture)) return [[], []];
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
            $excludes[] = trim(str_replace('\\', '/', $exclude), '/');
        }
    }
    return [['layers' => $byName, 'exclude' => $excludes], []];
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

function findPhpFiles(string $root, array $excludes, int $cap): array
{
    $files = [];
    $pending = [$root];
    $visitedEntries = 0;
    $truncated = false;
    while ($pending !== []) {
        $directory = array_pop($pending);
        try {
            $iterator = new DirectoryIterator($directory);
        } catch (Throwable) {
            continue;
        }
        $entries = [];
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
        usort($entries, static fn(array $a, array $b): int => strcmp($a['name'], $b['name']));
        $childDirectories = [];
        foreach ($entries as $entry) {
            $path = $entry['path'];
            $relative = str_replace('\\', '/', substr($path, strlen(rtrim($root, DIRECTORY_SEPARATOR)) + 1));
            if (isExcluded($relative, $excludes) || $entry['link']) continue;
            if ($entry['directory']) {
                $childDirectories[] = $path;
            } elseif ($entry['file'] && $entry['extension'] === 'php') {
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
    return ['files' => array_slice($files, 0, $cap), 'truncated' => $truncated];
}

function addImport(string $statement, int $line, array &$imports): void
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
            if ($name === '' || str_starts_with($name, 'function ') || str_starts_with($name, 'const ')) continue;
            $target = $prefix . '\\' . $name;
            $parts = explode('\\', $target);
            $alias = trim($pieces[1] ?? (string) end($parts));
            if ($alias === '') $alias = basename(str_replace('\\', '/', $target));
            $imports[strtolower($alias)] = ['target' => $target, 'line' => $line];
        }
        return;
    }

    $pieces = preg_split('/\s+as\s+/i', $statement);
    $target = trim($pieces[0] ?? '', " \t\r\n\\");
    if ($target === '' || str_starts_with($target, 'function ') || str_starts_with($target, 'const ')) return;
    $parts = explode('\\', $target);
    $alias = trim($pieces[1] ?? (string) end($parts));
    if ($alias === '') $alias = basename(str_replace('\\', '/', $target));
    $imports[strtolower($alias)] = ['target' => $target, 'line' => $line];
}

function parseFile(string $source, string $relative, array $layers, array &$results): void
{
    $tokens = token_get_all($source);
    $namespace = '';
    $imports = [];
    $classes = [];
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
        }

        if ($id === T_USE && $activeClass === null && $braceDepth <= 1) {
            $statement = '';
            for ($j = $i + 1; isset($tokens[$j]); $j++) {
                $part = tokenText($tokens[$j]);
                if ($part === ';') break;
                $statement .= $part;
            }
            $statement = trim($statement);
            addImport($statement, $tokenLine, $imports);
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

    $className = $classes[0]['name'] ?? null;
    if ($classCount > 0) {
        $results[] = metric($relative, null, "{$classCount} class-like declaration(s), {$methodCount} method(s), {$publicMethodCount} public method(s).");
    }
    if ($namespace !== '') {
        foreach ($imports as $alias => $import) {
            $target = $import['target'];
            $fromLayer = layerFor($namespace, $layers);
            $toLayer = layerFor($target, $layers);
            if ($fromLayer !== null && $toLayer !== null && $fromLayer !== $toLayer && !in_array($toLayer, $layers[$fromLayer]['depends'], true)) {
                $results[] = [
                    'kind' => 'finding', 'severity' => 'error', 'file' => $relative,
                    'line' => $import['line'], 'message' => "{$fromLayer} may not depend on {$toLayer} ({$alias}).",
                    'evidence' => $target, 'confidence' => 'high',
                ];
            }
        }
    }
}

function layerFor(string $namespace, array $layers): ?string
{
    $match = null;
    $length = -1;
    foreach ($layers as $name => $layer) {
        foreach ($layer['namespaces'] as $prefix) {
            $normalized = strtolower(rtrim($prefix, '\\'));
            if (str_starts_with(strtolower($namespace), $normalized) && strlen($normalized) > $length) {
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

$args = getopt('', ['directory:', 'format:', 'max-files:']);
$root = isset($args['directory']) ? realpath((string) $args['directory']) : false;
if ($root === false || !is_dir($root)) emit(['status' => 'error', 'diagnostics' => ['A valid --directory is required.'], 'results' => [], 'filesScanned' => 0, 'truncated' => false]);
if (($args['format'] ?? 'json') !== 'json') emit(['status' => 'error', 'diagnostics' => ['Only --format json is supported.'], 'results' => [], 'filesScanned' => 0, 'truncated' => false]);
$requested = isset($args['max-files']) ? max(1, (int) $args['max-files']) : 500;
$cap = min(500, $requested);
[$config, $diagnostics] = readConfig($root);
$fileScan = findPhpFiles($root, $config['exclude'] ?? [], $cap);
$files = $fileScan['files'];
$truncated = $fileScan['truncated'];
$results = [];
foreach ($files as $relative) {
    $source = file_get_contents($root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative));
    if (is_string($source)) parseFile($source, $relative, $config['layers'] ?? [], $results);
}
usort($results, static fn(array $a, array $b): int => [$a['file'] ?? '', $a['line'] ?? 0, $a['kind'], $a['message']] <=> [$b['file'] ?? '', $b['line'] ?? 0, $b['kind'], $b['message']]);
emit(['status' => 'ok', 'scannerVersion' => SCANNER_VERSION, 'filesScanned' => count($files), 'truncated' => $truncated, 'diagnostics' => $diagnostics, 'results' => $results]);
