package app.nino.core;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.Reader;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Real process-backed shell sessions (the platform /system/bin/sh and its toolbox commands).
 * There is no pseudo-terminal, so full-screen programs (vi, top) are not supported; line commands are.
 */
public final class Shell {

    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final int BACKLOG = 64 * 1024;

    public interface Sink {
        void onOutput(String sid, String data);

        void onExit(String sid, int code);
    }

    public static final class ExecResult {
        public int code = -1;
        public String out = "";
        public boolean timedOut;
        public boolean truncated;
    }

    public static final class Session {
        public final String id;
        private final Process proc;
        private final OutputStream stdin;
        private final StringBuilder backlog = new StringBuilder();
        private volatile boolean alive = true;
        private volatile int exitCode = -1;
        private volatile Sink sink;

        Session(String id, Process proc, Sink sink) {
            this.id = id;
            this.proc = proc;
            this.stdin = proc.getOutputStream();
            this.sink = sink;
        }

        void pump() {
            Thread t = new Thread(new Runnable() {
                public void run() {
                    try {
                        Reader r = new InputStreamReader(proc.getInputStream(), UTF8);
                        char[] buf = new char[4096];
                        int n;
                        while ((n = r.read(buf)) > 0) {
                            String s = new String(buf, 0, n);
                            synchronized (backlog) {
                                backlog.append(s);
                                if (backlog.length() > BACKLOG) backlog.delete(0, backlog.length() - BACKLOG);
                            }
                            Sink k = sink;
                            if (k != null) k.onOutput(id, s);
                        }
                    } catch (IOException ignore) {
                        // stream closed
                    }
                    try {
                        exitCode = proc.waitFor();
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                    alive = false;
                    Sink k = sink;
                    if (k != null) k.onExit(id, exitCode);
                }
            }, "nino-shell-" + id);
            t.setDaemon(true);
            t.start();
        }

        public boolean alive() {
            return alive;
        }

        public int exitCode() {
            return exitCode;
        }

        public void setSink(Sink s) {
            this.sink = s;
        }

        public String backlog() {
            synchronized (backlog) {
                return backlog.toString();
            }
        }

        public synchronized void write(String s) throws IOException {
            if (!alive) throw new IOException("session ended");
            stdin.write(s.getBytes(UTF8));
            stdin.flush();
        }

        public void kill() {
            alive = false;
            try { stdin.close(); } catch (IOException ignore) { }
            proc.destroyForcibly();
        }
    }

    private final File home;
    private final File tmp;
    private final String shellPath;
    private final Map<String, Session> sessions = new LinkedHashMap<String, Session>();
    private final AtomicInteger seq = new AtomicInteger();
    private final int maxSessions;

    public Shell(File home, File tmp, String shellPath, int maxSessions) {
        this.home = home;
        this.tmp = tmp;
        this.shellPath = shellPath != null ? shellPath : defaultShell();
        this.maxSessions = Math.max(1, maxSessions);
        home.mkdirs();
        tmp.mkdirs();
    }

    public static String defaultShell() {
        return new File("/system/bin/sh").exists() ? "/system/bin/sh" : "/bin/sh";
    }

    private ProcessBuilder builder(List<String> cmd) {
        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.directory(home);
        pb.redirectErrorStream(true);
        Map<String, String> env = pb.environment();
        env.put("HOME", home.getAbsolutePath());
        env.put("TMPDIR", tmp.getAbsolutePath());
        env.put("TERM", "dumb");
        env.put("PS1", "");
        String path = env.get("PATH");
        env.put("PATH", new File(home, "bin").getAbsolutePath() + ":" + (path == null || path.length() == 0 ? "/system/bin:/system/xbin" : path));
        return pb;
    }

    public synchronized Session open(Sink sink) throws IOException {
        int live = 0;
        List<String> dead = new ArrayList<String>();
        for (Session s : sessions.values()) {
            if (s.alive()) live++;
            else dead.add(s.id);
        }
        for (String d : dead) sessions.remove(d);
        if (live >= maxSessions) throw new IOException("too many terminal sessions (max " + maxSessions + ")");
        List<String> cmd = new ArrayList<String>();
        cmd.add(shellPath);
        cmd.add("-i");
        Session s = new Session("t" + seq.incrementAndGet(), builder(cmd).start(), sink);
        sessions.put(s.id, s);
        s.pump();
        return s;
    }

    public synchronized Session get(String id) {
        return sessions.get(id);
    }

    public synchronized List<Session> list() {
        return new ArrayList<Session>(sessions.values());
    }

    public synchronized void killAll() {
        for (Session s : sessions.values()) s.kill();
        sessions.clear();
    }

    /** One-shot command with a hard timeout and an output cap. */
    public ExecResult exec(String command, long timeoutMs, int maxOut) throws IOException {
        List<String> cmd = new ArrayList<String>();
        cmd.add(shellPath);
        cmd.add("-c");
        cmd.add(command);
        final Process p = builder(cmd).start();
        try { p.getOutputStream().close(); } catch (IOException ignore) { }
        final ExecResult r = new ExecResult();
        final StringBuilder sb = new StringBuilder();
        final int cap = Math.max(1024, maxOut);
        Thread t = new Thread(new Runnable() {
            public void run() {
                try {
                    InputStream in = p.getInputStream();
                    Reader rd = new InputStreamReader(in, UTF8);
                    char[] buf = new char[4096];
                    int n;
                    while ((n = rd.read(buf)) > 0) {
                        synchronized (sb) {
                            if (sb.length() < cap) sb.append(buf, 0, Math.min(n, cap - sb.length()));
                            if (sb.length() >= cap) r.truncated = true;
                        }
                    }
                } catch (IOException ignore) {
                    // process killed
                }
            }
        }, "nino-exec");
        t.setDaemon(true);
        t.start();
        try {
            if (p.waitFor(Math.max(500, timeoutMs), TimeUnit.MILLISECONDS)) {
                r.code = p.exitValue();
            } else {
                r.timedOut = true;
                p.destroyForcibly();
                p.waitFor(2, TimeUnit.SECONDS);
            }
            t.join(1500);
        } catch (InterruptedException e) {
            p.destroyForcibly();
            Thread.currentThread().interrupt();
        }
        synchronized (sb) {
            r.out = sb.toString();
        }
        return r;
    }

    // ---------- defence in depth: refuse obviously destructive commands even before asking the user ----------

    private static final String[] ROOTS = {
        "/", "/*", "~", "~/", "~/*", "$HOME", "$HOME/", "$HOME/*", "/data", "/data/", "/data/*", "/data/data", "/data/data/",
        "/data/data/*", "/data/data/app.nino", "/data/data/app.nino/", "/data/user/0/app.nino", "/data/user/0/app.nino/",
        "/sdcard", "/sdcard/", "/sdcard/*", "/storage", "/storage/", "/storage/*", "/system", "/system/*"
    };

    /** Returns a human-readable reason when the command looks destructive, otherwise null. Not a sandbox. */
    public static String dangerous(String cmd) {
        if (cmd == null) return null;
        String all = cmd.trim();
        if (all.matches("(?s).*:\\s*\\(\\s*\\)\\s*\\{.*")) return "fork bomb";
        for (String seg : all.split("[;&|\\n`()]+")) {
            String[] tok = seg.trim().split("\\s+");
            if (tok.length == 0 || tok[0].length() == 0) continue;
            String c = tok[0];
            int slash = c.lastIndexOf('/');
            if (slash >= 0) c = c.substring(slash + 1);
            if (c.equals("rm")) {
                boolean recursive = false;
                for (int i = 1; i < tok.length; i++) {
                    String a = tok[i];
                    if (a.equals("--recursive") || (a.startsWith("-") && !a.startsWith("--") && (a.indexOf('r') > 0 || a.indexOf('R') > 0))) recursive = true;
                }
                if (recursive) {
                    for (int i = 1; i < tok.length; i++) {
                        String a = tok[i].replace("\"", "").replace("'", "");
                        for (String r : ROOTS) if (a.equals(r)) return "recursive delete of a top-level path";
                    }
                }
            } else if (c.startsWith("mkfs")) {
                return "formats a filesystem";
            } else if (c.equals("dd")) {
                for (int i = 1; i < tok.length; i++) if (tok[i].startsWith("of=/dev/")) return "writes to a raw device";
            } else if (c.equals("reboot") || c.equals("shutdown") || c.equals("poweroff") || c.equals("halt")) {
                return "restarts or powers off the device";
            } else if (c.equals("su") || c.equals("sudo")) {
                return "privilege escalation";
            } else if (c.equals("pm") && tok.length > 1 && (tok[1].equals("uninstall") || tok[1].equals("clear") || tok[1].equals("disable") || tok[1].equals("disable-user"))) {
                return "removes or disables an app";
            } else if (c.equals("am") && tok.length > 1 && (tok[1].equals("force-stop") || tok[1].equals("kill") || tok[1].equals("kill-all"))) {
                return "kills apps";
            }
        }
        return null;
    }
}
