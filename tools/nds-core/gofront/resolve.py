"""Name resolution for Go (no types): undefined names, unused local variables, unused imports,
and duplicate package-level names. Works per package and per GOOS, using the build tags."""
from parser import Node

UNIVERSE = set('''bool byte complex64 complex128 error float32 float64 int int8 int16 int32 int64
rune string uint uint8 uint16 uint32 uint64 uintptr any true false iota nil
append cap clear close complex copy delete imag len make max min new panic print println real recover'''.split())

STATS = {'uses': 0, 'decls': 0, 'funcs': 0}

class Obj:
    __slots__ = ('name', 'kind', 'line', 'col', 'used', 'check_unused')
    def __init__(self, name, kind, line=0, col=0, check_unused=False):
        self.name, self.kind, self.line, self.col = name, kind, line, col
        self.used = False
        self.check_unused = check_unused

class Scope:
    def __init__(self, parent=None):
        self.parent = parent
        self.names = {}
    def lookup(self, name):
        s = self
        while s is not None:
            if name in s.names: return s.names[name]
            s = s.parent
        return None

class Checker:
    def __init__(self, filename, errors, pkg_names, imports):
        self.file = filename
        self.errors = errors
        self.pkg = pkg_names                   # package-level names
        self.imports = imports                 # alias -> Obj (file scope)
        self.scope = None
        self.dot_import = any(a == '.' for a in imports)

    def err(self, node, msg):
        self.errors.append((self.file, node.line, node.col, msg))

    def push(self):
        self.scope = Scope(self.scope)
    def pop(self):
        for name, o in self.scope.names.items():
            if o.kind == 'var' and o.check_unused and not o.used and name != '_':
                self.errors.append((self.file, o.line, o.col, f'declared and not used: {name}'))
        self.scope = self.scope.parent

    def declare(self, ident, kind, check_unused=False):
        if ident is None or ident.name == '_': return None
        STATS['decls'] += 1
        o = Obj(ident.name, kind, ident.line, ident.col, check_unused)
        if ident.name in self.scope.names and kind != 'assign':
            self.err(ident, f'{ident.name} redeclared in this block')
        self.scope.names[ident.name] = o
        return o

    def use(self, node, name, mark=True):
        STATS['uses'] += 1
        o = self.scope.lookup(name)
        if o is not None:
            if mark: o.used = True
            return
        if name in self.pkg or name in UNIVERSE: return
        if name in self.imports:
            self.imports[name].used = True
            return
        if self.dot_import: return
        self.err(node, f'undefined: {name}')

    # ---- declarations ----
    def func(self, fd):
        STATS['funcs'] += 1
        self.push()
        if fd.recv:
            for name, typ in fd.recv:
                self.type_(typ)
                if name is not None: self.declare(name, 'var')
        for name, typ in fd.params:
            if typ is not None: self.type_(typ)
            if name is not None: self.declare(name, 'param')
        for name, typ in fd.results:
            if typ is not None: self.type_(typ)
            if name is not None: self.declare(name, 'param')
        if fd.body is not None:
            self.stmts(fd.body.stmts)
        self.pop()

    def gen_decl_in_block(self, d):
        if d.kind == 'VarSpec':
            if d.typ is not None: self.type_(d.typ)
            for v in d.values: self.expr(v)
            for n in d.names: self.declare(n, 'var', check_unused=True)
        elif d.kind == 'ConstSpec':
            if d.typ is not None: self.type_(d.typ)
            for v in d.values: self.expr(v)
            for n in d.names: self.declare(n, 'const')
        elif d.kind == 'TypeSpec':
            self.declare(d.name, 'type')
            self.type_(d.typ)

    # ---- statements ----
    def stmts(self, lst):
        for s in lst: self.stmt(s)

    def stmt(self, s):
        k = s.kind
        if k == 'Block' or k == 'BlockStmt':
            blk = s if k == 'Block' else s.block
            self.push(); self.stmts(blk.stmts); self.pop()
        elif k == 'DeclStmt':
            for d in s.decls: self.gen_decl_in_block(d)
        elif k == 'Assign':
            if s.op == ':=':
                for v in s.rhs: self.expr(v)
                for l in s.lhs:
                    if l.kind != 'Ident': self.err(l, 'non-name on left side of :=')
                    elif l.name == '_': pass
                    elif l.name in self.scope.names: self.scope.names[l.name].used = self.scope.names[l.name].used
                    else: self.declare(l, 'var', check_unused=True)
            else:
                for v in s.rhs: self.expr(v)
                for l in s.lhs:
                    if l.kind == 'Ident':
                        if l.name != '_':
                            # assignment is not a use, but the name must exist
                            self.use(l, l.name, mark=False)
                    else:
                        self.expr(l)
        elif k == 'IncDec':
            self.expr(s.x)
        elif k == 'ExprStmt':
            self.expr(s.x)
        elif k == 'Send':
            self.expr(s.ch); self.expr(s.val)
        elif k == 'GoDefer':
            self.expr(s.call)
        elif k == 'Return':
            for v in s.vals: self.expr(v)
        elif k == 'Branch' or k == 'Empty':
            pass
        elif k == 'Labeled':
            self.stmt(s.stmt)
        elif k == 'If':
            self.push()
            if s.init is not None: self.stmt(s.init)
            self.expr(s.cond)
            self.stmt(Node('BlockStmt', block=s.body))
            if s.els is not None: self.stmt(s.els)
            self.pop()
        elif k == 'For':
            self.push()
            if s.init is not None: self.stmt(s.init)
            if s.cond is not None: self.expr(s.cond)
            if s.post is not None: self.stmt(s.post)
            self.stmt(Node('BlockStmt', block=s.body))
            self.pop()
        elif k == 'ForRange':
            self.expr(s.x)
            self.push()
            if s.define:
                for l in s.lhs:
                    if l.kind == 'Ident': self.declare(l, 'var', check_unused=True)
            else:
                for l in s.lhs:
                    if l.kind == 'Ident': self.use(l, l.name, mark=False)
                    else: self.expr(l)
            self.stmt(Node('BlockStmt', block=s.body))
            self.pop()
        elif k == 'Switch':
            self.push()
            if s.init is not None: self.stmt(s.init)
            if s.is_type:
                self.expr(s.ts.x)
            elif s.tag is not None:
                if s.tag.kind == 'ExprStmt': self.expr(s.tag.x)
                else: self.stmt(s.tag)
            for c in s.clauses:
                self.push()
                if s.is_type and s.bind is not None and s.bind.kind == 'Ident' and s.bind.name != '_':
                    self.declare(s.bind, 'var', check_unused=False)
                if c.exprs:
                    for e in c.exprs: self.expr(e)
                self.stmts(c.body)
                self.pop()
            self.pop()
        elif k == 'Select':
            for c in s.clauses:
                self.push()
                if c.comm is not None: self.stmt(c.comm)
                self.stmts(c.body)
                self.pop()
        else:
            self.err(s, f'internal: unhandled statement {k}')

    # ---- expressions and types ----
    def expr(self, e):
        if e is None: return
        k = e.kind
        if k == 'Ident':
            self.use(e, e.name)
        elif k == 'BasicLit':
            pass
        elif k == 'Selector':
            if e.x.kind == 'Ident' and e.x.name in self.imports and self.scope.lookup(e.x.name) is None:
                self.imports[e.x.name].used = True
            else:
                self.expr(e.x)
        elif k == 'Binary':
            self.expr(e.x); self.expr(e.y)
        elif k == 'Unary':
            self.expr(e.x)
        elif k == 'Paren':
            self.expr(e.x)
        elif k == 'Star':
            self.expr(e.x)
        elif k == 'Call':
            self.expr(e.fn)
            for a in e.args: self.expr(a)
        elif k == 'Index':
            self.expr(e.x); self.expr(e.index)
        elif k == 'Slice':
            self.expr(e.x); self.expr(e.lo); self.expr(e.hi); self.expr(e.max)
        elif k == 'TypeAssert':
            self.expr(e.x)
            if e.typ is not None: self.type_(e.typ)
        elif k == 'Composite':
            if e.typ is not None: self.type_(e.typ) if e.typ.kind not in ('Ident',) else self.expr(e.typ)
            for key, val in e.elts:
                if key is not None:
                    if key.kind == 'Ident':
                        o = self.scope.lookup(key.name)
                        if o is not None: o.used = True
                    else:
                        self.expr(key)
                self.expr(val)
        elif k == 'FuncLit':
            self.push()
            for name, typ in e.params:
                if typ is not None: self.type_(typ)
                if name is not None: self.declare(name, 'param')
            for name, typ in e.results:
                if typ is not None: self.type_(typ)
                if name is not None: self.declare(name, 'param')
            self.stmts(e.body.stmts)
            self.pop()
        elif k in ('ArrayType', 'SliceType', 'MapType', 'ChanType', 'FuncType', 'StructType', 'InterfaceType', 'Ellipsis'):
            self.type_(e)
        else:
            self.err(e, f'internal: unhandled expression {k}')

    def type_(self, t):
        if t is None: return
        k = t.kind
        if k == 'Ident':
            self.use(t, t.name)
        elif k == 'Selector':
            self.expr(t)
        elif k == 'Star':
            self.type_(t.x)
        elif k in ('SliceType', 'ChanType', 'Ellipsis'):
            self.type_(t.elt)
        elif k == 'ArrayType':
            if t.len is not None: self.expr(t.len)
            self.type_(t.elt)
        elif k == 'MapType':
            self.type_(t.key); self.type_(t.val)
        elif k == 'FuncType':
            for n, ty in t.params: self.type_(ty)
            for n, ty in t.results: self.type_(ty)
        elif k == 'StructType':
            for names, ty in t.fields: self.type_(ty)
        elif k == 'InterfaceType':
            for name, ft in t.methods: self.type_(ft)
            for em in t.embeds: self.type_(em)
        elif k in ('Paren',):
            self.type_(t.x)
        elif k in ('Unary', 'Binary', 'Call', 'Index', 'Composite', 'FuncLit', 'BasicLit', 'TypeAssert', 'Slice'):
            self.expr(t)
        else:
            self.err(t, f'internal: unhandled type {k}')
