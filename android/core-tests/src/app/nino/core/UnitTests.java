package app.nino.core;

import java.io.File;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;

/** Tests for the pure-Java pieces: JSON, hashing, host policy, zip safety, bundle store, log, shell. */
final class UnitTests {

    static void all() throws Exception {
        json();
        trust();
        hostPolicy();
        zipSafe();
        bundleStore();
        ringLog();
        shell();
    }

    // ---------------------------------------------------------------------------------------------
    static void json() throws Exception {
        T.section("MiniJson");
        Map<String, Object> m = MiniJson.parseObject("{\"a\":1,\"b\":[true,null,\"x\\n\\u0e44\\u0e17\"],\"c\":{\"d\":-2.5},\"e\":\"\"}");
        T.eq(MiniJson.num(m, "a", 0), 1L, "number");
        T.eq(MiniJson.list(m, "b").get(2), "x\n\u0e44\u0e17", "escapes and unicode");
        T.eq(MiniJson.map(m, "c").get("d"), Double.valueOf(-2.5), "double");
        T.eq(MiniJson.str(m, "e", "z"), "", "empty string kept");
        String w = MiniJson.write(m);
        T.eq(MiniJson.parseObject(w).toString(), m.toString(), "roundtrip");
        T.throwsIO(new Callable<Object>() { public Object call() { return MiniJson.parse("{\"a\":}"); } }, "JSON", "bad value rejected");
        T.throwsIO(new Callable<Object>() { public Object call() { return MiniJson.parse("{\"a\":1} x"); } }, "trailing", "trailing garbage rejected");
        T.throwsIO(new Callable<Object>() { public Object call() { return MiniJson.parse("[1,2"); } }, "JSON", "unterminated array rejected");
        T.eq(MiniJson.write("a\"b\\c\u0001"), "\"a\\\"b\\\\c\\u0001\"", "writer escapes");
    }

    // ---------------------------------------------------------------------------------------------
    static void trust() throws Exception {
        T.section("Trust");
        T.eq(Trust.sha256Hex("abc".getBytes("UTF-8")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "sha256 abc");
        T.ok(Trust.sameHex("AbCd", "abcd"), "sameHex ignores case");
        T.ok(!Trust.sameHex("abcd", "abce"), "sameHex differs");
        T.ok(!Trust.sameHex("abc", "abcd"), "sameHex length");
        Keys k = Keys.make("nino-test");
        File data = new File(k.dir, "data.json");
        java.nio.file.Files.write(data.toPath(), "{\"hello\":\"world\"}".getBytes("UTF-8"));
        File sig = k.sign(data);
        byte[] d = T.readAll(data), s = T.readAll(sig);
        T.ok(Trust.verify(k.certDer, d, s), "good signature verifies (openssl -> JCA)");
        byte[] d2 = d.clone();
        d2[3] ^= 1;
        T.ok(!Trust.verify(k.certDer, d2, s), "tampered data fails");
        byte[] s2 = s.clone();
        s2[10] ^= 1;
        T.ok(!Trust.verify(k.certDer, d, s2), "tampered signature fails");
        Keys other = Keys.make("other");
        T.ok(!Trust.verify(other.certDer, d, s), "wrong certificate fails");
        T.ok(!Trust.verify(null, d, s) && !Trust.verify(k.certDer, d, new byte[0]), "null/empty inputs fail closed");
        T.ok(Trust.sameCert(k.certDer, k.certDer.clone()) && !Trust.sameCert(k.certDer, other.certDer), "sameCert");
    }

    // ---------------------------------------------------------------------------------------------
    static void hostPolicy() throws Exception {
        T.section("HostPolicy");
        HostPolicy p = HostPolicy.github();
        T.ok(p.allows(new URL("https://github.com/a/b/releases/download/t/f")), "github.com ok");
        T.ok(p.allows(new URL("https://objects.githubusercontent.com/x")), "objects CDN ok");
        T.ok(p.allows(new URL("https://release-assets.githubusercontent.com/x")), "release-assets CDN ok");
        T.ok(!p.allows(new URL("http://github.com/x")), "plain http denied");
        T.ok(!p.allows(new URL("https://evil.com/x")), "other host denied");
        T.ok(!p.allows(new URL("https://github.com.evil.com/x")), "suffix trick denied");
        T.ok(!p.allows(new URL("https://evilgithub.com/x")), "prefix trick denied");
        T.ok(!p.allows(new URL("https://user:pw@github.com/x")), "userinfo denied");
        T.ok(!p.allows(new URL("https://github.com:8443/x")), "odd port denied");
        T.ok(!p.allows(new URL("https://192.168.1.5/x")) && !p.allows(new URL("https://localhost/x")), "LAN/localhost denied");
        T.ok(p.mayCarryToken(new URL("https://api.github.com/x")), "token to api.github.com");
        T.ok(!p.mayCarryToken(new URL("https://objects.githubusercontent.com/x")), "token never to CDN");
    }

    // ---------------------------------------------------------------------------------------------
    static void zipSafe() throws Exception {
        T.section("ZipSafe");
        final File w = T.tmpDir("zs");
        File good = T.zip(w, "good.zip", "index.html", "<html>", "js/a.js", "1", "img/b.png", "x");
        ZipSafe.Stats st = ZipSafe.extract(good, new File(w, "out1"), new ZipSafe.Limits());
        T.eq(st.files, 3, "three files extracted");
        T.ok(new File(w, "out1/js/a.js").isFile(), "nested file present");
        final String[] evil = {"../evil.txt", "a/../../evil.txt", "/abs.txt", "a\\b.txt", "C:/x.txt", "ok/./x.txt", "bad.apk", "lib/x.so", "run.sh", "classes.dex"};
        int n = 0;
        for (final String name : evil) {
            final File z = T.zip(w, "e" + (n++) + ".zip", "index.html", "x", name, "boom");
            final File out = new File(w, "oe" + n);
            T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return ZipSafe.extract(z, out, new ZipSafe.Limits()); } }, null, "rejects " + name);
        }
        T.ok(!new File(w, "evil.txt").exists(), "nothing escaped the bundle dir");
        final ZipSafe.Limits tiny = new ZipSafe.Limits();
        tiny.maxFileBytes = 10;
        final File big = T.zip(w, "big.zip", "index.html", "01234567890123456789");
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return ZipSafe.extract(big, new File(w, "ob"), tiny); } }, "too large", "per-file size cap");
        final ZipSafe.Limits few = new ZipSafe.Limits();
        few.maxFiles = 2;
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return ZipSafe.extract(good, new File(w, "of"), few); } }, "too many", "file count cap");
        final ZipSafe.Limits tot = new ZipSafe.Limits();
        tot.maxTotalBytes = 5;
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return ZipSafe.extract(good, new File(w, "ot"), tot); } }, "too large", "total size cap");
    }

    // ---------------------------------------------------------------------------------------------
    static BundleStore.Meta meta(String id, long run) {
        BundleStore.Meta m = new BundleStore.Meta();
        m.id = id;
        m.run = run;
        m.version = "2.9." + run;
        m.commit = "c" + run;
        m.message = "msg " + run + "\nline2";
        m.sha256 = "ab";
        return m;
    }

    static void bundleStore() throws Exception {
        T.section("BundleStore");
        File w = T.tmpDir("bs");
        File root = new File(w, "ota");
        BundleStore s = new BundleStore(root, 5);
        T.eq(s.active(), "builtin", "starts on builtin");
        T.ok(s.activeDir() == null && s.resolve("index.html") == null, "builtin serves nothing from store");
        T.eq(s.stepTarget(-1), null, "no back from builtin");
        T.eq(s.stepTarget(1), null, "no next when empty");

        File z1 = T.zip(w, "1.zip", "index.html", "ONE", "js/x.js", "x1", ".secret", "no");
        File z2 = T.zip(w, "2.zip", "index.html", "TWO");
        File z3 = T.zip(w, "3.zip", "index.html", "THREE");
        File noIndex = T.zip(w, "n.zip", "readme.txt", "x");
        BundleStore.Meta m1 = s.install(z1, meta("web-1", 1));
        T.eq(m1.files, 3, "meta files counted");
        T.ok(m1.size > 0 && m1.installedAt > 0, "meta size/time set");
        T.eq(s.active(), "builtin", "install does not activate");
        s.install(z2, meta("web-2", 2));
        s.install(z3, meta("web-3", 3));
        final BundleStore sf = s;
        final File nz = noIndex;
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return sf.install(nz, meta("web-4", 4)); } }, "index.html", "bundle without index.html rejected");
        T.ok(s.find("web-4") == null && !new File(root, "bundles/web-4").exists(), "failed install leaves nothing behind");
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return sf.install(nz, meta("../x", 4)); } }, "invalid", "bad id rejected");

        s.activate("web-2");
        T.eq(s.active(), "web-2", "activated");
        T.ok(s.isPending(), "new bundle starts pending");
        T.eq(s.snapshot().prev, "builtin", "prev remembered");
        T.eq(new String(T.readAll(s.resolve("/index.html")), "UTF-8"), "TWO", "serves active bundle");
        T.eq(new String(T.readAll(s.resolve("")), "UTF-8"), "TWO", "empty path -> index.html");
        T.ok(s.resolve("../ota/state.properties") == null, "traversal refused");
        T.ok(s.resolve("a/../index.html") == null, "dot-dot segment refused");
        T.ok(s.resolve(".secret") == null, "dotfiles are not served");
        T.ok(s.resolve("missing.js") == null, "missing -> fall back to APK");

        T.eq(s.stepTarget(-1), "web-1", "back goes to older bundle");
        T.eq(s.stepTarget(1), "web-3", "next goes to newer bundle");
        s.markHealthy("web-2");
        T.ok(!s.isPending(), "healthy clears pending");
        T.eq(s.snapshot().lastGood, "web-2", "lastGood recorded");

        // pending bundle that never becomes healthy -> auto rollback after MAX_TRIES
        s.activate("web-3");
        BundleStore.Boot b = s.beginBoot();
        T.ok(!b.rolledBack && s.active().equals("web-3"), "first boot attempt allowed");
        b = s.beginBoot();
        T.ok(!b.rolledBack, "second attempt allowed");
        b = s.beginBoot();
        T.ok(b.rolledBack && b.active.equals("web-2"), "third attempt rolls back to previous working bundle");
        T.ok(s.find("web-3").bad, "failed bundle flagged bad");
        T.ok(s.snapshot().lastRollback.contains("web-3"), "rollback reason recorded");
        T.eq(s.stepTarget(1), null, "bad bundle skipped by next");

        // explicit failure report
        s.activate("web-1");
        T.eq(s.fail("js error"), "web-2", "fail() rolls back to prev");
        T.eq(s.fail("again"), null, "fail() with nothing pending is a no-op");

        // persistence across reopen
        s.markHealthy("web-2");
        BundleStore s2 = new BundleStore(root, 5);
        T.eq(s2.active(), "web-2", "active survives reopen");
        T.eq(s2.snapshot().history.size(), 3, "history survives reopen");
        T.ok(s2.find("web-3").bad, "bad flag survives reopen");
        T.eq(s2.find("web-1").message, "msg 1 line2", "multi-line message flattened");

        // removal rules
        final BundleStore sr = s2;
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { sr.remove("web-2"); return null; } }, "in use", "cannot remove active bundle");
        s2.remove("web-3");
        T.ok(s2.find("web-3") == null && !new File(root, "bundles/web-3").exists(), "removed from disk");

        // go back to builtin and forth
        s2.activate("builtin");
        T.ok(!s2.isPending() && s2.activeDir() == null, "builtin is never pending");
        T.eq(s2.stepTarget(1), "web-2", "next from builtin skips web-1 (flagged bad by the earlier rollback)");

        // pruning keeps pinned, active and lastGood
        File root3 = new File(w, "ota3");
        BundleStore p = new BundleStore(root3, 3);
        for (int i = 1; i <= 6; i++) p.install(T.zip(w, "p" + i + ".zip", "index.html", "v" + i), meta("web-p" + i, i));
        T.eq(p.snapshot().history.size(), 3, "history capped at keep");
        T.ok(p.find("web-p6") != null && p.find("web-p1") == null, "oldest pruned first");
        p.pin("web-p4", true);
        p.activate("web-p5");
        for (int i = 7; i <= 10; i++) p.install(T.zip(w, "p" + i + ".zip", "index.html", "v" + i), meta("web-p" + i, i));
        T.ok(p.find("web-p4") != null, "pinned bundle survives prune");
        T.ok(p.find("web-p5") != null, "active bundle survives prune");

        // a new APK takes the built-in UI back (history is kept)
        File rootU = new File(w, "otaU");
        BundleStore u = new BundleStore(rootU, 5);
        u.install(T.zip(w, "u1.zip", "index.html", "u"), meta("web-u1", 1));
        u.activate("web-u1");
        u.markHealthy("web-u1");
        T.ok(!u.resetIfAppChanged(100), "first run only records the app version");
        T.eq(u.active(), "web-u1", "bundle kept on first record");
        T.ok(!new BundleStore(rootU, 5).resetIfAppChanged(100), "same app version: no reset");
        BundleStore u2 = new BundleStore(rootU, 5);
        T.ok(u2.resetIfAppChanged(101), "app updated: reset reported");
        T.eq(u2.active(), "builtin", "app updated: built-in UI takes over");
        T.eq(u2.snapshot().history.size(), 1, "app updated: history kept");
        T.ok(!new BundleStore(rootU, 5).resetIfAppChanged(101), "no repeated reset");

        // corrupt state file does not brick the app
        File root4 = new File(w, "ota4");
        BundleStore c = new BundleStore(root4, 5);
        c.install(T.zip(w, "c1.zip", "index.html", "c"), meta("web-c1", 1));
        c.activate("web-c1");
        java.nio.file.Files.write(new File(root4, "state.properties").toPath(), new byte[]{0x5c, 0x75, 0x7a});
        BundleStore c2 = new BundleStore(root4, 5);
        T.eq(c2.active(), "builtin", "corrupt state falls back to builtin");
        T.ok(c2.snapshot().lastRollback != null, "corruption reported");

        // missing bundle dir -> builtin
        File root5 = new File(w, "ota5");
        BundleStore d = new BundleStore(root5, 5);
        d.install(T.zip(w, "d1.zip", "index.html", "d"), meta("web-d1", 1));
        d.activate("web-d1");
        d.markHealthy("web-d1");
        ZipSafe.deleteTree(new File(root5, "bundles/web-d1"));
        BundleStore d2 = new BundleStore(root5, 5);
        T.eq(d2.active(), "builtin", "deleted active bundle falls back to builtin");
    }

    // ---------------------------------------------------------------------------------------------
    static void ringLog() throws Exception {
        T.section("RingLog");
        File w = T.tmpDir("rl");
        RingLog log = new RingLog(w, 100, 2000, 2);
        for (int i = 0; i < 150; i++) log.log(RingLog.I, "t", "line " + i);
        for (int i = 0; i < 900; i++) log.log(RingLog.D, "pad", "padding padding padding padding " + i);
        for (int i = 0; i < 150; i++) log.log(RingLog.I, "t", "line " + i);
        T.eq(log.tail(1000, RingLog.D, null).size(), 100, "ring keeps newest 100");
        T.eq(log.tail(1, RingLog.D, null).get(0).msg, "line 149", "tail newest");
        log.log(RingLog.E, "net", "boom");
        log.log(RingLog.W, "net", "careful");
        T.eq(log.tail(10, RingLog.W, null).size(), 2, "level filter");
        T.eq(log.tail(10, RingLog.D, "net").size(), 2, "tag filter");
        T.eq(log.counters().get("log.errors"), Long.valueOf(1), "error counter");
        T.ok(new File(w, "nino.log.1").exists(), "file rotated at size cap");
        String s = RingLog.scrub("Authorization: Bearer abcdefghijklmnop1234 and ghp_abcdefghijklmnopqrstuvwxyz0123 and key=AIzaSyA1234567890123456789012345678901 token=zzzzzzzzzz sk-abcdefghijklmnopqrst");
        T.ok(!s.contains("abcdefghijklmnop1234") && !s.contains("ghp_abc") && !s.contains("AIzaSy") && !s.contains("zzzzzzzzzz") && !s.contains("sk-abc"), "secrets scrubbed: " + s);
        log.log(RingLog.I, "x", "pushed with github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz");
        T.ok(!log.export(5).contains("github_pat_11"), "scrub applies before storing");
        T.ok(log.lastCrash() == null, "no crash yet");
        File f = log.writeCrash("test", new RuntimeException("kaput"), "ver=1");
        T.ok(f != null && f.isFile(), "crash file written");
        String c = log.lastCrash();
        T.ok(c != null && c.contains("kaput") && c.contains("last log lines"), "crash report content");
        log.incr("a", 5);
        T.eq(log.counters().get("a"), Long.valueOf(5), "counter add");
        for (int i = 0; i < 8; i++) { Thread.sleep(2); log.writeCrash("x", null, null); }
        int crashes = 0;
        for (File x : w.listFiles()) if (x.getName().startsWith("crash-")) crashes++;
        T.ok(crashes <= 5, "crash files pruned to 5 (" + crashes + ")");
    }

    // ---------------------------------------------------------------------------------------------
    static void shell() throws Exception {
        T.section("Shell");
        File w = T.tmpDir("sh");
        final Shell sh = new Shell(new File(w, "home"), new File(w, "tmp"), "/bin/sh", 2);
        Shell.ExecResult r = sh.exec("echo hello; echo err 1>&2; exit 3", 5000, 4096);
        T.eq(r.code, 3, "exec exit code");
        T.ok(r.out.contains("hello") && r.out.contains("err"), "stdout and stderr merged");
        r = sh.exec("pwd", 5000, 4096);
        T.ok(r.out.trim().endsWith("/home"), "starts in HOME: " + r.out.trim());
        r = sh.exec("sleep 5", 700, 4096);
        T.ok(r.timedOut, "timeout kills the command");
        r = sh.exec("yes | head -c 100000", 5000, 2048);
        T.ok(r.truncated && r.out.length() <= 2048, "output capped");
        r = sh.exec("echo $HOME $TERM", 5000, 4096);
        T.ok(r.out.contains("/home") && r.out.contains("dumb"), "environment set");

        final StringBuilder got = new StringBuilder();
        final Object lock = new Object();
        Shell.Session s = sh.open(new Shell.Sink() {
            public void onOutput(String sid, String d) { synchronized (lock) { got.append(d); lock.notifyAll(); } }
            public void onExit(String sid, int code) { synchronized (lock) { got.append("<exit ").append(code).append('>'); lock.notifyAll(); } }
        });
        s.write("cd /tmp\n");
        s.write("echo MARK1:$(pwd)\n");
        s.write("X=42\n");
        s.write("echo MARK2:$X\n");
        waitFor(got, lock, "MARK2:42");
        T.ok(got.toString().contains("MARK1:/tmp"), "session keeps cwd between lines");
        T.ok(got.toString().contains("MARK2:42"), "session keeps variables between lines");
        T.ok(s.backlog().contains("MARK1"), "backlog replay available");
        s.write("this_command_does_not_exist_xyz\n");
        s.write("echo STILL_ALIVE\n");
        waitFor(got, lock, "STILL_ALIVE");
        T.ok(got.toString().contains("STILL_ALIVE"), "session survives a failing command");
        Shell.Session s2 = sh.open(null);
        T.eq(sh.list().size(), 2, "two sessions listed");
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return sh.open(null); } }, "too many", "session limit enforced");
        s2.kill();
        s.write("exit 7\n");
        waitFor(got, lock, "<exit 7>");
        T.ok(got.toString().contains("<exit 7>"), "exit reported");
        T.ok(!s.alive(), "session marked dead");
        sh.killAll();

        String[] bad = {"rm -rf /", "rm -rf /*", "rm -fr ~", "rm -r $HOME", "ls; rm -rf /data/data/app.nino", "echo hi && rm -Rf /sdcard", "mkfs.ext4 /dev/x",
            "dd if=/dev/zero of=/dev/block/sda", "reboot", "su -c id", "pm uninstall app.nino", "pm clear app.nino", "am force-stop app.nino",
            "x | /system/bin/rm -rf /", ":(){ :|:& };:", "rm --recursive --force /"};
        for (String b : bad) T.ok(Shell.dangerous(b) != null, "flags: " + b);
        String[] fine = {"ls -la", "rm -rf build", "rm -rf ./tmp/cache", "rm file.txt", "cat /proc/cpuinfo", "echo reboot", "grep -r su .", "rm -rf $HOME/tmp",
            "pm list packages", "am start -n x/y", "dd if=/dev/zero of=./f bs=1k count=1", "git status"};
        for (String g : fine) T.ok(Shell.dangerous(g) == null, "allows: " + g);
    }

    static void waitFor(StringBuilder b, Object lock, String needle) throws InterruptedException {
        long end = System.currentTimeMillis() + 6000;
        synchronized (lock) {
            while (b.indexOf(needle) < 0 && System.currentTimeMillis() < end) lock.wait(200);
        }
    }

    // ---------------------------------------------------------------------------------------------
    /** Throwaway PKCS12 keystore made with keytool; signing goes through the same script CI uses. */
    static final class Keys {
        File dir;
        File p12;
        byte[] certDer;
        final Map<String, String> env = new HashMap<String, String>();

        static Keys make(String alias) throws Exception {
            Keys k = new Keys();
            k.dir = T.tmpDir("keys");
            k.p12 = new File(k.dir, alias + ".p12");
            k.env.put("NINO_KS_PASS", "correct-horse-battery-staple-" + alias);
            T.run(k.dir, k.env, "keytool", "-genkeypair", "-keystore", k.p12.getPath(), "-storetype", "PKCS12", "-alias", alias,
                "-keyalg", "RSA", "-keysize", "2048", "-validity", "3650", "-storepass:env", "NINO_KS_PASS", "-keypass:env", "NINO_KS_PASS",
                "-dname", "CN=NINO Test");
            File cer = new File(k.dir, alias + ".der");
            T.run(k.dir, k.env, "keytool", "-exportcert", "-keystore", k.p12.getPath(), "-alias", alias, "-storepass:env", "NINO_KS_PASS", "-file", cer.getPath());
            k.certDer = T.readAll(cer);
            return k;
        }

        File sign(File data) throws Exception {
            File sig = new File(data.getPath() + ".sig");
            // run through bash: files from a zip or a phone upload have no execute bit (mode 644), so the script cannot be exec-ed directly
            T.run(dir, env, "bash", Keys.script().getPath(), p12.getPath(), data.getPath(), sig.getPath());
            return sig;
        }

        static File script() {
            File f = new File("../tools/ci/sign-file.sh");
            if (!f.isFile()) f = new File("../../tools/ci/sign-file.sh");
            if (!f.isFile()) f = new File(System.getProperty("nino.root", "."), "tools/ci/sign-file.sh");
            return f.getAbsoluteFile();
        }
    }
}
