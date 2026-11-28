#!/usr/bin/env python3
"""NDS detective: finds the compile and wiring defects that the wasm probe would
report, without a Go toolchain, so they can be checked here and in CI at once.

It checks four things and prints a report with one severity per finding:

  ERROR    would not compile, or the room would call something the core does not have
  GAP      a real missing feature (reported truthfully, e.g. the core lacks saveData)
  SUSPECT  worth a look, not proven (may be a false positive)
  INFO     facts for the record

Checks
  1. Go: duplicate top-level names per package (tag-aware, per GOOS=js and GOOS=linux)
     1b. Go: calls to a function that is not defined for that GOOS (the IsTerminal case). Reads both
         //go:build and the old // +build lines.
  2. Go: unused imports
  3. Go: cross-package access to unexported names, and undeclared package members
  4. Build tags: files that define the same name must not both be included together
  5. Wiring: the core functions the room calls vs the contract vs the wasm exports

Usage
  python3 detective.py                 # check the repo (tools/nds-core and games/nds)
  python3 detective.py --selftest      # prove the detective catches seeded defects
Exit code: 1 if any ERROR (or a selftest case is missed), else 0.
"""
import os, re, sys, glob, tempfile, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
BAD_OS = {'linux', 'darwin', 'windows', 'freebsd', 'openbsd', 'netbsd', 'android', 'ios', 'plan9', 'solaris', 'aix', 'dragonfly', 'illumos'}
BAD_ARCH = {'amd64', '386', 'arm', 'arm64', 'mips', 'mipsle', 'mips64', 'mips64le', 'ppc64', 'ppc64le', 's390x', 'riscv64', 'loong64'}
ENV_JS = {'js', 'wasm'}
ENV_LINUX = {'linux', 'amd64', 'unix', 'gc'}
GO_KW = set('break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var'.split())
GO_TYPES = set('bool byte complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr any comparable'.split())
GO_BUILTINS = set('append cap clear close complex copy delete imag len make max min new panic print println real recover'.split())

def eval_tag(expr, env):
    tok = re.findall(r'!|&&|\|\||\(|\)|[A-Za-z0-9_.]+', expr)
    pos = [0]
    def p_or():
        v = p_and()
        while pos[0] < len(tok) and tok[pos[0]] == '||':
            pos[0] += 1; r = p_and(); v = v or r
        return v
    def p_and():
        v = p_not()
        while pos[0] < len(tok) and tok[pos[0]] == '&&':
            pos[0] += 1; r = p_not(); v = v and r
        return v
    def p_not():
        if tok[pos[0]] == '!':
            pos[0] += 1; return not p_not()
        if tok[pos[0]] == '(':
            pos[0] += 1; v = p_or(); pos[0] += 1; return v
        n = tok[pos[0]]; pos[0] += 1; return n in env
    try:
        return p_or()
    except IndexError:
        return True

def name_included(fname, env):
    parts = fname[:-3].split('_')
    if len(parts) >= 2 and parts[-1] in BAD_ARCH and parts[-1] not in env: return False
    if len(parts) >= 2 and parts[-1] in BAD_OS and parts[-1] not in env: return False
    if len(parts) >= 2 and parts[-1] in ENV_JS and 'js' not in env: return False
    # 'unix' is a build tag, not a file-name suffix: Go only treats GOOS and GOARCH names in file names
    return True

def tag_of(src):
    old = []
    for line in src.split('\n'):
        if line.startswith('package '): break
        m = re.match(r'//go:build\s+(.*)', line)
        if m: return m.group(1).strip()
        m = re.match(r'//\s*\+build\s+(.*)', line)
        if m: old.append(m.group(1).strip())
    if old:
        # old syntax: space means OR, comma means AND, a leading ! negates
        return ' || '.join('(' + ' && '.join(('!' + t[1:]) if t.startswith('!') else t for t in alt.split(',')) + ')' for line in old for alt in line.split())
    return ''

def code_only(src):
    """Go source with comments removed and string/rune/raw-string contents blanked, read in order."""
    out = []; i = 0; n = len(src)
    while i < n:
        c = src[i]
        if src.startswith('//', i):
            j = src.find('\n', i); i = n if j < 0 else j
        elif src.startswith('/*', i):
            j = src.find('*/', i + 2); i = n if j < 0 else j + 2
            out.append(' ')
        elif c == '`':
            j = src.find('`', i + 1); j = n - 1 if j < 0 else j
            out.append('``'); i = j + 1
        elif c in '"\'':
            j = i + 1
            while j < n and src[j] != c and src[j] != '\n':
                j += 2 if src[j] == '\\' else 1
            out.append(c + c); i = j + 1
        else:
            out.append(c); i += 1
    return ''.join(out)

def top_names(code):
    names = set()
    for m in re.finditer(r'^func\s+([A-Za-z_]\w*)', code, re.M): names.add(m.group(1))
    for m in re.finditer(r'^(?:var|const|type)\s+([A-Za-z_]\w*)', code, re.M): names.add(m.group(1))
    for blk in re.finditer(r'^(?:var|const|type)\s*\((.*?)^\)', code, re.M | re.S):
        for m in re.finditer(r'^\s*([A-Za-z_]\w*)', blk.group(1), re.M):
            if m.group(1) not in ('func', 'var', 'const', 'type'): names.add(m.group(1))
    return names

def split_top_level(code):
    """Split Go code into top-level chunks, one per declaration that starts at column 0."""
    starts = [m.start() for m in re.finditer(r'^(?:func|type|var|const)\b', code, re.M)]
    if not starts: return [code]
    bounds = starts + [len(code)]
    head = code[:starts[0]]
    return [head] + [code[bounds[i]:bounds[i + 1]] for i in range(len(starts))]

def package_name(path):
    last = path.split('/')[-1]
    last = re.sub(r'\.v\d+$', '', last)     # gopkg.in/x/logrus.v0 -> logrus
    last = re.sub(r'-go$', '', last)           # github.com/edsrzf/mmap-go -> mmap
    return last

def imports_of(src):
    out = []
    for blk in re.finditer(r'^import\s*\((.*?)^\)', src, re.M | re.S):
        for line in blk.group(1).split('\n'):
            m = re.match(r'\s*(?:([\w.]+)\s+)?"([^"]+)"', line)
            if m: out.append((m.group(1), m.group(2)))
    for m in re.finditer(r'^import\s+(?:([\w.]+)\s+)?"([^"]+)"', src, re.M):
        out.append((m.group(1), m.group(2)))
    return out

def go_packages(root):
    """dir -> list of (filepath, src). Nested modules (with go.mod) are separate and skipped."""
    pk = {}
    for d, ds, fs in os.walk(root):
        if d != root and os.path.exists(os.path.join(d, 'go.mod')):
            ds[:] = []; continue
        if '/.git' in d or '__pycache__' in d: continue
        gos = [os.path.join(d, f) for f in fs if f.endswith('.go') and not f.endswith('_test.go')]
        if gos: pk[d] = [(f, open(f, encoding='utf8', errors='replace').read()) for f in gos]
    return pk

STATS = {'files': 0, 'cross_uses': 0, 'packages': 0}

def check_go(root, findings):
    pk = go_packages(root)
    STATS['packages'] = len(pk)
    rel = lambda d: os.path.relpath(d, root).replace(os.sep, '/')
    module = 'ndsemu'
    gm = os.path.join(root, 'go.mod')
    if os.path.exists(gm):
        mm = re.search(r'^module\s+(\S+)', open(gm, encoding='utf8').read(), re.M)
        if mm: module = mm.group(1)
    dir_of_import = {}
    for d in pk:
        dir_of_import[module + '/' + rel(d) if rel(d) != '.' else module] = d
    declared = {d: set() for d in pk}
    per_file = {}
    for d, files in pk.items():
        for f, src in files:
            code = code_only(src)
            names = top_names(code)
            declared[d] |= names
            per_file[f] = (d, code, src, names)
    # 1) duplicates, tag-aware for each environment
    for env_name, env in (('js', ENV_JS), ('linux', ENV_LINUX)):
        for d, files in pk.items():
            seen = {}
            for f, src in files:
                if not name_included(os.path.basename(f), env) or not eval_tag(tag_of(src), env): continue
                for n in per_file[f][3]:
                    seen.setdefault(n, []).append(os.path.basename(f))
            for n, fl in seen.items():
                if len(fl) > 1:
                    findings.append(('ERROR', f'duplicate {n!r} in {rel(d)} for GOOS={env_name}: {", ".join(fl)}'))
    # 1b) calls to a function that is not defined for this platform (the IsTerminal case: defined on unix and windows only)
    for d, files in pk.items():
        for env_name, env in (('js', ENV_JS), ('linux', ENV_LINUX)):
            inc = [f for f, src in files if name_included(os.path.basename(f), env) and eval_tag(tag_of(src), env)]
            defined = set()
            for f in inc: defined |= per_file[f][3]
            for f in inc:
                code = per_file[f][1]
                # interface and struct bodies declare names; they are not calls
                code = re.sub(r'type\s+\w+\s+(?:interface|struct)\s*\{.*?\n\}', ' ', code, flags=re.S)
                # every name on the left of := (a, b := ..., _, lf := range ...)
                local = set()
                for m in re.finditer(r'((?:[A-Za-z_]\w*\s*,\s*)*[A-Za-z_]\w*)\s*:=', code):
                    local |= {x.strip() for x in m.group(1).split(',')}
                local |= set(re.findall(r'\bvar\s+([A-Za-z_]\w*)', code))
                # parameters and results, including function-typed ones: (do func(g *G)), (cb func()), (x int)
                local |= set(re.findall(r'[(,]\s*([A-Za-z_]\w*)\s+(?:func\b|\*|\[|map\b|chan\b|[A-Za-z_])', code))
                for m in re.finditer(r'(?<![\w.])([A-Za-z_]\w*)\s*\(', code):
                    n = m.group(1)
                    pre = code[:m.start()].rstrip()
                    if pre.endswith('func') or re.search(r'func\s*\([^)]*\)\s*$', pre): continue   # declarations
                    if pre.endswith('.'): continue   # method call, also when the chain goes on a new line
                    if n in GO_KW or n in GO_BUILTINS or n in GO_TYPES or n in defined or n in local: continue
                    findings.append(('ERROR', f'{n}() is called in {os.path.relpath(f, root)} but is not defined for GOOS={env_name}'))
    # 2) unused imports
    for f, (d, code, src, names) in per_file.items():
        if not (name_included(os.path.basename(f), ENV_JS) or name_included(os.path.basename(f), ENV_LINUX)):
            continue
        for alias, path in imports_of(src):
            if alias in ('_', '.') or path == 'C': continue
            name = alias or package_name(path)
            if not re.search(r'(?<![\w.])' + re.escape(name) + r'\.', code):
                findings.append(('ERROR', f'unused import {path!r} in {os.path.relpath(f, root)}'))
    # 3) cross-package member access, scoped per function: a receiver or parameter named like
    #    an import only shadows it inside that function, so each function is judged on its own
    for f, (d, code, src, names) in per_file.items():
        STATS['files'] += 1
        amap = {}
        for alias, path in imports_of(src):
            if path in dir_of_import: amap[alias or package_name(path)] = dir_of_import[path]
        if not amap: continue
        for chunk in split_top_level(code):
            sig = chunk.split('{', 1)[0] if chunk.startswith('func') else ''
            for alias in list(amap):
                shadowed = bool(sig and re.search(r'[(,]\s*' + re.escape(alias) + r'\s+\*?[\w.\[\]]+\s*[,)]', sig)) or \
                    bool(re.search(r'(?<![\w.])' + re.escape(alias) + r'\s*:=', chunk)) or \
                    bool(re.search(r'\bvar\s+' + re.escape(alias) + r'\b', chunk))
                if shadowed: continue
                for m in re.finditer(r'(?<![\w.])' + re.escape(alias) + r'\.([A-Za-z_]\w*)', chunk):
                    member = m.group(1)
                    STATS['cross_uses'] += 1
                    if member in declared[amap[alias]]:
                        if member[0].islower():
                            findings.append(('ERROR', f'{os.path.relpath(f, root)} uses unexported {alias}.{member}'))
                    else:
                        findings.append(('ERROR', f'{os.path.relpath(f, root)} uses {alias}.{member} which is not declared in that package'))
    # 4) same name defined in two files that are both included on the same platform (covered by 1)
    return pk

def check_wiring(repo, findings):
    contract = open(os.path.join(repo, 'games/nds/core-contract.js'), encoding='utf8').read()
    def arr(key):
        m = re.search(key + r':\s*\[(.*?)\]', contract, re.S)
        return re.findall(r"'(\w+)'", m.group(1)) if m else []
    required, optional = arr('REQUIRED'), arr('OPTIONAL')
    js_files = [os.path.join(repo, 'games/nds', f) for f in ('app.js', 'player.js')]
    used = set()
    for f in js_files:
        for m in re.finditer(r'\bcore\.(\w+)\s*(?:\(|!==|===|\b)', open(f, encoding='utf8').read()):
            used.add(m.group(1))
        for m in re.finditer(r'\bS\.core\.(\w+)', open(f, encoding='utf8').read()):
            used.add(m.group(1))
    used -= {'length'}
    wasm_src = open(os.path.join(repo, 'tools/nds-core/wasm/main.go'), encoding='utf8').read()
    # แกนจริงอยู่ที่ webcore/ แกนทดสอบ phase0a อยู่ที่ wasm/ ต้องนับทั้งสองไฟล์
    wasm_src += open(os.path.join(repo, 'tools/nds-core/webcore/main.go'), encoding='utf8').read()
    exported = set(re.findall(r'core\.Set\("(\w+)"', wasm_src))
    for n in used:
        if n not in set(required) | set(optional) | {'wasm'}:
            findings.append(('ERROR', f'the room calls core.{n} which is not in the contract'))
    for n in required:
        if n not in exported:
            findings.append(('ERROR', f'REQUIRED {n} is not exported by wasm/main.go'))
    for n in optional:
        if n not in exported:
            findings.append(('GAP', f'core does not export optional {n}: the player reports it as missing (truthful)'))
    findings.append(('INFO', f'wasm exports: {", ".join(sorted(exported))}'))

def check_tests(repo, findings):
    tests = sorted(os.path.basename(p) for p in glob.glob(os.path.join(repo, 'tools/test/nds-*.test.js')))
    wf = open(os.path.join(repo, '.github/workflows/nds-room-tests.yml'), encoding='utf8').read()
    va = open(os.path.join(repo, 'tools/verify-all.sh'), encoding='utf8').read()
    for t in tests:
        short = t[len('nds-'):-len('.test.js')]
        if short not in wf and f'nds-{short}.test.js' not in wf:
            findings.append(('SUSPECT', f'{t} is not in .github/workflows/nds-room-tests.yml'))
        if t not in va:
            findings.append(('SUSPECT', f'{t} is not in tools/verify-all.sh'))
    findings.append(('INFO', f'room test files: {len(tests)}'))

def report(findings):
    order = {'ERROR': 0, 'GAP': 1, 'SUSPECT': 2, 'INFO': 3}
    findings = sorted(findings, key=lambda x: order[x[0]])
    lines = ['NDS detective report', '']
    for sev, msg in findings:
        lines.append(f'{sev:8s} {msg}')
    counts = {k: sum(1 for s, _ in findings if s == k) for k in order}
    lines += ['', 'totals: ' + ', '.join(f'{k} {v}' for k, v in counts.items())]
    return '\n'.join(lines) + '\n', counts['ERROR']

def run(repo):
    findings = []
    check_go(os.path.join(repo, 'tools', 'nds-core'), findings)
    check_wiring(repo, findings)
    check_tests(repo, findings)
    findings.append(('INFO', f"examined {STATS['packages']} Go packages, {STATS['files']} files, {STATS['cross_uses']} cross-package references"))
    return findings

# ---------- self test: seed one defect per check and prove each one is caught ----------
def selftest():
    cases = []
    base = tempfile.mkdtemp(prefix='detective-')
    try:
        def w(path, text):
            p = os.path.join(base, path); os.makedirs(os.path.dirname(p), exist_ok=True)
            open(p, 'w', encoding='utf8').write(text)
        # a clean package
        w('core/go.mod', 'module fixture\n\ngo 1.21\n')
        w('core/pkg/a.go', 'package pkg\n\nfunc Ok() int { return 1 }\nvar Good = 2\n')
        w('core/pkg/b_js.go', '//go:build js\n\npackage pkg\n\nfunc Only() {}\n')
        w('core/pkg/b_linux.go', '//go:build linux\n\npackage pkg\n\nfunc Only() {}\n')
        w('core/pkg/c.go', 'package pkg\n\nfunc Inner() {}\n')
        w('core/main.go', 'package main\n\nimport (\n\t"fixture/pkg"\n)\n\nfunc main() { _ = pkg.Ok() }\n')
        f = []; check_go(os.path.join(base, 'core'), f)
        cases.append(('clean package has no errors', not any(s == 'ERROR' for s, _ in f), f))
        STATS['cross_uses'] = 0; f2 = []; check_go(os.path.join(base, 'core'), f2)
        cases.append(('the cross-package check actually sees references', STATS['cross_uses'] > 0, f2))
        # seeded defects
        w('core/pkg/dup.go', 'package pkg\n\nfunc Ok() int { return 3 }\n')
        f = []; check_go(os.path.join(base, 'core'), f)
        cases.append(('duplicate name is caught', any('duplicate' in m and 'Ok' in m for s, m in f), f))
        w('core/pkg/dup.go', 'package pkg\n')
        w('core/main.go', 'package main\n\nimport (\n\t"fixture/pkg"\n\t"os"\n)\n\nfunc main() { _ = pkg.Ok() }\n')
        f = []; check_go(os.path.join(base, 'core'), f)
        cases.append(('unused import is caught', any('unused import' in m for s, m in f), f))
        w('core/pkg/d.go', 'package pkg\n\nfunc inner() {}\n')
        w('core/main.go', 'package main\n\nimport (\n\t"fixture/pkg"\n)\n\nfunc main() { _ = pkg.inner() }\n')
        f = []; check_go(os.path.join(base, 'core'), f)
        cases.append(('unexported cross-package use is caught', any('unexported' in m for s, m in f), f))
        w('core/main.go', 'package main\n\nimport (\n\t"fixture/pkg"\n)\n\nfunc main() { _ = pkg.Missing() }\n')
        f = []; check_go(os.path.join(base, 'core'), f)
        cases.append(('undeclared package member is caught', any('not declared' in m for s, m in f), f))
        w('core/pkg/b_js.go', '//go:build js\n\npackage pkg\n\nfunc Only() {}\n')
        w('core/pkg/other.go', 'package pkg\n\nfunc Only() {}\n')
        w('core/pkg/unixonly.go', '// +build linux darwin\n\npackage pkg\n\nfunc UnixOnly() bool { return true }\n')
        w('core/pkg/useit.go', 'package pkg\n\nfunc UseIt() bool { return UnixOnly() }\n')
        w('core/main.go', 'package main\n\nimport (\n\t"fixture/pkg"\n)\n\nfunc main() { _ = pkg.Ok() }\n')
        f = []; check_go(os.path.join(base, 'core'), f)
        f = []; check_go(os.path.join(base, 'core'), f)
        cases.append(('call to a function defined only on unix is caught for js', any('UnixOnly' in m and 'GOOS=js' in m for s, m in f), f))
        cases.append(('tag conflict on js is caught', any('duplicate' in m and 'Only' in m and 'GOOS=js' in m for s, m in f), f))
    finally:
        shutil.rmtree(base, ignore_errors=True)
    ok_all = True
    for name, passed, f in cases:
        print(('PASS ' if passed else 'MISS ') + name)
        ok_all = ok_all and passed
    print('selftest: %s' % ('all seeded defects caught' if ok_all else 'a check missed a defect'))
    return 0 if ok_all else 1

def main():
    if '--selftest' in sys.argv:
        return selftest()
    findings = run(REPO)
    text, errors = report(findings)
    out = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else None
    if out: open(out, 'w', encoding='utf8').write(text)
    print(text)
    return 1 if errors else 0

if __name__ == '__main__':
    sys.exit(main())
