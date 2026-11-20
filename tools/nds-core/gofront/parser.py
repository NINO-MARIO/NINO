"""Recursive-descent parser for Go (no generics), producing a small AST of Node objects."""
from lexer import lex, Tok

class ParseError(Exception):
    def __init__(self, line, col, msg):
        super().__init__(f'{line}:{col}: {msg}')
        self.line, self.col, self.msg = line, col, msg

class Node:
    def __init__(self, kind, at=None, **kw):
        self.kind = kind
        self.line = at.line if at else 0
        self.col = at.col if at else 0
        self.__dict__.update(kw)
    def __repr__(self):
        return f'<{self.kind} {self.line}:{self.col}>'

BINARY_PREC = {'||': 1, '&&': 2, '==': 3, '!=': 3, '<': 3, '<=': 3, '>': 3, '>=': 3,
               '+': 4, '-': 4, '|': 4, '^': 4,
               '*': 5, '/': 5, '%': 5, '<<': 5, '>>': 5, '&': 5, '&^': 5}
ASSIGN_OPS = {'+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '&^='}
TYPE_KW = {'map', 'chan', 'struct', 'interface', 'func'}

class Parser:
    def __init__(self, toks):
        self.toks = toks
        self.p = 0
        self.no_lit = 0           # >0 while parsing a control-clause header (composite literals need parentheses)

    # ---- token helpers ----
    @property
    def t(self): return self.toks[self.p]
    def peek(self, k=1): return self.toks[min(self.p + k, len(self.toks) - 1)]
    def next(self):
        t = self.toks[self.p]
        if t.kind != 'EOF': self.p += 1
        return t
    def is_op(self, v): return self.t.kind == 'OP' and self.t.val == v
    def is_kw(self, v): return self.t.kind == 'KW' and self.t.val == v
    def err(self, msg, t=None):
        t = t or self.t
        raise ParseError(t.line, t.col, msg)
    def expect_op(self, v):
        if not self.is_op(v):
            got = 'end of file' if self.t.kind == 'EOF' else repr(self.t.val or self.t.kind)
            self.err(f'expected {v!r}, found {got}')
        return self.next()
    def expect_kw(self, v):
        if not self.is_kw(v): self.err(f'expected keyword {v!r}, found {self.t.val!r}')
        return self.next()
    def ident(self):
        if self.t.kind != 'IDENT': self.err(f'expected name, found {self.t.val or self.t.kind!r}')
        return self.next()
    def skip_semi(self):
        if self.is_op(';'): self.next(); return True
        return False
    def expect_semi(self, ctx):
        if self.is_op(';'): self.next(); return
        if self.is_op(')') or self.is_op('}'): return
        if self.t.kind == 'EOF': return
        self.err(f'unexpected {self.t.val or self.t.kind!r} {ctx}; expected newline or ;')

    # ---- file ----
    def parse_file(self):
        if not self.is_kw('package'): self.err('package clause missing or not first')
        self.next()
        pkg = self.ident()
        self.expect_semi('after package clause')
        imports, decls = [], []
        while self.is_kw('import'):
            self.next()
            if self.is_op('('):
                self.next()
                while not self.is_op(')'):
                    imports.append(self.import_spec())
                    self.expect_semi('in import declaration')
                self.next()
            else:
                imports.append(self.import_spec())
            self.expect_semi('after import declaration')
        while self.t.kind != 'EOF':
            if self.is_kw('func'): decls.append(self.func_decl())
            elif self.t.kind == 'KW' and self.t.val in ('var', 'const', 'type'): decls.extend(self.gen_decl())
            elif self.is_kw('import'): self.err('imports must appear before other declarations')
            else: self.err(f'non-declaration statement outside function body: {self.t.val!r}')
            if self.t.kind != 'EOF': self.expect_semi('after top level declaration')
        return Node('File', pkg, pkg=pkg.val, imports=imports, decls=decls)

    def import_spec(self):
        t = self.t
        alias = None
        if self.t.kind == 'IDENT' or self.is_op('.'):
            alias = self.next().val
        if self.t.kind != 'STRING': self.err('import path must be a string')
        path = self.next()
        return Node('Import', t, alias=alias, path=path.val[1:-1])

    # ---- declarations ----
    def gen_decl(self):
        kw = self.next().val
        out = []
        if self.is_op('('):
            self.next()
            prev = None
            while not self.is_op(')'):
                s = self.spec(kw, prev)
                out.append(s); prev = s
                self.expect_semi(f'in {kw} declaration')
            self.next()
        else:
            out.append(self.spec(kw, None))
        return out

    def spec(self, kw, prev):
        if kw == 'type':
            name = self.ident_node()
            if self.is_op('='): self.next()
            typ = self.type_()
            return Node('TypeSpec', name, name=name, typ=typ)
        if kw == 'const':
            t = self.t
            names = self.ident_list()
            typ = None
            values = []
            if not self.is_op('=') and not self.is_op(';') and not self.is_op(')'):
                typ = self.type_()
            if self.is_op('='):
                self.next(); values = self.expr_list()
            elif prev is not None and typ is None:
                # implicit repetition of the previous spec (iota groups)
                typ, values = prev.typ, prev.values
            return Node('ConstSpec', t, names=[n for n in names], typ=typ, values=values)
        # var
        t = self.t
        names = self.ident_list()
        typ, values = None, []
        if not self.is_op('='): typ = self.type_()
        if self.is_op('='):
            self.next(); values = self.expr_list()
        return Node('VarSpec', t, names=names, typ=typ, values=values)

    def ident_node(self):
        t = self.ident()
        return Node('Ident', t, name=t.val)

    def ident_list(self):
        names = [self.ident_node()]
        while self.is_op(','):
            self.next(); names.append(self.ident_node())
        return names

    def func_decl(self):
        kw = self.expect_kw('func')
        recv = None
        if self.is_op('('):
            recv = self.params()
        name = self.ident()
        params, results = self.signature()
        body = None
        if self.is_op('{'):
            body = self.block()
        return Node('FuncDecl', kw, name=name.val, recv=recv, params=params, results=results, body=body)

    def signature(self):
        params = self.params()
        results = []
        if self.is_op('('):
            results = self.params()
        elif self.starts_type():
            results = [(None, self.type_())]
        return params, results

    def starts_type(self):
        t = self.t
        if t.kind == 'IDENT': return True
        if t.kind == 'KW' and t.val in TYPE_KW: return True
        if t.kind == 'OP' and t.val in ('[', '*', '(', '<-'): return True
        return False

    def params(self):
        """Parameter list in parentheses -> list of (name_Ident_or_None, type_node_or_None).
        Go groups names: `a, b int` gives two named parameters of type int. A bare identifier
        with no type anywhere in the list is a type (`func(int, string)`)."""
        self.expect_op('(')
        entries = []   # (ident_node_or_None, type_node_or_None), type None = name waiting for its type
        while not self.is_op(')'):
            if self.is_op('...'):
                at = self.next()
                entries.append((None, Node('Ellipsis', at, elt=self.type_())))
            elif self.t.kind == 'IDENT' and not (self.peek().kind == 'OP' and self.peek().val == '.'):
                tok = self.next()
                ident = Node('Ident', tok, name=tok.val)
                if self.is_op(',') or self.is_op(')'):
                    entries.append((ident, None))           # name, or a bare type: decided below
                elif self.is_op('...'):
                    at = self.next()
                    entries.append((ident, Node('Ellipsis', at, elt=self.type_())))
                else:
                    entries.append((ident, self.type_()))
            else:
                entries.append((None, self.type_()))        # qualified type, *T, []T, func(...) ...
            if not self.is_op(')'):
                self.expect_op(',')
        self.next()
        # a list is 'named' only if some entry is a name with its type: (a, b int); otherwise all are types
        has_typed = any(ident is not None and typ is not None for ident, typ in entries)
        out = []
        pending = []
        for ident, typ in entries:
            if typ is None and ident is not None:
                pending.append(ident)
            elif typ is None:
                out.append((None, None))
            else:
                if ident is None:
                    out.append((None, typ))
                else:
                    for p in pending: out.append((p, typ))
                    out.append((ident, typ))
                pending = []
        for p in pending:
            if has_typed:
                out.append((p, None))   # unreachable for valid Go; kept so the error shows up
            else:
                out.append((None, p))   # bare type identifier: resolve it as a type
        return out

    # ---- types ----
    def type_(self):
        t = self.t
        if t.kind == 'IDENT':
            self.next()
            node = Node('Ident', t, name=t.val)
            if self.is_op('.'):
                self.next()
                sel = self.ident()
                node = Node('Selector', t, x=node, sel=sel.val)
            return node
        if t.kind == 'OP' and t.val == '*':
            self.next(); return Node('Star', t, x=self.type_())
        if t.kind == 'OP' and t.val == '(':
            self.next(); ty = self.type_(); self.expect_op(')'); return ty
        if t.kind == 'OP' and t.val == '[':
            self.next()
            if self.is_op(']'):
                self.next(); return Node('SliceType', t, elt=self.type_())
            if self.is_op('...'):
                self.next(); self.expect_op(']'); return Node('ArrayType', t, len=None, elt=self.type_())
            ln = self.expr()
            self.expect_op(']')
            return Node('ArrayType', t, len=ln, elt=self.type_())
        if t.kind == 'OP' and t.val == '<-':
            self.next(); self.expect_kw('chan'); return Node('ChanType', t, dir='recv', elt=self.type_())
        if t.kind == 'KW':
            if t.val == 'map':
                self.next(); self.expect_op('['); k = self.type_(); self.expect_op(']')
                return Node('MapType', t, key=k, val=self.type_())
            if t.val == 'chan':
                self.next(); d = 'both'
                if self.is_op('<-'): self.next(); d = 'send'
                return Node('ChanType', t, dir=d, elt=self.type_())
            if t.val == 'func':
                self.next(); params, results = self.signature()
                return Node('FuncType', t, params=params, results=results)
            if t.val == 'struct': return self.struct_type()
            if t.val == 'interface': return self.interface_type()
        self.err(f'expected type, found {t.val or t.kind!r}')

    def struct_type(self):
        t = self.expect_kw('struct')
        self.expect_op('{')
        fields = []   # (names or [], type)
        while not self.is_op('}'):
            if self.is_op('*') or (self.t.kind == 'IDENT' and (self.peek().kind == 'OP' and self.peek().val in (';', '}', '.')) or self.peek().kind == 'STRING'):
                typ = self.type_()
                fields.append(([], typ))
            else:
                names = self.ident_list()
                typ = self.type_()
                fields.append((names, typ))
            if self.t.kind == 'STRING': self.next()     # tag
            self.expect_semi('in struct type')
        self.next()
        return Node('StructType', t, fields=fields)

    def interface_type(self):
        t = self.expect_kw('interface')
        self.expect_op('{')
        methods, embeds = [], []
        while not self.is_op('}'):
            if self.t.kind == 'IDENT' and self.peek().kind == 'OP' and self.peek().val == '(':
                name = self.ident()
                params, results = self.signature()
                methods.append((name.val, Node('FuncType', name, params=params, results=results)))
            else:
                # embedded interface or type-set element: T | ~U | ...
                while True:
                    if self.is_op('~'): self.next()
                    embeds.append(self.type_())
                    if self.is_op('|'): self.next(); continue
                    break
            self.expect_semi('in interface type')
        self.next()
        return Node('InterfaceType', t, methods=methods, embeds=embeds)

    # ---- statements ----
    def block(self):
        t = self.expect_op('{')
        saved = self.no_lit; self.no_lit = 0
        stmts = self.stmt_list()
        self.no_lit = saved
        end = self.expect_op('}')
        return Node('Block', t, stmts=stmts, end=(end.line, end.col))

    def stmt_list(self):
        out = []
        while not (self.is_op('}') or self.is_kw('case') or self.is_kw('default') or self.t.kind == 'EOF'):
            if self.is_op(';'):
                self.next(); continue
            out.append(self.stmt())
            if not (self.is_op('}') or self.is_kw('case') or self.is_kw('default')):
                self.expect_semi('at end of statement')
        return out

    def stmt(self):
        t = self.t
        if t.kind == 'KW':
            v = t.val
            if v in ('var', 'const', 'type'): return Node('DeclStmt', t, decls=self.gen_decl())
            if v == 'return':
                self.next()
                vals = [] if (self.is_op(';') or self.is_op('}')) else self.expr_list()
                return Node('Return', t, vals=vals)
            if v in ('break', 'continue', 'goto'):
                self.next()
                label = self.ident().val if self.t.kind == 'IDENT' else None
                return Node('Branch', t, tok=v, label=label)
            if v == 'fallthrough': self.next(); return Node('Branch', t, tok=v, label=None)
            if v == 'go' or v == 'defer':
                self.next(); call = self.expr()
                if call.kind != 'Call': self.err(f'expression in {v} must be function call', t)
                return Node('GoDefer', t, tok=v, call=call)
            if v == 'if': return self.if_stmt()
            if v == 'for': return self.for_stmt()
            if v == 'switch': return self.switch_stmt()
            if v == 'select': return self.select_stmt()
            if v == 'func' or v in ('map', 'chan', 'struct', 'interface'):
                return self.simple_stmt()
            self.err(f'unexpected keyword {v!r}')
        if t.kind == 'OP' and t.val == '{':
            return Node('BlockStmt', t, block=self.block())
        if t.kind == 'OP' and t.val == ';':
            return Node('Empty', t)
        if t.kind == 'IDENT' and self.peek().kind == 'OP' and self.peek().val == ':' :
            name = self.next(); self.next()
            if self.is_op('}'): return Node('Labeled', name, label=name.val, stmt=Node('Empty', name))
            return Node('Labeled', name, label=name.val, stmt=self.stmt())
        return self.simple_stmt()

    def simple_stmt(self, range_ok=False):
        t = self.t
        if range_ok and self.is_kw('range'):
            self.next(); x = self.expr()
            return Node('Range', t, lhs=[], define=False, x=x)
        lhs = self.expr_list()
        if self.t.kind == 'OP':
            v = self.t.val
            if v in (':=', '='):
                self.next()
                if range_ok and self.is_kw('range'):
                    self.next(); x = self.expr()
                    return Node('Range', t, lhs=lhs, define=(v == ':='), x=x)
                rhs = self.expr_list()
                return Node('Assign', t, lhs=lhs, rhs=rhs, op=v)
            if v in ASSIGN_OPS:
                self.next(); rhs = self.expr_list()
                return Node('Assign', t, lhs=lhs, rhs=rhs, op=v)
            if v in ('++', '--'):
                self.next(); return Node('IncDec', t, x=lhs[0], op=v)
            if v == '<-':
                self.next(); val = self.expr()
                return Node('Send', t, ch=lhs[0], val=val)
        if len(lhs) > 1: self.err('expected := or = or comma')
        return Node('ExprStmt', t, x=lhs[0])

    def if_stmt(self):
        t = self.expect_kw('if')
        self.no_lit += 1
        init, cond = None, None
        s = self.simple_stmt() if not self.is_op(';') else None
        if self.is_op(';'):
            self.next(); init = s
            cond_stmt = self.simple_stmt()
        else:
            cond_stmt = s
        self.no_lit -= 1
        if cond_stmt is None or cond_stmt.kind != 'ExprStmt': self.err('missing condition in if statement', t)
        cond = cond_stmt.x
        body = self.block()
        els = None
        if self.is_kw('else'):
            self.next()
            if self.is_kw('if'): els = self.if_stmt()
            elif self.is_op('{'): els = Node('BlockStmt', self.t, block=self.block())
            else: self.err('else must be followed by if or statement block')
        return Node('If', t, init=init, cond=cond, body=body, els=els)

    def for_stmt(self):
        t = self.expect_kw('for')
        self.no_lit += 1
        init = cond = post = None
        rng = None
        if self.is_op('{'):
            pass
        else:
            if not self.is_op(';'):
                s = self.simple_stmt(range_ok=True)
                if s.kind == 'Range': rng = s
                else: init = s
            if rng is None and self.is_op(';'):
                self.next()
                if not self.is_op(';'):
                    cs = self.simple_stmt(); cond = cs.x if cs.kind == 'ExprStmt' else self.err('for condition must be expression')
                self.expect_op(';')
                if not self.is_op('{'):
                    post = self.simple_stmt()
            elif rng is None and init is not None:
                if init.kind != 'ExprStmt': self.err('expected for loop condition', t)
                cond, init = init.x, None
        self.no_lit -= 1
        body = self.block()
        if rng is not None:
            return Node('ForRange', t, lhs=rng.lhs, define=rng.define, x=rng.x, body=body)
        return Node('For', t, init=init, cond=cond, post=post, body=body)

    def switch_stmt(self):
        t = self.expect_kw('switch')
        self.no_lit += 1
        init, tag = None, None
        if not self.is_op('{'):
            s = None if self.is_op(';') else self.simple_stmt()
            if self.is_op(';'):
                self.next(); init = s
                if not self.is_op('{'): tag = self.simple_stmt()
            else:
                tag = s
        self.no_lit -= 1
        self.expect_op('{')
        clauses = []
        while not self.is_op('}'):
            ct = self.t
            if self.is_kw('case'):
                self.next(); exprs = self.expr_list()
                self.expect_op(':')
                clauses.append(Node('Case', ct, exprs=exprs, body=self.stmt_list()))
            elif self.is_kw('default'):
                self.next(); self.expect_op(':')
                clauses.append(Node('Case', ct, exprs=None, body=self.stmt_list()))
            else:
                self.err('expected case or default in switch body')
        self.next()
        is_type = False
        bind = None
        ts = None
        if tag is not None:
            if tag.kind == 'Assign' and len(tag.rhs) == 1 and tag.rhs[0].kind == 'TypeAssert' and tag.rhs[0].typ is None:
                is_type, bind, ts = True, tag.lhs[0], tag.rhs[0]
            elif tag.kind == 'ExprStmt' and tag.x.kind == 'TypeAssert' and tag.x.typ is None:
                is_type, ts = True, tag.x
        return Node('Switch', t, init=init, tag=tag, clauses=clauses, is_type=is_type, bind=bind, ts=ts)

    def select_stmt(self):
        t = self.expect_kw('select')
        self.expect_op('{')
        clauses = []
        while not self.is_op('}'):
            ct = self.t
            if self.is_kw('case'):
                self.next(); comm = self.simple_stmt()
                self.expect_op(':')
                clauses.append(Node('CommClause', ct, comm=comm, body=self.stmt_list()))
            elif self.is_kw('default'):
                self.next(); self.expect_op(':')
                clauses.append(Node('CommClause', ct, comm=None, body=self.stmt_list()))
            else:
                self.err('expected case or default in select body')
        self.next()
        return Node('Select', t, clauses=clauses)

    # ---- expressions ----
    def expr_list(self):
        out = [self.expr()]
        while self.is_op(','):
            self.next(); out.append(self.expr())
        return out

    def expr(self, prec=1):
        x = self.unary()
        while self.t.kind == 'OP' and self.t.val in BINARY_PREC and BINARY_PREC[self.t.val] >= prec:
            op = self.next()
            y = self.expr(BINARY_PREC[op.val] + 1)
            x = Node('Binary', op, op=op.val, x=x, y=y)
        return x

    def unary(self):
        t = self.t
        if t.kind == 'OP' and t.val in ('+', '-', '!', '^', '&', '*', '<-'):
            self.next()
            x = self.unary()
            if t.val == '<-' and x.kind == 'ChanType':
                return Node('ChanType', t, dir='recv', elt=x.elt)
            return Node('Unary', t, op=t.val, x=x)
        return self.primary()

    def operand(self):
        t = self.t
        if t.kind in ('INT', 'FLOAT', 'IMAG', 'CHAR', 'STRING'):
            self.next(); return Node('BasicLit', t, lit=t.kind, val=t.val)
        if t.kind == 'IDENT':
            self.next(); return Node('Ident', t, name=t.val)
        if t.kind == 'OP' and t.val == '(':
            self.next()
            saved = self.no_lit; self.no_lit = 0
            x = self.expr_or_type()
            self.no_lit = saved
            self.expect_op(')')
            return Node('Paren', t, x=x)
        if t.kind == 'KW' and t.val == 'func':
            self.next()
            params, results = self.signature()
            if self.is_op('{'):
                saved = self.no_lit; self.no_lit = 0
                body = self.block()
                self.no_lit = saved
                return Node('FuncLit', t, params=params, results=results, body=body)
            return Node('FuncType', t, params=params, results=results)
        if (t.kind == 'OP' and t.val in ('[', '*')) or (t.kind == 'KW' and t.val in ('map', 'chan', 'struct', 'interface')):
            return self.type_()
        self.err(f'expected expression, found {t.val or t.kind!r}')

    def expr_or_type(self):
        # operands already accept types ([]T, map[K]V, *T ...), so an expression parser covers both
        return self.expr()

    def primary(self):
        x = self.operand()
        while True:
            t = self.t
            if t.kind != 'OP': break
            v = t.val
            if v == '.':
                self.next()
                if self.is_op('('):
                    self.next()
                    if self.is_kw('type'):
                        self.next(); self.expect_op(')'); x = Node('TypeAssert', t, x=x, typ=None)
                    else:
                        ty = self.type_(); self.expect_op(')'); x = Node('TypeAssert', t, x=x, typ=ty)
                else:
                    sel = self.ident()
                    x = Node('Selector', sel, x=x, sel=sel.val)
            elif v == '[':
                self.next()
                saved = self.no_lit; self.no_lit = 0
                idx = [None, None, None]
                n_colon = 0
                if not self.is_op(':'):
                    idx[0] = self.expr_or_type()
                while self.is_op(':') and n_colon < 2:
                    self.next(); n_colon += 1
                    if not (self.is_op(':') or self.is_op(']')):
                        idx[n_colon] = self.expr()
                self.no_lit = saved
                self.expect_op(']')
                if n_colon == 0:
                    x = Node('Index', t, x=x, index=idx[0])
                else:
                    x = Node('Slice', t, x=x, lo=idx[0], hi=idx[1], max=idx[2])
            elif v == '(':
                self.next()
                saved = self.no_lit; self.no_lit = 0
                args = []
                ell = False
                while not self.is_op(')'):
                    args.append(self.expr_or_type())
                    if self.is_op('...'): self.next(); ell = True
                    if not self.is_op(')'): self.expect_op(',')
                self.no_lit = saved
                self.next()
                x = Node('Call', t, fn=x, args=args, ellipsis=ell)
            elif v == '{':
                if not self.is_literal_type(x) or (self.no_lit and x.kind in ('Ident', 'Selector')):
                    break
                x = self.composite(x)
            else:
                break
        return x

    def is_literal_type(self, x):
        return x.kind in ('Ident', 'Selector', 'ArrayType', 'SliceType', 'MapType', 'StructType')

    def composite(self, typ):
        t = self.expect_op('{')
        saved = self.no_lit; self.no_lit = 0
        elts = []
        while not self.is_op('}'):
            key = None
            val = self.element()
            if self.is_op(':'):
                self.next(); key = val; val = self.element()
            elts.append((key, val))
            if not self.is_op('}'):
                if self.is_op(';'): self.err('unexpected newline in composite literal; possibly missing comma or }')
                self.expect_op(',')
        self.no_lit = saved
        self.next()
        return Node('Composite', t, typ=typ, elts=elts)

    def element(self):
        if self.is_op('{'):
            return self.composite(None)
        return self.expr()


def parse(src):
    return Parser(lex(src)).parse_file()
