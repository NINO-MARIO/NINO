package app.nino.core;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.Charset;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.Deque;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;

/** Structured in-memory ring + rotating log files + counters + crash reports. Never throws into the caller. */
public final class RingLog {

    public static final int D = 0, I = 1, W = 2, E = 3;
    private static final String[] NAMES = {"D", "I", "W", "E"};
    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final int MAX_MSG = 4000;

    public static final class Entry {
        public long ts;
        public int level;
        public String tag;
        public String msg;
    }

    private static final Pattern[] SECRETS = {
        Pattern.compile("gh[pousr]_[A-Za-z0-9]{20,}"),
        Pattern.compile("github_pat_[A-Za-z0-9_]{20,}"),
        Pattern.compile("AIza[0-9A-Za-z_\\-]{30,}"),
        Pattern.compile("sk-[A-Za-z0-9_\\-]{16,}"),
    };
    private static final Pattern BEARER = Pattern.compile("(?i)(bearer\\s+)[A-Za-z0-9._~+/=\\-]{12,}");
    private static final Pattern KV = Pattern.compile("(?i)((?:authorization|token|api[_-]?key|password|passwd|secret)[\"'\\s:=]+)([^\\s\"',;]{6,})");

    private final File dir;
    private final int ringSize;
    private final long maxFileBytes;
    private final int keepFiles;
    private final Deque<Entry> ring = new ArrayDeque<Entry>();
    private final Map<String, AtomicLong> counters = new ConcurrentHashMap<String, AtomicLong>();
    private BufferedWriter out;
    private long fileBytes;
    private int minLevel = D;

    public RingLog(File dir, int ringSize, long maxFileBytes, int keepFiles) {
        this.dir = dir;
        this.ringSize = Math.max(50, ringSize);
        this.maxFileBytes = Math.max(16384, maxFileBytes);
        this.keepFiles = Math.max(1, keepFiles);
        if (dir != null) dir.mkdirs();
    }

    public static String scrub(String s) {
        if (s == null) return "";
        String t = s.length() > MAX_MSG ? s.substring(0, MAX_MSG) + "..." : s;
        for (Pattern p : SECRETS) t = p.matcher(t).replaceAll("***");
        t = BEARER.matcher(t).replaceAll("$1***");
        t = KV.matcher(t).replaceAll("$1***");
        return t;
    }

    public static String levelName(int l) {
        return NAMES[Math.max(0, Math.min(3, l))];
    }

    public static int levelOf(String n) {
        if (n == null) return D;
        for (int i = 0; i < NAMES.length; i++) if (NAMES[i].equalsIgnoreCase(n)) return i;
        return D;
    }

    public synchronized void setMinLevel(int l) {
        minLevel = l;
    }

    public void incr(String key) {
        incr(key, 1);
    }

    public void incr(String key, long n) {
        AtomicLong a = counters.get(key);
        if (a == null) {
            AtomicLong fresh = new AtomicLong();
            a = counters.putIfAbsent(key, fresh);
            if (a == null) a = fresh;
        }
        a.addAndGet(n);
    }

    public Map<String, Long> counters() {
        Map<String, Long> m = new TreeMap<String, Long>();
        for (Map.Entry<String, AtomicLong> e : counters.entrySet()) m.put(e.getKey(), e.getValue().get());
        return m;
    }

    public synchronized void log(int level, String tag, String msg) {
        try {
            if (level < minLevel) return;
            Entry e = new Entry();
            e.ts = System.currentTimeMillis();
            e.level = Math.max(0, Math.min(3, level));
            e.tag = tag == null ? "app" : tag;
            e.msg = scrub(msg);
            ring.addLast(e);
            while (ring.size() > ringSize) ring.removeFirst();
            if (level >= E) incr("log.errors");
            else if (level == W) incr("log.warnings");
            writeLine(format(e));
        } catch (Throwable ignore) {
            // logging must never take the app down
        }
    }

    public static String format(Entry e) {
        SimpleDateFormat f = new SimpleDateFormat("MM-dd HH:mm:ss.SSS", Locale.US);
        return f.format(new Date(e.ts)) + " " + NAMES[e.level] + "/" + e.tag + ": " + e.msg;
    }

    private void writeLine(String line) throws IOException {
        if (dir == null) return;
        if (out == null) {
            File f = new File(dir, "nino.log");
            fileBytes = f.length();
            out = new BufferedWriter(new OutputStreamWriter(new FileOutputStream(f, true), UTF8));
        }
        out.write(line);
        out.write('\n');
        out.flush();
        fileBytes += line.length() + 1;
        if (fileBytes > maxFileBytes) rotate();
    }

    private void rotate() throws IOException {
        out.close();
        out = null;
        new File(dir, "nino.log." + keepFiles).delete();
        for (int i = keepFiles - 1; i >= 1; i--) new File(dir, "nino.log." + i).renameTo(new File(dir, "nino.log." + (i + 1)));
        new File(dir, "nino.log").renameTo(new File(dir, "nino.log.1"));
        fileBytes = 0;
    }

    public synchronized List<Entry> tail(int n, int min, String tagContains) {
        List<Entry> all = new ArrayList<Entry>();
        for (Entry e : ring) {
            if (e.level < min) continue;
            if (tagContains != null && tagContains.length() > 0 && e.tag.indexOf(tagContains) < 0) continue;
            all.add(e);
        }
        int from = Math.max(0, all.size() - Math.max(1, n));
        return new ArrayList<Entry>(all.subList(from, all.size()));
    }

    public String export(int n) {
        StringBuilder b = new StringBuilder();
        for (Entry e : tail(n, D, null)) b.append(format(e)).append('\n');
        return b.toString();
    }

    // ---------- crash reports ----------

    public synchronized File writeCrash(String kind, Throwable t, String extra) {
        try {
            if (dir == null) return null;
            StringWriter sw = new StringWriter();
            if (t != null) t.printStackTrace(new PrintWriter(sw));
            StringBuilder b = new StringBuilder();
            b.append("NINO crash report\nkind: ").append(kind).append("\ntime: ");
            SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
            iso.setTimeZone(TimeZone.getTimeZone("UTC"));
            b.append(iso.format(new Date())).append('\n');
            if (extra != null) b.append(scrub(extra)).append('\n');
            b.append("\n--- stack ---\n").append(scrub(sw.toString())).append("\n--- counters ---\n");
            for (Map.Entry<String, Long> c : counters().entrySet()) b.append(c.getKey()).append('=').append(c.getValue()).append('\n');
            b.append("\n--- last log lines ---\n").append(export(120));
            File f = new File(dir, "crash-" + System.currentTimeMillis() + ".txt");
            FileOutputStream os = new FileOutputStream(f);
            try {
                os.write(b.toString().getBytes(UTF8));
                os.flush();
            } finally {
                os.close();
            }
            pruneCrashes();
            return f;
        } catch (Throwable ignore) {
            return null;
        }
    }

    private File[] crashFiles() {
        File[] fs = dir == null ? null : dir.listFiles();
        List<File> l = new ArrayList<File>();
        if (fs != null) for (File f : fs) if (f.getName().startsWith("crash-") && f.getName().endsWith(".txt")) l.add(f);
        File[] a = l.toArray(new File[0]);
        Arrays.sort(a);
        return a;
    }

    private void pruneCrashes() {
        File[] a = crashFiles();
        for (int i = 0; i < a.length - 5; i++) a[i].delete();
    }

    public synchronized String lastCrash() {
        File[] a = crashFiles();
        if (a.length == 0) return null;
        try {
            File f = a[a.length - 1];
            FileInputStream in = new FileInputStream(f);
            try {
                byte[] b = new byte[(int) Math.min(f.length(), 60000)];
                int n = 0, r;
                while (n < b.length && (r = in.read(b, n, b.length - n)) > 0) n += r;
                return new String(b, 0, n, UTF8);
            } finally {
                in.close();
            }
        } catch (IOException e) {
            return null;
        }
    }

    public synchronized void clearCrashes() {
        for (File f : crashFiles()) f.delete();
    }
}
