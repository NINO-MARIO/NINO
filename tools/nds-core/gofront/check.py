#!/usr/bin/env python3
"""gofront check: parse every Go file, then resolve names per package and per GOOS.

  python3 check.py                 check tools/nds-core (the engine)
  python3 check.py --selftest      seed known defects and prove each one is caught
  python3 check.py OUT             also write the report to OUT

Output lines: ERROR / SUSPECT with file:line:col. Exit 1 if any ERROR.
This is a front end (syntax + names). It does not check types, so it cannot
prove that a package compiles; it finds the defect classes that do not need types."""
import os, sys, glob, importlib.util, tempfile, shutil
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from lexer import LexError
from parser import parse, ParseError, Node
from resolve import Checker, Obj, Scope, STATS

def _load_detective():
    spec = importlib.util.spec_from_file_location('detective', os.path.join(HERE, '..', 'detective.py'))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
D = _load_detective()

ENVS = (('js', D.ENV_JS), ('linux', D.ENV_LINUX))

def package_name(path):
    return D.package_name(path)

def check_package(files, env_name, env, errors):
    """files: list of (path, src, ast). Checks the files that build for env_name."""
    inc = [(p, src, ast) for p, src, ast in files
           if D.name_included(os.path.basename(p), env) and D.eval_tag(D.tag_of(src), env)]
    if not inc: return
    # package-level names, with duplicate detection
    root = Scope(None)
    seen = {}
    pkg_names = set()
    def add(name, path, node):
        if name == '_' or name is None: return
        if name in seen:
            errors.append((path, node.line, node.col, f'{name} redeclared (also at {seen[name]}) for GOOS={env_name}'))
        else:
            seen[name] = f'{path}:{node.line}'
        pkg_names.add(name)
    for path, src, ast in inc:
        for d in ast.decls:
            if d.kind == 'FuncDecl':
                if d.recv is None: add(d.name, path, d)
            elif d.kind == 'TypeSpec': add(d.name.name, path, d.name)
            elif d.kind in ('VarSpec', 'ConstSpec'):
                for n in d.names: add(n.name, path, n)
    for path, src, ast in inc:
        imports = {}
        for imp in ast.imports:
            alias = imp.alias or package_name(imp.path)
            if imp.path == 'C':
                # cgo pseudo-package: C.xxx is always legal in a file that imports it
                imports['C'] = Obj('C', 'import', imp.line, imp.col); imports['C'].used = True
                continue
            if alias == '_': continue
            imports[alias] = Obj(alias, 'import', imp.line, imp.col)
            imports[alias].used = False
        ck = Checker(path, errors, pkg_names, imports)
        for d in ast.decls:
            ck.scope = root
            if d.kind == 'FuncDecl':
                fd = d
                ck.func(fd)
            elif d.kind in ('VarSpec', 'ConstSpec'):
                ck.gen_decl_in_block(d) if False else None
                if d.typ is not None: ck.type_(d.typ)
                for v in d.values: ck.expr(v)
            elif d.kind == 'TypeSpec':
                ck.type_(d.typ)
        for alias, o in imports.items():
            if not o.used and not ck.dot_import:
                imp = next(i for i in ast.imports if (i.alias or package_name(i.path)) == alias)
                errors.append((path, imp.line, imp.col, f'"{imp.path}" imported and not used'))

def run(root):
    errors = []
    pkgs = {}
    for d, ds, fs in os.walk(root):
        if d != root and os.path.exists(os.path.join(d, 'go.mod')):
            ds[:] = []; continue
        if '__pycache__' in d or '/.git' in d: continue
        gos = [os.path.join(d, f) for f in fs if f.endswith('.go') and not f.endswith('_test.go')]
        if not gos: continue
        files = []
        for p in sorted(gos):
            src = open(p, encoding='utf8', errors='replace').read()
            rel = os.path.relpath(p, root)
            try:
                files.append((rel, src, parse(src)))
            except (ParseError, LexError) as e:
                errors.append((rel, e.line, e.col, 'syntax: ' + e.msg))
        for env_name, env in ENVS:
            check_package(files, env_name, env, errors)
    errors = sorted(set(errors))
    return errors

def report(errors):
    lines = ['gofront report', '']
    for f, line, col, msg in errors:
        lines.append(f'ERROR    {f}:{line}:{col} {msg}')
    lines += ['', f'totals: ERROR {len(errors)}']
    return '\n'.join(lines) + '\n', len(errors)

def selftest():
    base = tempfile.mkdtemp(prefix='gofront-')
    cases = []
    def w(rel, text):
        p = os.path.join(base, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, 'w', encoding='utf8').write(text)
    try:
        w('go.mod', 'module fixture\n\ngo 1.21\n')
        w('pkg/a.go', 'package pkg\n\nimport "strings"\n\ntype T struct{ n int }\n\nfunc (t *T) Get() int { return t.n }\n\nfunc Up(s string) string { return strings.ToUpper(s) }\n\nvar Count = 0\n')
        w('pkg/b.go', 'package pkg\n\nfunc Use() int {\n\tx := Count\n\tfor i, v := range []int{1, 2} {\n\t\tx += i + v\n\t}\n\tswitch y := any(x).(type) {\n\tcase int:\n\t\t_ = y\n\t}\n\treturn (&T{n: x}).Get()\n}\n')
        w('clean/main.go', 'package main\n\nimport "fixture/pkg"\n\nfunc main() { _ = pkg.Use() }\n')
        f = []
        for rel in ['pkg/a.go', 'pkg/b.go']:
            pass
        e = run(base)
        cases.append(('a valid package produces no errors', not e, e))
        w('bad1/x.go', 'package bad1\n\nfunc F() int {\n\treturn 1\n')
        e = run(base); cases.append(('a missing brace is a syntax error', any('syntax' in m for _, _, _, m in e), e))
        w('bad1/x.go', 'package bad1\n\nfunc F() int {\n\treturn Missing\n}\n')
        e = run(base); cases.append(('an undefined name is caught', any('undefined: Missing' in m for _, _, _, m in e), e))
        w('bad1/x.go', 'package bad1\n\nfunc F() int {\n\tunused := 3\n\treturn 1\n}\n')
        e = run(base); cases.append(('an unused local variable is caught', any('declared and not used: unused' in m for _, _, _, m in e), e))
        w('bad1/x.go', 'package bad1\n\nimport \"os\"\n\nfunc F() int { return 1 }\n')
        e = run(base); cases.append(('an unused import is caught', any('imported and not used' in m for _, _, _, m in e), e))
        w('bad1/x.go', 'package bad1\n\nfunc F() int { return 1 }\n\nfunc F() int { return 2 }\n')
        e = run(base); cases.append(('a duplicate top-level name is caught', any('redeclared' in m for _, _, _, m in e), e))
        w('bad1/x.go', 'package bad1\n\nfunc Use() int { return helper() }\n')
        w('bad1/y_unix.go', '//go:build linux\n\npackage bad1\n\nfunc helper() int { return 1 }\n')
        e = run(base); cases.append(('a call to a function defined only on linux is caught for js', any('undefined: helper' in m for _, _, _, m in e), e))
        w('bad1/y_unix.go', 'package bad1\n\nfunc helper() int { return 1 }\n')
        w('bad1/x.go', 'package bad1\n\nfunc Use() int { return helper() }\n')
        e = run(base); cases.append(('the same call is fine once every platform has helper', not e, e))
        w('bad1/x.go', 'package bad1\n\nfunc Use(a int) int {\n\tb := a\n\tb = 2\n\treturn a\n}\n')
        e = run(base); cases.append(('a variable only assigned, never read, is reported', any('declared and not used: b' in m for _, _, _, m in e), e))
    finally:
        shutil.rmtree(base, ignore_errors=True)
    ok = True
    for name, passed, e in cases:
        print(('PASS ' if passed else 'MISS ') + name)
        ok = ok and passed
    print('selftest: ' + ('all seeded defects caught' if ok else 'a case differs'))
    return 0 if ok else 1

def main():
    if '--selftest' in sys.argv:
        return selftest()
    root = os.path.abspath(os.path.join(HERE, '..'))
    errors = run(root)
    text, n = report(errors)
    text = text.replace(f'totals: ERROR {n}', f'totals: ERROR {n}\nexamined: {STATS["funcs"]} function bodies, {STATS["decls"]} local declarations, {STATS["uses"]} name uses')
    outs = [a for a in sys.argv[1:] if not a.startswith('--')]
    if outs: open(outs[0], 'w', encoding='utf8').write(text)
    print(text)
    return 1 if n else 0

if __name__ == '__main__':
    sys.exit(main())
