#!/usr/bin/env python3
"""เทสต์ของโมเดลตัวอักษร (numpy): gradient check, ควอนไทซ์, การเรียนรู้จริง, ความกำหนดได้ของการสุ่ม
รัน: python3 -I research/llm/test_charlm.py
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import charlm  # noqa: E402

passed = 0


def check(name, cond, detail=''):
    global passed
    if not cond:
        print('FAIL ' + name + ' ' + detail)
        sys.exit(1)
    passed += 1
    print('ok   ' + name)


def gradient_check():
    rng = np.random.default_rng(3)
    m = charlm.CharMLP(V=11, C=3, E=4, H=5, seed=1)
    ctx = rng.integers(0, 11, size=(6, 3))
    y = rng.integers(0, 11, size=6)
    _, g = m.loss_and_grads(ctx, y)
    worst = 0.0
    eps = 1e-6
    for k, w in m.p.items():
        flat = w.reshape(-1)
        for i in rng.choice(flat.size, size=min(12, flat.size), replace=False):
            old = flat[i]
            flat[i] = old + eps
            lp, _ = m.loss_and_grads(ctx, y)
            flat[i] = old - eps
            lm, _ = m.loss_and_grads(ctx, y)
            flat[i] = old
            num = (lp - lm) / (2 * eps)
            ana = g[k].reshape(-1)[i]
            denom = max(1e-8, abs(num) + abs(ana))
            worst = max(worst, abs(num - ana) / denom)
    return worst


worst = gradient_check()
check('gradient check matches finite differences', worst < 1e-5, 'worst rel err %.2e' % worst)

m0 = charlm.CharMLP(V=50, C=8, E=16, H=32, seed=0)
rng = np.random.default_rng(0)
ctx0 = rng.integers(0, 50, size=(400, 8))
y0 = rng.integers(0, 50, size=400)
l0 = m0.mean_loss(ctx0, y0)
check('initial loss is close to log(V)', abs(l0 - math.log(50)) < 0.3, 'loss %.3f log(V) %.3f' % (l0, math.log(50)))

seq = np.array([1, 2, 3, 4] * 300, dtype=np.int64)
ctx, y = charlm.windows(seq, 3)
m = charlm.CharMLP(V=6, C=3, E=8, H=16, seed=2)
opt = charlm.Adam(m.p, lr=1e-2)
for _ in range(300):
    _, g = m.loss_and_grads(ctx, y)
    opt.step(m.p, g)
final = m.mean_loss(ctx, y)
check('model learns a repeating pattern (loss < 0.1 nats)', final < 0.1, 'final %.4f' % final)

q, s = charlm.quantize(m.p)
deq = charlm.dequantize(q, s)
ok = True
worst_q = 0.0
for k in m.p:
    err = np.abs(deq[k] - m.p[k])
    scale = s[k] if m.p[k].ndim == 1 else s[k][None, :]
    ratio = (err / (scale / 2 + 1e-12)).max()
    worst_q = max(worst_q, float(ratio))
    ok = ok and ratio <= 1.0 + 1e-9
check('int8 round trip error stays within half a step', ok, 'worst ratio %.4f' % worst_q)
check('int8 values stay in [-127, 127]', all(np.abs(v.astype(np.int16)).max() <= 127 for v in q.values()))

vocab = charlm.Vocab('ก ข ค ง ก ข ค ง ก ข ค ง' * 5)
a = charlm.sample(m, vocab, 'ก', n=20, temp=0.8, seed=7)
b = charlm.sample(m, vocab, 'ก', n=20, temp=0.8, seed=7)
check('sampling is deterministic for a fixed seed', a == b)

print('\nผ่าน %d ข้อ' % passed)
