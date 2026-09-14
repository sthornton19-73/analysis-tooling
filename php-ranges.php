<?php
/**
 * Exact start/end lines for every PHP function, class, interface and trait in a tree.
 *
 *     php php-ranges.php <repo-root>   ->  {"rel/path.php": [[name, start, end], ...]} on stdout
 *
 * token_get_all is the authority. It is a lexer, not a parser, so the end of a body is
 * found by counting braces rather than read off a node, and three lexer details make a
 * naive count wrong:
 *
 *   1. Single-character tokens ('{', '}', ';') come back as plain strings with NO line
 *      number. Only array tokens carry one. So the line is tracked as a running counter,
 *      resynced from every array token's own line and advanced by the newlines in its
 *      text. A string token never contains a newline, so the counter stays exact.
 *   2. T_CURLY_OPEN ("{$x}" inside a double-quoted string) and T_DOLLAR_OPEN_CURLY_BRACES
 *      ("${x}") open a brace that is closed by a plain '}'. Miss them and every function
 *      containing an interpolated string ends early, at the first such '}'.
 *   3. `function` is semi-reserved: it appears in `use function Foo\bar;` and after `->`
 *      or `::`. Those are not declarations and must not be recorded.
 *
 * Arrow functions (`fn($x) => $x * 2`) are deliberately SKIPPED. They have no closing
 * delimiter, so their end could only be guessed, and a missing range is the correct
 * outcome here: the caller labels the symbol "approximate". A guessed range would be a
 * wrong body displayed as a real one. Same for any declaration whose braces never balance.
 *
 * The extractor is only as new as the PHP binary running it. PHP 7.4 lexes `enum` as a
 * plain identifier, so enum bodies are not found until the binary is 8.1+.
 *
 * Files that fail to tokenise are skipped silently, exactly as py-ranges.py does.
 *
 * chr(92) is a backslash, written this way because a literal one does not survive being
 * pasted through a shell heredoc and the failure is silent: the quote it escapes swallows
 * the rest of the string and the parse error surfaces somewhere else entirely.
 */

$SKIP = ['node_modules', '.git', 'dist', 'build', 'out', 'graphify-out',
         'coverage', '__pycache__', '.venv', 'venv', 'vendor'];

if ($argc < 2) { fwrite(STDERR, "usage: php php-ranges.php <repo-root>\n"); exit(1); }

$BS = chr(92);
$root = rtrim(str_replace($BS, '/', $argv[1]), '/');

// Declaration keywords that introduce a brace-delimited body.
$KEYWORDS = [T_FUNCTION, T_CLASS, T_INTERFACE, T_TRAIT];
if (defined('T_ENUM')) $KEYWORDS[] = T_ENUM;                    // PHP 8.1+
$KEYWORDS = array_flip($KEYWORDS);

// Tokens that open a brace which a plain '}' closes.
$CURLY_OPENERS = [];
foreach (['T_CURLY_OPEN', 'T_DOLLAR_OPEN_CURLY_BRACES'] as $maybe) {
    if (defined($maybe)) $CURLY_OPENERS[constant($maybe)] = true;
}

// Context tokens that mean the keyword after them is not a declaration: a use-import,
// a method call, or the `::class` constant.
$NOT_A_DECL = [T_USE, T_OBJECT_OPERATOR, T_DOUBLE_COLON];
if (defined('T_NULLSAFE_OBJECT_OPERATOR')) $NOT_A_DECL[] = T_NULLSAFE_OBJECT_OPERATOR;

/** The last token before $i that is not whitespace or a comment. */
function prev_significant($tokens, $i) {
    for ($j = $i - 1; $j >= 0; $j--) {
        $t = $tokens[$j];
        if (is_array($t) && ($t[0] === T_WHITESPACE || $t[0] === T_COMMENT || $t[0] === T_DOC_COMMENT)) continue;
        return $t;
    }
    return null;
}

function ranges_for($src) {
    global $KEYWORDS, $CURLY_OPENERS, $NOT_A_DECL;

    $tokens = @token_get_all($src);
    if (!$tokens) return [];
    $n = count($tokens);

    // Pass 1: a line number for every token index, including the string tokens that
    // carry none of their own.
    $lines = [];
    $line = 1;
    for ($i = 0; $i < $n; $i++) {
        $t = $tokens[$i];
        if (is_array($t)) {
            $line = $t[2];                       // resync on the authoritative start line
            $lines[$i] = $line;
            $line += substr_count($t[1], "\n");  // advance past multi-line text
        } else {
            $lines[$i] = $line;
        }
    }

    // Pass 2: one row per declaration whose body provably closes.
    $rows = [];
    for ($i = 0; $i < $n; $i++) {
        $t = $tokens[$i];
        if (!is_array($t) || !isset($KEYWORDS[$t[0]])) continue;

        // `static::class` is the class-name constant, not a class declaration, and
        // `use function Foo\bar;` is an import. Both reach here as a keyword token, so the
        // check is on what precedes it and applies to every keyword, not just T_FUNCTION.
        $p = prev_significant($tokens, $i);
        if (is_array($p) && in_array($p[0], $NOT_A_DECL, true)) continue;

        $start = $lines[$i];

        // The name is the first identifier after the keyword. Closures (`function () {}`)
        // and anonymous classes (`new class {}`) keep a null name, so the caller's
        // widest-range and tightest-containing fallbacks still have something to pick.
        $name = null;
        $j = $i + 1;
        for (; $j < $n; $j++) {
            $u = $tokens[$j];
            if (is_array($u)) {
                if ($u[0] === T_WHITESPACE || $u[0] === T_COMMENT || $u[0] === T_DOC_COMMENT) continue;
                if ($u[0] === T_STRING) $name = $u[1];
            }
            break;
        }

        // Walk to the end of the body. A ';' at depth 0 before any '{' means there is no
        // body: an abstract or interface method, whose declaration is the whole range.
        $depth = 0;
        $sawBrace = false;
        $end = null;
        for ($k = $j; $k < $n; $k++) {
            $u = $tokens[$k];
            if (is_array($u)) {
                if (isset($CURLY_OPENERS[$u[0]])) { $depth++; $sawBrace = true; }
                continue;
            }
            if ($u === '{') { $depth++; $sawBrace = true; continue; }
            if ($u === '}') {
                $depth--;
                if ($sawBrace && $depth === 0) { $end = $lines[$k]; break; }
                if ($depth < 0) break;           // ran past the enclosing body: give up
                continue;
            }
            if ($u === ';' && $depth === 0) { $end = $lines[$k]; break; }
        }

        if ($end !== null) $rows[] = [$name, $start, $end];
    }
    return $rows;
}

$out = [];
$stack = [$root];
while ($stack) {
    $dir = array_pop($stack);
    $entries = @scandir($dir);
    if ($entries === false) continue;
    foreach ($entries as $e) {
        if ($e === '.' || $e === '..') continue;
        if (in_array($e, $SKIP, true)) continue;
        $full = $dir . '/' . $e;
        if (is_dir($full)) { $stack[] = $full; continue; }
        if (strtolower(pathinfo($e, PATHINFO_EXTENSION)) !== 'php') continue;
        $src = @file_get_contents($full);
        if ($src === false) continue;
        $rows = ranges_for($src);
        if ($rows) {
            $rel = ltrim(substr(str_replace($BS, '/', $full), strlen($root)), '/');
            $out[$rel] = $rows;
        }
    }
}

echo json_encode($out, JSON_UNESCAPED_SLASHES);
