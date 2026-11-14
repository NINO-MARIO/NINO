import hashlib, json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKS = os.path.join(ROOT, "packs")
ASSETS = os.path.join(ROOT, "assets")
MIME = {".mp4": "video/mp4", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".webm": "video/webm", ".ogg": "audio/ogg", ".mp3": "audio/mpeg"}
def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()
out = {"schema": 1, "packs": []}
roots = [(PACKS, False), (ASSETS, True)]
for root, bundled_root in roots:
  for pid in sorted(os.listdir(root)) if os.path.isdir(root) else []:
    d = os.path.join(root, pid)
    if not os.path.isdir(d) or (bundled_root and not os.path.exists(os.path.join(d, "_pack.json"))):
        continue
    meta = {}
    mp = os.path.join(d, "_pack.json")
    if os.path.exists(mp):
        meta = json.load(open(mp, encoding="utf-8"))
    files = []
    for name in sorted(os.listdir(d)):
        p = os.path.join(d, name)
        if name.startswith("_") or not os.path.isfile(p):
            continue
        files.append({"path": name, "size": os.path.getsize(p), "sha256": sha(p), "mime": MIME.get(os.path.splitext(name)[1].lower(), "application/octet-stream")})
    ver = hashlib.sha256("".join(f["sha256"] for f in files).encode()).hexdigest()[:10]
    out["packs"].append({"id": pid, "title": meta.get("title", pid), "desc": meta.get("desc", ""), "lobby": bool(meta.get("lobby", False)), "scene": meta.get("scene", pid), "bundled": bundled_root, "version": ver, "size": sum(f["size"] for f in files), "files": files})
def dump(packs):
    return json.dumps({"schema": 1, "packs": packs}, indent=1, ensure_ascii=False) + "\n"
remote = [x for x in out["packs"] if not x["bundled"]]
built = [x for x in out["packs"] if x["bundled"]]
targets = [(os.path.join(PACKS, "manifest.json"), dump(remote)), (os.path.join(ASSETS, "scenes.json"), dump(built))]
if "--check" in sys.argv:
    bad = 0
    for path, text in targets:
        cur = open(path, encoding="utf-8").read() if os.path.exists(path) else ""
        bad += cur != text
    sys.exit(1 if bad else 0)
for path, text in targets:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w", encoding="utf-8").write(text)
print("remote:", [x["id"] for x in remote], "built-in:", [x["id"] for x in built])
