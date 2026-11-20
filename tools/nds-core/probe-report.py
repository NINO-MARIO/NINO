#!/usr/bin/env python3
"""Explains an NDS wasm probe run and catches regressions.

usage: probe-report.py SUMMARY BASELINE OUT [--gate]

SUMMARY  : probe-summary.txt written by the probe job ("OK   pkg" / "FAIL pkg" lines)
BASELINE : probe-baseline.txt, one package per line that is known to build for js/wasm
OUT      : the report to write

For every package it lists the blockers that the import graph predicts (logrus,
termui, sdl, mmap, hw). It flags:
  REGRESSION   a package in the baseline that now FAILs
  UNEXPLAINED  a package that FAILs but has no predicted blocker (look at probe.log)
  FIXED        a package that now builds but was not in the baseline
Exit code is 0 unless --gate is given and a REGRESSION was found (the probe is
report-only by default; the gate step in the workflow is what can turn red).
"""
import os, re, sys, glob

# How each external or internal dependency blocks a js/wasm build.
BLOCKERS = {
    'logrus': lambda imp: 'gopkg.in/Sirupsen/logrus' in imp,
    'termui': lambda imp: 'gizak/termui' in imp,
    'sdl': lambda imp: 'go-sdl2' in imp,
    'mmap': lambda imp: 'mmap-go' in imp or 'x/exp/mmap' in imp,
}
# hw is a blocker only through its SDL files, which are excluded for js;
# importing emu/hw is therefore not counted by itself.
BAD_OS = {'linux', 'darwin', 'windows', 'freebsd', 'openbsd', 'netbsd', 'android', 'ios', 'plan9', 'solaris', 'aix', 'dragonfly', 'illumos'}
BAD_ARCH = {'amd64', '386', 'arm', 'arm64', 'mips', 'mipsle', 'mips64', 'mips64le', 'ppc64', 'ppc64le', 's390x', 'riscv64', 'loong64'}

def name_ok(fname):
    parts = fname[:-3].split('_')
    if len(parts) >= 2 and (parts[-1] in BAD_ARCH or parts[-1] in BAD_OS):
        return False
    return True

def eval_tag(expr):
    tok = re.findall(r'!|&&|\|\||\(|\)|[A-Za-z0-9_.]+', expr)
    pos = [0]
    def val(n): return n in ('js', 'wasm')
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
        n = tok[pos[0]]; pos[0] += 1; return val(n)
    try:
        return p_or()
    except IndexError:
        return True

def file_ok(path):
    f = os.path.basename(path)
    if not f.endswith('.go') or f.endswith('_test.go') or not name_ok(f):
        return False
    for line in open(path, encoding='utf8', errors='replace'):
        if line.startswith('package '):
            break
        m = re.match(r'//go:build\s+(.*)', line)
        if m:
            return eval_tag(m.group(1).strip())
    return True

def graph(root):
    pkgs = {}
    for d, ds, fs in os.walk(root):
        rel = os.path.relpath(d, root)
        if d != root and os.path.exists(os.path.join(d, 'go.mod')):
            ds[:] = []          # a nested module (wasm/) is not part of this graph
            continue
        good = [os.path.join(d, f) for f in fs if f.endswith('.go') and file_ok(os.path.join(d, f))]
        if not good:
            continue
        imps = set()
        for f in good:
            src = open(f, encoding='utf8', errors='replace').read()
            for blk in re.findall(r'import\s*\((.*?)\)', src, re.S):
                imps.update(m.group(1) for m in re.finditer(r'"([^"]+)"', blk))
            imps.update(re.findall(r'^import\s+(?:\w+\s+)?"([^"]+)"', src, re.M))
        key = 'main' if rel == '.' else rel.replace(os.sep, '/')
        pkgs[key] = imps
    return pkgs

def predicted(pkgs):
    cache = {}
    def closure(p, stack=()):
        if p in cache: return cache[p]
        res = set()
        for imp in pkgs.get(p, ()):
            for name, f in BLOCKERS.items():
                if f(imp): res.add(name)
            if imp.startswith('ndsemu/'):
                q = imp[len('ndsemu/'):]
                if q in pkgs and q not in stack:
                    res |= closure(q, stack + (p,))
        cache[p] = res
        return res
    return {p: closure(p) for p in pkgs}

def selftest():
    """Each case writes a summary and baseline, runs main(), and checks the exit code."""
    import tempfile, contextlib, io
    cases = [
        ('regression fails the gate', 'FAIL ndsemu/arm/genarm\nOK   ndsemu/emu/fixed\n', 'arm/genarm\nemu/fixed\n', ['--gate'], 1),
        ('clean run passes the gate', 'OK   ndsemu/emu/fixed\n', 'emu/fixed\n', ['--gate'], 0),
        ('report-only never fails', 'FAIL ndsemu/arm/genarm\n', 'arm/genarm\n', [], 0),
        ('a new pass is reported, not failed', 'OK   ndsemu/emu/fixed\n', '', ['--gate'], 0),
    ]
    base = tempfile.mkdtemp(prefix='probe-report-')
    ok_all = True
    try:
        for name, summary, baseline, extra, want in cases:
            sp = os.path.join(base, 'summary.txt'); bp = os.path.join(base, 'baseline.txt'); op = os.path.join(base, 'out.txt')
            open(sp, 'w', encoding='utf8').write(summary)
            open(bp, 'w', encoding='utf8').write(baseline)
            with contextlib.redirect_stdout(io.StringIO()):
                got = main_with(sp, bp, op, extra)
            passed = got == want
            ok_all = ok_all and passed
            print(('PASS ' if passed else 'MISS ') + name + ' (exit %d, want %d)' % (got, want))
    finally:
        import shutil; shutil.rmtree(base, ignore_errors=True)
    print('selftest: ' + ('all cases as expected' if ok_all else 'a case differs'))
    return 0 if ok_all else 1

def main_with(summary, baseline, out, extra):
    sys.argv = ['probe-report.py', summary, baseline, out] + extra
    return main()

def main():
    if '--selftest' in sys.argv:
        return selftest()
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    gate = '--gate' in sys.argv[1:]
    if len(args) != 3:
        print(__doc__); return 2
    summary, baseline, out = args
    if not os.path.exists(summary) or os.path.getsize(summary) == 0:
        print('no probe summary to explain'); return 0
    status = {}
    for line in open(summary, encoding='utf8'):
        m = re.match(r'(OK|FAIL)\s+ndsemu(?:/(\S+))?\s*$', line.strip())
        if m:
            status[m.group(2) or 'main'] = m.group(1)
    base = set()
    if os.path.exists(baseline):
        base = {l.strip() for l in open(baseline, encoding='utf8') if l.strip() and not l.startswith('#')}
    pred = predicted(graph(os.path.dirname(os.path.abspath(__file__))))  # the nds-core source tree
    lines = ['NDS probe report', '']
    regress, unexplained, fixed = [], [], []
    for p in sorted(status):
        s = status[p]
        b = sorted(pred.get(p, set()))
        note = ''
        if s == 'FAIL' and p in base:
            regress.append(p); note = 'REGRESSION (was OK in the baseline)'
        elif s == 'FAIL' and not b:
            unexplained.append(p); note = 'UNEXPLAINED: no known blocker, read probe.log'
        elif s == 'FAIL':
            note = 'blocked by ' + ', '.join(b)
        elif s == 'OK' and p not in base:
            fixed.append(p); note = 'now builds (add to the baseline)'
        else:
            note = 'builds' if s == 'OK' else 'expected'
        lines.append(f'{s:4s} {p:24s} {note}')
    lines += ['']
    lines.append(f'regressions: {len(regress)}  unexplained: {len(unexplained)}  newly passing: {len(fixed)}')
    if regress: lines.append('REGRESSED: ' + ', '.join(regress))
    if unexplained: lines.append('UNEXPLAINED: ' + ', '.join(unexplained))
    if fixed: lines.append('NEWLY PASSING (add to probe-baseline.txt): ' + ', '.join(fixed))
    text = '\n'.join(lines) + '\n'
    open(out, 'w', encoding='utf8').write(text)
    print(text)
    if gate and regress:
        print('GATE FAILED: a package that used to build no longer does')
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
