"""Go lexer: tokens with positions, and automatic semicolon insertion (Go spec, Semicolons)."""
import re

KEYWORDS = {
    'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else', 'fallthrough',
    'for', 'func', 'go', 'goto', 'if', 'import', 'interface', 'map', 'package', 'range',
    'return', 'select', 'struct', 'switch', 'type', 'var',
}
# longest first so that the scanner takes the longest operator
OPERATORS = sorted([
    '+', '&', '+=', '&=', '&&', '==', '!=', '(', ')', '-', '|', '-=', '|=', '||', '<', '<=', '[', ']',
    '*', '^', '*=', '^=', '<-', '>', '>=', '{', '}', '/', '<<', '/=', '<<=', '++', '=', ':=', ',', ';',
    '%', '>>', '%=', '>>=', '--', '!', '...', '.', ':', '&^', '&^=', '~',
], key=len, reverse=True)
# a newline after one of these ends a statement
SEMI_AFTER_KW = {'break', 'continue', 'fallthrough', 'return'}
SEMI_AFTER_OP = {'++', '--', ')', ']', '}'}

class LexError(Exception):
    def __init__(self, line, col, msg):
        super().__init__(f'{line}:{col}: {msg}')
        self.line, self.col, self.msg = line, col, msg

class Tok:
    __slots__ = ('kind', 'val', 'line', 'col')
    def __init__(self, kind, val, line, col):
        self.kind, self.val, self.line, self.col = kind, val, line, col
    def __repr__(self):
        return f'Tok({self.kind},{self.val!r},{self.line}:{self.col})'

def _ends_statement(t):
    if t is None: return False
    if t.kind in ('IDENT', 'INT', 'FLOAT', 'IMAG', 'CHAR', 'STRING'): return True
    if t.kind == 'KW': return t.val in SEMI_AFTER_KW
    if t.kind == 'OP': return t.val in SEMI_AFTER_OP
    return False

def lex(src):
    toks = []
    i, n = 0, len(src)
    line, col0 = 1, 0             # col0 = index of the start of the current line
    last = None
    def emit(kind, val, start):
        nonlocal last
        t = Tok(kind, val, line, start - col0 + 1)
        toks.append(t); last = t
    def newline_at(pos):
        nonlocal last
        if _ends_statement(last):
            toks.append(Tok('OP', ';', line, pos - col0 + 1)); last = None
    while i < n:
        c = src[i]
        if c == '\n':
            newline_at(i)
            i += 1; line += 1; col0 = i
            continue
        if c in ' \t\r':
            i += 1; continue
        if src.startswith('//', i):
            j = src.find('\n', i)
            i = n if j < 0 else j
            continue
        if src.startswith('/*', i):
            j = src.find('*/', i + 2)
            if j < 0: raise LexError(line, i - col0 + 1, 'comment not terminated')
            body = src[i:j + 2]
            if '\n' in body:
                newline_at(i)
            # advance line counters
            nl = body.count('\n')
            if nl:
                line += nl
                col0 = i + body.rfind('\n') + 1
            i = j + 2
            continue
        start = i
        if c.isalpha() or c == '_':
            m = re.compile(r'[^\W\d]\w*', re.UNICODE).match(src, i)
            word = m.group(0); i = m.end()
            emit('KW' if word in KEYWORDS else 'IDENT', word, start)
            continue
        if c.isdigit() or (c == '.' and i + 1 < n and src[i + 1].isdigit()):
            m = re.compile(
                r'0[xX](?:_?[0-9a-fA-F])*(?:\.(?:_?[0-9a-fA-F])*)?(?:[pP][+-]?\d+)?i?'
                r'|0[bB](?:_?[01])+i?|0[oO](?:_?[0-7])+i?'
                r'|(?:\d(?:_?\d)*)?\.?\d(?:_?\d)*(?:[eE][+-]?\d(?:_?\d)*)?i?|\d(?:_?\d)*\.(?:[eE][+-]?\d+)?i?'
            ).match(src, i)
            text = m.group(0)
            if not text: raise LexError(line, i - col0 + 1, 'bad number')
            i = m.end()
            if text.endswith('i'): kind = 'IMAG'
            elif any(ch in text for ch in '.eEpP') and not text.lower().startswith('0x'): kind = 'FLOAT'
            elif text.lower().startswith('0x') and ('.' in text or 'p' in text.lower()): kind = 'FLOAT'
            else: kind = 'INT'
            emit(kind, text, start)
            continue
        if c == '"':
            j = i + 1
            while j < n and src[j] != '"':
                if src[j] == '\\': j += 1
                if j < n and src[j] == '\n': raise LexError(line, start - col0 + 1, 'newline in string')
                j += 1
            if j >= n: raise LexError(line, start - col0 + 1, 'string not terminated')
            emit('STRING', src[i:j + 1], start); i = j + 1
            continue
        if c == '`':
            j = src.find('`', i + 1)
            if j < 0: raise LexError(line, start - col0 + 1, 'raw string not terminated')
            text = src[i:j + 1]
            t_line, t_col = line, start - col0 + 1
            nl = text.count('\n')
            toks.append(Tok('STRING', text, t_line, t_col)); last = toks[-1]
            if nl:
                line += nl; col0 = i + text.rfind('\n') + 1
            i = j + 1
            continue
        if c == "'":
            j = i + 1
            while j < n and src[j] != "'":
                if src[j] == '\\': j += 1
                if j < n and src[j] == '\n': raise LexError(line, start - col0 + 1, 'newline in rune')
                j += 1
            if j >= n: raise LexError(line, start - col0 + 1, 'rune not terminated')
            emit('CHAR', src[i:j + 1], start); i = j + 1
            continue
        for op in OPERATORS:
            if src.startswith(op, i):
                emit('OP', op, start); i += len(op)
                break
        else:
            raise LexError(line, start - col0 + 1, f'illegal character {c!r}')
    if _ends_statement(last):
        toks.append(Tok('OP', ';', line, i - col0 + 1))
    toks.append(Tok('EOF', '', line, i - col0 + 1))
    return toks
