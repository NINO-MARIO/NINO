package app.nino.core;

import java.io.File;
import java.io.IOException;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;

/**
 * Over-the-air updates of the web layer (and the APK) from GitHub releases.
 *
 * A bundle release "web-&lt;sha7&gt;" holds web-bundle.zip, bundle.json (metadata + zip hash) and bundle.json.sig
 * (RSA signature by the APK signing key). The app verifies signature -> size -> sha256 -> safe unzip -> index.html.
 */
public final class OtaCore {

    public static final Charset UTF8 = Charset.forName("UTF-8");
    private static final Pattern REPO = Pattern.compile("^[A-Za-z0-9._-]{1,100}/[A-Za-z0-9._-]{1,100}$");
    private static final Pattern TAG = Pattern.compile("^web-[A-Za-z0-9][A-Za-z0-9._-]{0,60}$");
    private static final Pattern ZIPNAME = Pattern.compile("^[A-Za-z0-9._-]{1,80}\\.zip$");
    private static final Pattern SHA = Pattern.compile("^[0-9a-fA-F]{64}$");
    public static final long MAX_ZIP = 80L << 20;
    public static final long MAX_APK = 200L << 20;

    public interface Events {
        void progress(String phase, long done, long total);
    }

    public static final class Config {
        public String repo;
        public String assetBase;
        public String apiBase;
        public File work;
        public BundleStore store;
        public Fetcher fetcher;
        public byte[] certDer;
        public boolean requireSignature;
        public int bridgeApi;
        public String token;
    }

    public static final class IncompatibleException extends IOException {
        public IncompatibleException(String m) {
            super(m);
        }
    }

    public static final class Info {
        public String id, tag, version = "", commit = "", message = "", builtAt = "", zipName, sha256;
        public long run, size;
        public int minBridge;
        public boolean signed;

        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("id", id); m.put("tag", tag); m.put("version", version); m.put("commit", commit);
            m.put("message", message); m.put("builtAt", builtAt); m.put("run", run); m.put("size", size);
            m.put("sha256", sha256); m.put("minBridge", minBridge); m.put("signed", signed);
            return m;
        }
    }

    private final Config cfg;
    private final String assetBase;
    private final String apiBase;

    public OtaCore(Config cfg) {
        if (cfg.repo == null || !REPO.matcher(cfg.repo).matches()) throw new IllegalArgumentException("bad repo");
        this.cfg = cfg;
        this.assetBase = cfg.assetBase != null ? cfg.assetBase : "https://github.com/" + cfg.repo + "/releases/download/%s/";
        this.apiBase = cfg.apiBase != null ? cfg.apiBase : "https://api.github.com/repos/" + cfg.repo;
    }

    private String asset(String tag, String file) {
        return String.format(assetBase, tag) + file;
    }

    private static void ev(Events e, String phase, long a, long b) {
        if (e != null) e.progress(phase, a, b);
    }

    // ---------- web bundles ----------

    /** Fetches and verifies bundle.json for a tag. Returns null when the release does not exist (yet). */
    public Info fetchInfo(String tag) throws IOException {
        if (tag == null || !TAG.matcher(tag).matches()) throw new IOException("bad bundle tag");
        Fetcher.Result r = cfg.fetcher.getBytes(asset(tag, "bundle.json"), 65536, cfg.token, "application/json");
        if (r.status == 404) return null;
        if (r.status != 200) throw new IOException("bundle.json: HTTP " + r.status);
        boolean signed = false;
        if (cfg.certDer != null) {
            Fetcher.Result s = cfg.fetcher.getBytes(asset(tag, "bundle.json.sig"), 8192, cfg.token, null);
            if (s.status == 200 && Trust.verify(cfg.certDer, r.body, s.body)) signed = true;
            else if (cfg.requireSignature) throw new IOException("bundle signature is missing or invalid");
        } else if (cfg.requireSignature) {
            throw new IOException("cannot verify signature: no app certificate");
        }
        Map<String, Object> m;
        try {
            m = MiniJson.parseObject(new String(r.body, UTF8));
        } catch (IllegalArgumentException e) {
            throw new IOException("bundle.json is not valid: " + e.getMessage());
        }
        if (MiniJson.num(m, "schema", 0) != 1) throw new IOException("unsupported bundle schema");
        Info i = new Info();
        i.tag = tag;
        i.id = MiniJson.str(m, "id", "");
        if (!i.id.equals(tag)) throw new IOException("bundle id does not match its release tag");
        i.version = MiniJson.str(m, "version", "");
        i.commit = MiniJson.str(m, "commit", "");
        i.message = MiniJson.str(m, "message", "");
        i.builtAt = MiniJson.str(m, "builtAt", "");
        i.run = MiniJson.num(m, "run", 0);
        i.minBridge = (int) MiniJson.num(m, "minBridge", 0);
        Map<String, Object> z = MiniJson.map(m, "zip");
        i.zipName = MiniJson.str(z, "name", "");
        i.size = MiniJson.num(z, "size", -1);
        i.sha256 = MiniJson.str(z, "sha256", "");
        if (!ZIPNAME.matcher(i.zipName).matches()) throw new IOException("bad zip name in bundle.json");
        if (!SHA.matcher(i.sha256).matches()) throw new IOException("bad sha256 in bundle.json");
        if (i.size <= 0 || i.size > MAX_ZIP) throw new IOException("bad zip size in bundle.json");
        i.signed = signed;
        return i;
    }

    public BundleStore.Meta install(String tag, boolean allowOlder, Events e, AtomicBoolean cancel) throws IOException {
        ev(e, "verify", 0, 0);
        Info info = fetchInfo(tag);
        if (info == null) throw new IOException("release " + tag + " not found");
        if (info.minBridge > cfg.bridgeApi) {
            throw new IncompatibleException("this version needs a newer app (bridge " + info.minBridge + " > " + cfg.bridgeApi + ") - update the APK first");
        }
        BundleStore.Meta have = cfg.store.find(info.id);
        if (have != null && !have.bad && Trust.sameHex(have.sha256, info.sha256)) {
            ev(e, "done", 1, 1);
            return have;
        }
        if (!allowOlder) {
            BundleStore.Meta cur = cfg.store.find(cfg.store.active());
            if (cur != null && info.run > 0 && cur.run > info.run) {
                throw new IOException("older than the running version (run " + info.run + " < " + cur.run + ")");
            }
        }
        if (!cfg.work.isDirectory() && !cfg.work.mkdirs()) throw new IOException("cannot create work dir");
        File zip = new File(cfg.work, info.id + ".zip.part");
        try {
            cfg.fetcher.download(asset(tag, info.zipName), zip, info.size, new Fetcher.Progress() {
                public void on(long d, long t) {
                    ev(e, "download", d, t);
                }
            }, cfg.token, cancel);
            ev(e, "hash", 0, 0);
            if (zip.length() != info.size) throw new IOException("size mismatch (" + zip.length() + " != " + info.size + ")");
            if (!Trust.sameHex(Trust.sha256Hex(zip), info.sha256)) throw new IOException("sha256 mismatch - download corrupted or tampered");
            ev(e, "unpack", 0, 0);
            BundleStore.Meta m = new BundleStore.Meta();
            m.id = info.id; m.version = info.version; m.commit = info.commit; m.message = info.message;
            m.builtAt = info.builtAt; m.run = info.run; m.sha256 = info.sha256.toLowerCase(); m.signed = info.signed;
            BundleStore.Meta done = cfg.store.install(zip, m);
            ev(e, "done", 1, 1);
            return done;
        } finally {
            zip.delete();
        }
    }

    /** Pointer to the newest bundle ("web-latest" release). Unsigned on purpose: it only names a signed release. */
    public Map<String, Object> latestPointer() throws IOException {
        Fetcher.Result r = cfg.fetcher.getBytes(asset("web-latest", "latest.json"), 16384, cfg.token, "application/json");
        if (r.status == 404) return null;
        if (r.status != 200) throw new IOException("latest.json: HTTP " + r.status);
        Map<String, Object> m;
        try {
            m = MiniJson.parseObject(new String(r.body, UTF8));
        } catch (IllegalArgumentException ex) {
            throw new IOException("latest.json is not valid");
        }
        String tag = MiniJson.str(m, "tag", "");
        if (!TAG.matcher(tag).matches()) throw new IOException("latest.json has a bad tag");
        return m;
    }

    /** Lists published web-* releases (newest first) from the GitHub API. */
    public List<Map<String, Object>> remote() throws IOException {
        Fetcher.Result r = cfg.fetcher.getBytes(apiBase + "/releases?per_page=30", 1 << 20, cfg.token, "application/vnd.github+json");
        if (r.status != 200) throw new IOException("releases: HTTP " + r.status);
        Object v;
        try {
            v = MiniJson.parse(new String(r.body, UTF8));
        } catch (IllegalArgumentException ex) {
            throw new IOException("releases response is not valid JSON");
        }
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
        if (!(v instanceof List)) return out;
        for (Object o : (List<?>) v) {
            if (!(o instanceof Map)) continue;
            @SuppressWarnings("unchecked")
            Map<String, Object> rel = (Map<String, Object>) o;
            String tag = MiniJson.str(rel, "tag_name", "");
            if (!TAG.matcher(tag).matches() || tag.equals("web-latest") || MiniJson.bool(rel, "draft", false)) continue;
            Map<String, Object> x = new LinkedHashMap<String, Object>();
            x.put("tag", tag);
            x.put("name", MiniJson.str(rel, "name", tag));
            x.put("publishedAt", MiniJson.str(rel, "published_at", ""));
            x.put("installed", cfg.store.find(tag) != null);
            out.add(x);
        }
        return out;
    }

    // ---------- APK ----------

    /** apk.json from the "nino-latest" release; null when absent. */
    public Map<String, Object> apkInfo() throws IOException {
        Fetcher.Result r = cfg.fetcher.getBytes(asset("nino-latest", "apk.json"), 16384, cfg.token, "application/json");
        if (r.status == 404) return null;
        if (r.status != 200) throw new IOException("apk.json: HTTP " + r.status);
        try {
            Map<String, Object> m = MiniJson.parseObject(new String(r.body, UTF8));
            if (MiniJson.num(m, "schema", 0) != 1) throw new IOException("unsupported apk.json schema");
            if (!SHA.matcher(MiniJson.str(m, "sha256", "")).matches()) throw new IOException("bad sha256 in apk.json");
            long size = MiniJson.num(m, "size", -1);
            if (size <= 0 || size > MAX_APK) throw new IOException("bad apk size");
            return m;
        } catch (IllegalArgumentException ex) {
            throw new IOException("apk.json is not valid");
        }
    }

    /** Downloads NINO.apk and checks size + sha256. The caller must still verify the signing certificate. */
    public File downloadApk(Map<String, Object> info, Events e, AtomicBoolean cancel) throws IOException {
        if (!cfg.work.isDirectory() && !cfg.work.mkdirs()) throw new IOException("cannot create work dir");
        File apk = new File(cfg.work, "NINO-update.apk");
        long size = MiniJson.num(info, "size", -1);
        boolean ok = false;
        try {
            cfg.fetcher.download(asset("nino-latest", "NINO.apk"), apk, size, new Fetcher.Progress() {
                public void on(long d, long t) {
                    ev(e, "download", d, t);
                }
            }, cfg.token, cancel);
            ev(e, "hash", 0, 0);
            if (apk.length() != size) throw new IOException("apk size mismatch");
            if (!Trust.sameHex(Trust.sha256Hex(apk), MiniJson.str(info, "sha256", ""))) throw new IOException("apk sha256 mismatch");
            ok = true;
            return apk;
        } finally {
            if (!ok) apk.delete();
        }
    }
}
