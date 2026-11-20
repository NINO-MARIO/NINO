#!/usr/bin/env python3
"""NINO research | โมเดลภาษาระดับตัวอักษรที่เราเขียนเอง (numpy ล้วน ไม่มี torch)

สถาปัตยกรรม: Bengio-style MLP
  ตัวอักษร C ตัวก่อนหน้า -> embedding (E) -> ต่อกัน -> tanh (H) -> softmax (V)
- backprop เขียนเองและตรวจด้วย gradient check (test_charlm.py)
- ตัวปรับค่า Adam
- ควอนไทซ์แบบ int8 รายคอลัมน์ (เก็บค่าสเกลแยก) เพื่อวัดว่าความแม่นยำหายเท่าไร
- ข้อมูล: ข้อความไทยจากเอกสารในรีโป (ค่อนข้างเล็กและเป็นเรื่องพัฒนาแอป ไม่ใช่บทสนทนา)

คำสั่ง:
  python3 -I research/llm/charlm.py experiment    # เทรน วัด และเปรียบเทียบกับ baseline
"""
import argparse
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(HERE, 'out')
CORPUS_FILES = ['mim/MANUAL_TH.md', 'HANDOFF.md', 'CHANGES.md', 'DECISIONS.md', 'mim/data/pack-th.js']
THAI = set(chr(c) for c in range(0x0E00, 0x0E80))
LN2 = math.log(2.0)


def load_corpus():
    """ข้อความไทย: เก็บเฉพาะบรรทัดที่มีอักษรไทย และตัดช่องว่างซ้ำ"""
    lines = []
    for f in CORPUS_FILES:
        with open(os.path.join(ROOT, f), encoding='utf-8') as fh:
            for line in fh:
                line = ' '.join(line.split())
                if any(ch in THAI for ch in line):
                    lines.append(line)
    return '\n'.join(lines) + '\n'


class Vocab:
    def __init__(self, text, min_count=2):
        counts = {}
        for ch in text:
            counts[ch] = counts.get(ch, 0) + 1
        keep = sorted(ch for ch, n in counts.items() if n >= min_count)
        self.itos = ['<pad>', '<unk>'] + keep
        self.stoi = {ch: i for i, ch in enumerate(self.itos)}

    def __len__(self):
        return len(self.itos)

    def encode(self, text):
        unk = self.stoi['<unk>']
        return np.array([self.stoi.get(ch, unk) for ch in text], dtype=np.int64)

    def decode(self, ids):
        return ''.join(self.itos[int(i)] for i in ids)


def windows(ids, C):
    """คู่ (บริบท C ตัว, ตัวถัดไป) ทั้งหมด โดยเติม <pad> ด้านหน้า"""
    padded = np.concatenate([np.zeros(C, dtype=np.int64), ids])
    idx = np.arange(C)[None, :] + np.arange(len(ids))[:, None]
    return padded[idx], ids


class CharMLP:
    def __init__(self, V, C=8, E=16, H=128, seed=0):
        rng = np.random.default_rng(seed)
        self.V, self.C, self.E, self.H = V, C, E, H
        self.p = {
            'emb': rng.normal(0.0, 0.1, (V, E)),
            'W1': rng.normal(0.0, 1.0 / math.sqrt(C * E), (C * E, H)),
            'b1': np.zeros(H),
            'W2': rng.normal(0.0, 1.0 / math.sqrt(H), (H, V)),
            'b2': np.zeros(V),
        }

    def forward(self, ctx):
        x = self.p['emb'][ctx].reshape(ctx.shape[0], -1)
        h = np.tanh(x @ self.p['W1'] + self.p['b1'])
        logits = h @ self.p['W2'] + self.p['b2']
        return x, h, logits

    def loss_and_grads(self, ctx, y):
        """ค่าเฉลี่ย cross-entropy (nats) และอนุพันธ์ของทุกพารามิเตอร์"""
        B = ctx.shape[0]
        x, h, logits = self.forward(ctx)
        logits = logits - logits.max(axis=1, keepdims=True)
        logp = logits - np.log(np.exp(logits).sum(axis=1, keepdims=True))
        loss = -logp[np.arange(B), y].mean()
        dl = np.exp(logp)
        dl[np.arange(B), y] -= 1.0
        dl /= B
        g = {}
        g['W2'] = h.T @ dl
        g['b2'] = dl.sum(axis=0)
        da = (dl @ self.p['W2'].T) * (1.0 - h * h)
        g['W1'] = x.T @ da
        g['b1'] = da.sum(axis=0)
        dx = (da @ self.p['W1'].T).reshape(B, self.C, self.E)
        ge = np.zeros_like(self.p['emb'])
        np.add.at(ge, ctx, dx)
        g['emb'] = ge
        return loss, g

    def mean_loss(self, ctx, y, batch=4096):
        total = 0.0
        for s in range(0, len(y), batch):
            _, _, logits = self.forward(ctx[s:s + batch])
            logits = logits - logits.max(axis=1, keepdims=True)
            logp = logits - np.log(np.exp(logits).sum(axis=1, keepdims=True))
            total += -logp[np.arange(len(logp)), y[s:s + batch]].sum()
        return total / len(y)

    def next_probs(self, context_ids):
        ctx = np.array([context_ids[-self.C:]], dtype=np.int64)
        if ctx.shape[1] < self.C:
            ctx = np.pad(ctx, ((0, 0), (self.C - ctx.shape[1], 0)))
        _, _, logits = self.forward(ctx)
        z = logits[0] - logits[0].max()
        p = np.exp(z)
        return p / p.sum()


class Adam:
    def __init__(self, params, lr=3e-3, b1=0.9, b2=0.999, eps=1e-8):
        self.lr, self.b1, self.b2, self.eps = lr, b1, b2, eps
        self.t = 0
        self.m = {k: np.zeros_like(v) for k, v in params.items()}
        self.v = {k: np.zeros_like(v) for k, v in params.items()}

    def step(self, params, grads):
        self.t += 1
        for k in params:
            self.m[k] = self.b1 * self.m[k] + (1 - self.b1) * grads[k]
            self.v[k] = self.b2 * self.v[k] + (1 - self.b2) * grads[k] ** 2
            mh = self.m[k] / (1 - self.b1 ** self.t)
            vh = self.v[k] / (1 - self.b2 ** self.t)
            params[k] -= self.lr * mh / (np.sqrt(vh) + self.eps)


def train(model, tr, va, epochs=8, batch=512, lr=3e-3, seed=0, log=print):
    rng = np.random.default_rng(seed + 1)
    opt = Adam(model.p, lr=lr)
    best = (float('inf'), None)
    ctx_tr, y_tr = tr
    for ep in range(epochs):
        order = rng.permutation(len(y_tr))
        run = 0.0
        n = 0
        for s in range(0, len(order), batch):
            idx = order[s:s + batch]
            loss, g = model.loss_and_grads(ctx_tr[idx], y_tr[idx])
            opt.step(model.p, g)
            run += loss * len(idx)
            n += len(idx)
        vl = model.mean_loss(*va)
        log('epoch %d train %.4f nats val %.4f nats (%.3f bits/char)' % (ep + 1, run / n, vl, vl / LN2))
        if vl < best[0]:
            best = (vl, {k: v.copy() for k, v in model.p.items()})
    model.p = best[1]
    return best[0]


def quantize(params):
    """int8 แบบสมมาตรรายคอลัมน์ (เมทริกซ์) หรือรายค่า (เวกเตอร์ bias) เก็บค่าสเกลแยก"""
    q, scales = {}, {}
    for k, w in params.items():
        w2 = w if w.ndim == 2 else w.reshape(1, -1)
        s = np.abs(w2).max(axis=0)
        s = np.where(s == 0, 1.0, s) / 127.0
        qi = np.clip(np.round(w2 / s), -127, 127).astype(np.int8)
        q[k] = qi if w.ndim == 2 else qi.reshape(-1)
        scales[k] = s if w.ndim == 2 else s.reshape(-1)
    return q, scales


def dequantize(q, scales):
    out = {}
    for k in q:
        if q[k].ndim == 2:
            out[k] = q[k].astype(np.float64) * scales[k][None, :]
        else:
            out[k] = q[k].astype(np.float64) * scales[k]
    return out


def unigram_bits(train_ids, val_ids, V):
    counts = np.bincount(train_ids, minlength=V).astype(np.float64) + 1.0
    p = counts / counts.sum()
    return -np.log(p[val_ids]).mean() / LN2


def bigram_bits(train_ids, val_ids, V, k=0.5):
    counts = np.zeros((V, V))
    np.add.at(counts, (train_ids[:-1], train_ids[1:]), 1.0)
    probs = (counts + k) / (counts.sum(axis=1, keepdims=True) + k * V)
    return -np.log(probs[val_ids[:-1], val_ids[1:]]).mean() / LN2


def sample(model, vocab, prompt, n=160, temp=0.8, seed=0):
    rng = np.random.default_rng(seed)
    ids = list(vocab.encode(prompt))
    for _ in range(n):
        p = model.next_probs(ids)
        if temp != 1.0:
            p = p ** (1.0 / temp)
            p = p / p.sum()
        p[0] = 0.0
        p[1] = 0.0
        p = p / p.sum()
        ids.append(int(rng.choice(len(p), p=p)))
    return vocab.decode(ids)


def experiment(args):
    os.makedirs(OUT, exist_ok=True)
    logs = []

    def log(msg):
        print(msg)
        logs.append(msg)

    text = load_corpus()
    vocab = Vocab(text)
    ids = vocab.encode(text)
    cut = int(len(ids) * 0.9)
    tr_ids, va_ids = ids[:cut], ids[cut:]
    log('corpus chars %d, vocab %d, train %d, val %d' % (len(ids), len(vocab), len(tr_ids), len(va_ids)))
    C = args.context
    tr = windows(tr_ids, C)
    va = windows(va_ids, C)

    uni = unigram_bits(tr_ids, va_ids, len(vocab))
    big = bigram_bits(tr_ids, va_ids, len(vocab))
    log('baseline unigram %.3f bits/char, bigram(add-0.5) %.3f bits/char, uniform %.3f' %
        (uni, big, math.log(len(vocab)) / LN2))

    model = CharMLP(len(vocab), C=C, E=args.emb, H=args.hidden, seed=args.seed)
    log('params %d' % sum(v.size for v in model.p.values()))
    best = train(model, tr, va, epochs=args.epochs, batch=args.batch, lr=args.lr, seed=args.seed, log=log)
    float_bits = best / LN2
    q, scales = quantize(model.p)
    deq = CharMLP(len(vocab), C=C, E=args.emb, H=args.hidden, seed=0)
    deq.p = dequantize(q, scales)
    int8_bits = deq.mean_loss(*va) / LN2
    log('float model val %.3f bits/char; int8 model val %.3f bits/char (delta %+.4f)' %
        (float_bits, int8_bits, int8_bits - float_bits))
    log('sample (float, temp 0.8): ' + sample(model, vocab, 'มิ้ม', temp=0.8, seed=1).replace('\n', ' / '))

    np.savez(os.path.join(OUT, 'charlm_float.npz'), **model.p)
    np.savez(os.path.join(OUT, 'charlm_int8.npz'), **{k + '_q': v for k, v in q.items()},
             **{k + '_scale': v for k, v in scales.items()})
    with open(os.path.join(OUT, 'vocab.json'), 'w', encoding='utf-8') as fh:
        json.dump({'itos': vocab.itos, 'C': C, 'E': args.emb, 'H': args.hidden}, fh, ensure_ascii=False)
    with open(os.path.join(OUT, 'experiment.txt'), 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(logs) + '\n')
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    ex = sub.add_parser('experiment')
    ex.add_argument('--context', type=int, default=8)
    ex.add_argument('--emb', type=int, default=16)
    ex.add_argument('--hidden', type=int, default=128)
    ex.add_argument('--epochs', type=int, default=8)
    ex.add_argument('--batch', type=int, default=512)
    ex.add_argument('--lr', type=float, default=3e-3)
    ex.add_argument('--seed', type=int, default=0)
    ex.set_defaults(fn=experiment)
    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == '__main__':
    sys.exit(main())
