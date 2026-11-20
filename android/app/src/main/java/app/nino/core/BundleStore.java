package app.nino.core;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.regex.Pattern;

/**
 * On-device store of downloaded web bundles (the app UI). The APK's own assets are the virtual bundle "builtin".
 *
 * Safety model: activating a bundle marks it "pending". It becomes trusted only after the page calls markHealthy.
 * If it fails to boot (too many attempts, crash, or fail()) the store rolls back automatically to the previous
 * working bundle and flags the failed one as bad. All state changes are written atomically.
 */
public final class BundleStore {

    public static final String BUILTIN = "builtin";
    public static final int MAX_TRIES = 2;
    private static final Pattern ID = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$");

    public static final class Meta {
        public String id;
        public String version = "";
        public String commit = "";
        public String message = "";
        public String builtAt = "";
        public String sha256 = "";
        public long run;
        public long installedAt;
        public long size;
        public int files;
        public boolean signed;
        public boolean pinned;
        public boolean bad;

        public Meta copy() {
            Meta m = new Meta();
            m.id = id; m.version = version; m.commit = commit; m.message = message; m.builtAt = builtAt;
            m.sha256 = sha256; m.run = run; m.installedAt = installedAt; m.size = size; m.files = files;
            m.signed = signed; m.pinned = pinned; m.bad = bad;
            return m;
        }
    }

    public static final class Snapshot {
        public String active;
        public String pending;
        public String prev;
        public String lastGood;
        public String lastRollback;
        public int tries;
        public List<Meta> history = new ArrayList<Meta>();
    }

    public static final class Boot {
        public boolean rolledBack;
        public String active;
        public String reason;
    }

    private final File bundlesDir;
    private final File stateFile;
    private final int keep;
    private final ZipSafe.Limits limits = new ZipSafe.Limits();
    private final Map<String, Meta> metas = new LinkedHashMap<String, Meta>();
    private String active = BUILTIN;
    private String pending;
    private String prev;
    private String lastGood;
    private String lastRollback;
    private int tries;
    private long appCode;

    public BundleStore(File root, int keep) throws IOException {
        this.bundlesDir = new File(root, "bundles");
        this.stateFile = new File(root, "state.properties");
        this.keep = Math.max(3, keep);
        if (!bundlesDir.isDirectory() && !bundlesDir.mkdirs()) throw new IOException("cannot create " + bundlesDir);
        File[] kids = bundlesDir.listFiles();
        if (kids != null) {
            for (File k : kids) if (k.getName().startsWith(".tmp-")) ZipSafe.deleteTree(k);
        }
        load();
    }

    public static boolean validId(String id) {
        return id != null && ID.matcher(id).matches() && !BUILTIN.equals(id);
    }

    private File dirOf(String id) {
        return new File(bundlesDir, id);
    }

    private boolean exists(String id) {
        return metas.containsKey(id) && dirOf(id).isDirectory();
    }

    // ---------- persistence ----------

    private synchronized void load() {
        if (!stateFile.isFile()) return;
        try {
            Properties p = new Properties();
            InputStream in = new FileInputStream(stateFile);
            try {
                p.load(in);
            } finally {
                in.close();
            }
            active = p.getProperty("active", BUILTIN);
            pending = emptyToNull(p.getProperty("pending"));
            prev = emptyToNull(p.getProperty("prev"));
            lastGood = emptyToNull(p.getProperty("lastGood"));
            lastRollback = emptyToNull(p.getProperty("lastRollback"));
            tries = parseInt(p.getProperty("tries"), 0);
            appCode = parseLong(p.getProperty("appCode"), 0);
            String order = p.getProperty("order", "");
            for (String id : order.split(",")) {
                if (!validId(id) || !dirOf(id).isDirectory()) continue;
                Meta m = new Meta();
                m.id = id;
                String k = "m." + id + ".";
                m.version = p.getProperty(k + "version", "");
                m.commit = p.getProperty(k + "commit", "");
                m.message = p.getProperty(k + "message", "");
                m.builtAt = p.getProperty(k + "builtAt", "");
                m.sha256 = p.getProperty(k + "sha256", "");
                m.run = parseLong(p.getProperty(k + "run"), 0);
                m.installedAt = parseLong(p.getProperty(k + "installedAt"), 0);
                m.size = parseLong(p.getProperty(k + "size"), 0);
                m.files = parseInt(p.getProperty(k + "files"), 0);
                m.signed = "1".equals(p.getProperty(k + "signed"));
                m.pinned = "1".equals(p.getProperty(k + "pinned"));
                m.bad = "1".equals(p.getProperty(k + "bad"));
                metas.put(id, m);
            }
            if (!BUILTIN.equals(active) && !exists(active)) {
                lastRollback = "bundle " + active + " missing on disk";
                active = BUILTIN;
                pending = null;
                tries = 0;
            }
            if (pending != null && !pending.equals(active)) pending = null;
            if (prev != null && !BUILTIN.equals(prev) && !exists(prev)) prev = null;
            if (lastGood != null && !BUILTIN.equals(lastGood) && !exists(lastGood)) lastGood = null;
        } catch (Exception e) {
            File bad = new File(stateFile.getPath() + ".bad");
            bad.delete();
            stateFile.renameTo(bad);
            metas.clear();
            active = BUILTIN;
            pending = prev = lastGood = null;
            tries = 0;
            lastRollback = "state file was corrupt; reset to builtin";
        }
    }

    private static String emptyToNull(String s) {
        return s == null || s.length() == 0 ? null : s;
    }

    private static int parseInt(String s, int d) {
        try { return s == null ? d : Integer.parseInt(s); } catch (NumberFormatException e) { return d; }
    }

    private static long parseLong(String s, long d) {
        try { return s == null ? d : Long.parseLong(s); } catch (NumberFormatException e) { return d; }
    }

    private static String oneLine(String s, int max) {
        if (s == null) return "";
        String t = s.replace('\n', ' ').replace('\r', ' ').trim();
        return t.length() > max ? t.substring(0, max) : t;
    }

    private void save() throws IOException {
        Properties p = new Properties();
        p.setProperty("v", "1");
        p.setProperty("active", active);
        p.setProperty("pending", pending == null ? "" : pending);
        p.setProperty("prev", prev == null ? "" : prev);
        p.setProperty("lastGood", lastGood == null ? "" : lastGood);
        p.setProperty("lastRollback", lastRollback == null ? "" : lastRollback);
        p.setProperty("tries", String.valueOf(tries));
        p.setProperty("appCode", String.valueOf(appCode));
        StringBuilder order = new StringBuilder();
        for (Meta m : metas.values()) {
            if (order.length() > 0) order.append(',');
            order.append(m.id);
            String k = "m." + m.id + ".";
            p.setProperty(k + "version", oneLine(m.version, 40));
            p.setProperty(k + "commit", oneLine(m.commit, 40));
            p.setProperty(k + "message", oneLine(m.message, 200));
            p.setProperty(k + "builtAt", oneLine(m.builtAt, 40));
            p.setProperty(k + "sha256", oneLine(m.sha256, 64));
            p.setProperty(k + "run", String.valueOf(m.run));
            p.setProperty(k + "installedAt", String.valueOf(m.installedAt));
            p.setProperty(k + "size", String.valueOf(m.size));
            p.setProperty(k + "files", String.valueOf(m.files));
            p.setProperty(k + "signed", m.signed ? "1" : "0");
            p.setProperty(k + "pinned", m.pinned ? "1" : "0");
            p.setProperty(k + "bad", m.bad ? "1" : "0");
        }
        p.setProperty("order", order.toString());
        File tmp = new File(stateFile.getPath() + ".tmp");
        OutputStream os = new FileOutputStream(tmp);
        try {
            p.store(os, "NINO bundle store");
            os.flush();
            try { ((FileOutputStream) os).getFD().sync(); } catch (IOException ignore) { }
        } finally {
            os.close();
        }
        try {
            Files.move(tmp.toPath(), stateFile.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(tmp.toPath(), stateFile.toPath(), StandardCopyOption.REPLACE_EXISTING);
        }
    }

    // ---------- install / prune ----------

    /** Unpacks zip into the store. Does not activate it. */
    public synchronized Meta install(File zip, Meta meta) throws IOException {
        if (meta == null || !validId(meta.id)) throw new IOException("invalid bundle id");
        if (exists(meta.id) && (meta.id.equals(active) || meta.id.equals(pending))) return metas.get(meta.id).copy();
        File tmp = new File(bundlesDir, ".tmp-" + System.nanoTime());
        try {
            ZipSafe.Stats st = ZipSafe.extract(zip, tmp, limits);
            if (!new File(tmp, "index.html").isFile()) throw new IOException("bundle has no index.html at its root");
            File fin = dirOf(meta.id);
            ZipSafe.deleteTree(fin);
            if (!tmp.renameTo(fin)) throw new IOException("cannot move bundle into place");
            Meta m = meta.copy();
            m.files = st.files;
            m.size = st.bytes;
            m.installedAt = System.currentTimeMillis();
            m.bad = false;
            metas.remove(m.id);
            metas.put(m.id, m);
            prune();
            save();
            return m.copy();
        } catch (IOException e) {
            ZipSafe.deleteTree(tmp);
            throw e;
        } catch (RuntimeException e) {
            ZipSafe.deleteTree(tmp);
            throw e;
        }
    }

    private void prune() {
        while (metas.size() > keep) {
            String victim = null;
            for (Meta m : metas.values()) {
                if (m.pinned || m.id.equals(active) || m.id.equals(pending) || m.id.equals(prev) || m.id.equals(lastGood)) continue;
                victim = m.id;
                break;
            }
            if (victim == null) return;
            metas.remove(victim);
            ZipSafe.deleteTree(dirOf(victim));
        }
    }

    // ---------- switching ----------

    public synchronized void activate(String id) throws IOException {
        if (!BUILTIN.equals(id)) {
            if (!validId(id) || !exists(id)) throw new IOException("no such bundle: " + id);
        }
        if (id.equals(active)) return;
        prev = active;
        active = id;
        pending = BUILTIN.equals(id) ? null : id;
        tries = 0;
        Meta m = metas.get(id);
        if (m != null) m.bad = false;
        save();
    }

    /** Id the user would land on when stepping back (-1) or forward (+1) through history; null if none. */
    public synchronized String stepTarget(int dir) {
        List<String> all = new ArrayList<String>();
        all.add(BUILTIN);
        all.addAll(metas.keySet());
        int idx = all.indexOf(active);
        if (idx < 0) return null;
        for (int i = idx + dir; i >= 0 && i < all.size(); i += dir) {
            String id = all.get(i);
            if (BUILTIN.equals(id)) return id;
            Meta m = metas.get(id);
            if (m != null && !m.bad && dirOf(id).isDirectory()) return id;
        }
        return null;
    }

    /** Called before every page load. Counts attempts for a pending bundle and rolls back when it keeps failing. */
    public synchronized Boot beginBoot() throws IOException {
        Boot b = new Boot();
        if (pending != null) {
            tries++;
            if (tries > MAX_TRIES) {
                b.rolledBack = true;
                b.reason = "bundle " + pending + " did not become healthy after " + MAX_TRIES + " attempts";
                rollbackLocked(b.reason);
            } else {
                save();
            }
        }
        b.active = active;
        return b;
    }

    public synchronized void markHealthy(String id) throws IOException {
        if (id == null || !id.equals(active)) return;
        boolean changed = false;
        if (pending != null && pending.equals(id)) { pending = null; changed = true; }
        if (tries != 0) { tries = 0; changed = true; }
        if (!id.equals(lastGood)) { lastGood = id; changed = true; }
        if (changed) save();
    }

    /** Page or native side reports the pending bundle is broken. Returns the new active id, or null if nothing was pending. */
    public synchronized String fail(String reason) throws IOException {
        if (pending == null) return null;
        return rollbackLocked(reason == null ? "reported failure" : reason);
    }

    private String rollbackLocked(String reason) throws IOException {
        String failed = active;
        String target = BUILTIN;
        if (prev != null && !prev.equals(failed) && (BUILTIN.equals(prev) || (exists(prev) && !metas.get(prev).bad))) {
            target = prev;
        } else if (lastGood != null && !lastGood.equals(failed) && !BUILTIN.equals(lastGood) && exists(lastGood) && !metas.get(lastGood).bad) {
            target = lastGood;
        }
        Meta fm = metas.get(failed);
        if (fm != null) fm.bad = true;
        active = target;
        pending = null;
        prev = null;
        tries = 0;
        lastRollback = oneLine(reason, 160) + " [" + failed + "]";
        save();
        return target;
    }

    /**
     * Call once per process start with the installed versionCode. A freshly installed APK carries a newer built-in UI
     * than any bundle downloaded for the previous APK, so the built-in UI takes over again (history is kept).
     * Returns true when a bundle was switched off.
     */
    public synchronized boolean resetIfAppChanged(long code) throws IOException {
        if (code == appCode) return false;
        boolean wasCustom = appCode != 0 && !BUILTIN.equals(active);
        appCode = code;
        if (wasCustom) {
            active = BUILTIN;
            pending = null;
            prev = null;
            tries = 0;
        }
        save();
        return wasCustom;
    }

    // ---------- housekeeping ----------

    public synchronized void remove(String id) throws IOException {
        if (!validId(id) || !metas.containsKey(id)) throw new IOException("no such bundle: " + id);
        if (id.equals(active) || id.equals(pending)) throw new IOException("cannot remove the bundle in use");
        metas.remove(id);
        if (id.equals(prev)) prev = null;
        if (id.equals(lastGood)) lastGood = null;
        ZipSafe.deleteTree(dirOf(id));
        save();
    }

    public synchronized void pin(String id, boolean pinned) throws IOException {
        Meta m = metas.get(id);
        if (m == null) throw new IOException("no such bundle: " + id);
        m.pinned = pinned;
        save();
    }

    public synchronized Meta find(String id) {
        Meta m = metas.get(id);
        return m == null ? null : m.copy();
    }

    public synchronized String active() {
        return active;
    }

    public synchronized boolean isPending() {
        return pending != null;
    }

    public synchronized long totalBytes() {
        long t = 0;
        for (Meta m : metas.values()) t += m.size;
        return t;
    }

    public synchronized Snapshot snapshot() {
        Snapshot s = new Snapshot();
        s.active = active;
        s.pending = pending;
        s.prev = prev;
        s.lastGood = lastGood;
        s.lastRollback = lastRollback;
        s.tries = tries;
        for (Meta m : metas.values()) s.history.add(m.copy());
        return s;
    }

    // ---------- serving ----------

    public synchronized File activeDir() {
        if (BUILTIN.equals(active)) return null;
        File d = dirOf(active);
        return d.isDirectory() ? d : null;
    }

    /** Maps a URL path (relative to the app root) to a file inside the active bundle, or null to fall back to the APK. */
    public File resolve(String rel) {
        File dir = activeDir();
        if (dir == null || rel == null) return null;
        String p = rel;
        while (p.startsWith("/")) p = p.substring(1);
        if (p.length() == 0 || p.endsWith("/")) p = p + "index.html";
        if (p.indexOf('\\') >= 0 || p.indexOf('\0') >= 0 || p.length() > 240) return null;
        for (String seg : p.split("/", -1)) {
            if (seg.length() == 0 || seg.equals("..") || seg.equals(".") || seg.charAt(0) == '.') return null;
        }
        try {
            File f = new File(dir, p);
            String canon = f.getCanonicalPath();
            if (!canon.startsWith(dir.getCanonicalPath() + File.separator)) return null;
            return f.isFile() ? f : null;
        } catch (IOException e) {
            return null;
        }
    }
}
