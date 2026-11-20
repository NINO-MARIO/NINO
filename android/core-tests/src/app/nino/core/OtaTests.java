package app.nino.core;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.atomic.AtomicBoolean;

/** End-to-end OTA tests against a local HTTP server (redirects, signatures, tampering, compatibility). */
final class OtaTests {

    static final class Route {
        int status = 200;
        byte[] body = new byte[0];
        String location;
    }

    static final class Server implements HttpHandler {
        final HttpServer http;
        final Map<String, Route> routes = new LinkedHashMap<String, Route>();
        final Map<String, Integer> hits = new LinkedHashMap<String, Integer>();
        final Map<String, String> auth = new LinkedHashMap<String, String>();

        Server() throws IOException {
            http = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            http.createContext("/", this);
            http.start();
        }

        int port() {
            return http.getAddress().getPort();
        }

        void put(String path, byte[] body) {
            Route r = new Route();
            r.body = body;
            routes.put(path, r);
        }

        void redirect(String path, String to) {
            Route r = new Route();
            r.status = 302;
            r.location = to;
            routes.put(path, r);
        }

        public void handle(HttpExchange ex) throws IOException {
            String p = ex.getRequestURI().getRawPath();
            synchronized (this) {
                Integer h = hits.get(p);
                hits.put(p, h == null ? 1 : h + 1);
                auth.put(p, ex.getRequestHeaders().getFirst("Authorization"));
            }
            Route r = routes.get(p);
            if (r == null) {
                ex.sendResponseHeaders(404, -1);
                ex.close();
                return;
            }
            if (r.location != null) ex.getResponseHeaders().add("Location", r.location);
            if (r.status >= 300 && r.status < 400) {
                ex.sendResponseHeaders(r.status, -1);
                ex.close();
                return;
            }
            ex.sendResponseHeaders(r.status, r.body.length == 0 ? -1 : r.body.length);
            if (r.body.length > 0) {
                OutputStream os = ex.getResponseBody();
                os.write(r.body);
                os.close();
            }
            ex.close();
        }

        synchronized int hits(String p) {
            Integer h = hits.get(p);
            return h == null ? 0 : h;
        }

        void stop() {
            http.stop(0);
        }
    }

    // fixtures ---------------------------------------------------------------------------------
    static Server srv;
    static File work;
    static UnitTests.Keys keys, other;

    static byte[] bytes(String s) throws Exception {
        return s.getBytes("UTF-8");
    }

    /** Publishes release `tag` the way CI does. signer==null -> no signature file. */
    static File publish(String tag, long run, int minBridge, UnitTests.Keys signer, boolean tamperZip, String... files) throws Exception {
        File z = T.zip(work, tag + ".zip", files);
        byte[] zb = T.readAll(z);
        Map<String, Object> zi = new LinkedHashMap<String, Object>();
        zi.put("name", "web-bundle.zip");
        zi.put("size", Long.valueOf(zb.length));
        zi.put("sha256", Trust.sha256Hex(zb));
        Map<String, Object> bj = new LinkedHashMap<String, Object>();
        bj.put("schema", Long.valueOf(1));
        bj.put("id", tag);
        bj.put("version", "2.9." + run);
        bj.put("commit", "deadbeef" + run);
        bj.put("message", "build " + run);
        bj.put("builtAt", "2026-11-06T00:00:00Z");
        bj.put("run", Long.valueOf(run));
        bj.put("minBridge", Long.valueOf(minBridge));
        bj.put("zip", zi);
        return publishRaw(tag, bj, zb, signer, tamperZip);
    }

    static File publishRaw(String tag, Map<String, Object> bj, byte[] zb, UnitTests.Keys signer, boolean tamperZip) throws Exception {
        byte[] served = zb.clone();
        if (tamperZip) served[served.length / 2] ^= 0x55;
        srv.put("/dl/" + tag + "/web-bundle.zip", new byte[0]);
        srv.redirect("/dl/" + tag + "/web-bundle.zip", "/cdn/" + tag + ".zip");
        srv.put("/cdn/" + tag + ".zip", served);
        byte[] json = bytes(MiniJson.write(bj));
        srv.put("/dl/" + tag + "/bundle.json", json);
        File jf = new File(work, tag + ".bundle.json");
        java.nio.file.Files.write(jf.toPath(), json);
        if (signer != null) srv.put("/dl/" + tag + "/bundle.json.sig", T.readAll(signer.sign(jf)));
        return jf;
    }

    static OtaCore core(BundleStore store, boolean requireSig, UnitTests.Keys trust, int bridge, String token) throws Exception {
        OtaCore.Config c = new OtaCore.Config();
        c.repo = "someone/nino-app";
        c.assetBase = "http://127.0.0.1:" + srv.port() + "/dl/%s/";
        c.apiBase = "http://127.0.0.1:" + srv.port() + "/api";
        c.work = new File(work, "dl-work");
        c.store = store;
        c.fetcher = new Fetcher(HostPolicy.loopbackForTests(), "NINO-test", 3000, 5000);
        c.certDer = trust == null ? null : trust.certDer;
        c.requireSignature = requireSig;
        c.bridgeApi = bridge;
        c.token = token;
        return new OtaCore(c);
    }

    static void all() throws Exception {
        T.section("OTA end-to-end (local server)");
        work = T.tmpDir("ota");
        srv = new Server();
        keys = UnitTests.Keys.make("nino");
        other = UnitTests.Keys.make("attacker");
        try {
            run();
        } finally {
            srv.stop();
        }
    }

    static void run() throws Exception {
        final BundleStore store = new BundleStore(new File(work, "store"), 8);
        final OtaCore signed = core(store, true, keys, 1, null);

        publish("web-r1", 1, 1, keys, false, "index.html", "<h1>R1</h1>", "js/app.js", "console.log(1)");
        final List<String> phases = new ArrayList<String>();
        BundleStore.Meta m = signed.install("web-r1", false, new OtaCore.Events() {
            public void progress(String ph, long d, long t) { if (!phases.contains(ph)) phases.add(ph); }
        }, null);
        T.eq(m.id, "web-r1", "signed bundle installed");
        T.ok(m.signed, "marked signed");
        T.eq(m.sha256.length(), 64, "sha recorded");
        T.ok(phases.contains("verify") && phases.contains("download") && phases.contains("hash") && phases.contains("unpack") && phases.contains("done"), "progress phases reported: " + phases);
        T.eq(store.activeDir(), null, "installing does not activate");
        store.activate("web-r1");
        T.eq(new String(T.readAll(store.resolve("index.html")), "UTF-8"), "<h1>R1</h1>", "installed content served");
        int zipHits = srv.hits("/cdn/web-r1.zip");
        T.ok(zipHits == 1, "zip fetched through the 302 redirect");
        store.markHealthy("web-r1");
        signed.install("web-r1", false, null, null);
        T.eq(srv.hits("/cdn/web-r1.zip"), 1, "re-install of same hash is a no-op (no second download)");

        // tampering: same size, different bytes
        publish("web-t1", 2, 1, keys, true, "index.html", "<h1>T</h1>");
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return signed.install("web-t1", false, null, null); } }, "sha256 mismatch", "tampered zip refused");
        T.ok(store.find("web-t1") == null, "tampered bundle not stored");
        T.ok(!new File(work, "dl-work/web-t1.zip.part").exists(), "partial download cleaned up");

        // signature policy
        publish("web-s0", 3, 1, null, false, "index.html", "x");
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return signed.install("web-s0", false, null, null); } }, "signature", "unsigned refused when signature required");
        publish("web-s1", 3, 1, other, false, "index.html", "x");
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return signed.install("web-s1", false, null, null); } }, "signature", "bundle signed by someone else refused");
        final OtaCore lenient = core(store, false, keys, 1, null);
        BundleStore.Meta u = lenient.install("web-s0", true, null, null);
        T.ok(!u.signed, "unsigned bundle accepted only in lenient (debug) mode and flagged unsigned");
        BundleStore.Meta u2 = lenient.install("web-s1", true, null, null);
        T.ok(!u2.signed, "bad signature in lenient mode is flagged unsigned");
        final OtaCore noCert = core(store, true, null, 1, null);
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return noCert.install("web-r1", true, null, null); } }, "certificate", "required signature without certificate fails closed");

        // compatibility + downgrade protection
        publish("web-b9", 4, 9, keys, false, "index.html", "x");
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return signed.install("web-b9", false, null, null); } }, "newer app", "bundle needing a newer bridge refused");
        try {
            signed.install("web-b9", false, null, null);
        } catch (OtaCore.IncompatibleException e) {
            T.ok(true, "IncompatibleException type");
        }
        publish("web-r5", 5, 1, keys, false, "index.html", "five");
        signed.install("web-r5", false, null, null);
        store.activate("web-r5");
        store.markHealthy("web-r5");
        publish("web-r2", 2, 1, keys, false, "index.html", "two");
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return signed.install("web-r2", false, null, null); } }, "older", "older build refused by default");
        T.ok(signed.install("web-r2", true, null, null) != null, "older build allowed when user picks it explicitly");

        // malformed metadata
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return signed.fetchInfo("evil"); } }, "bad bundle tag", "tag must start with web-");
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return signed.fetchInfo("web-../x"); } }, "bad bundle tag", "tag traversal refused");
        T.eq(signed.fetchInfo("web-nope"), null, "missing release -> null");
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return signed.install("web-nope", false, null, null); } }, "not found", "install of missing release fails");
        Map<String, Object> bad = new LinkedHashMap<String, Object>();
        bad.put("schema", Long.valueOf(1)); bad.put("id", "web-other");
        publishRaw("web-idmix", bad, bytes("zz"), keys, false);
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return signed.fetchInfo("web-idmix"); } }, "does not match", "id must equal tag");
        Map<String, Object> zn = new LinkedHashMap<String, Object>();
        Map<String, Object> zi = new LinkedHashMap<String, Object>();
        zi.put("name", "../evil.zip"); zi.put("size", Long.valueOf(10)); zi.put("sha256", Trust.sha256Hex(bytes("a")));
        zn.put("schema", Long.valueOf(1)); zn.put("id", "web-zname"); zn.put("zip", zi);
        publishRaw("web-zname", zn, bytes("zz"), keys, false);
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return signed.fetchInfo("web-zname"); } }, "zip name", "zip name must be a plain file name");
        zi.put("name", "web-bundle.zip"); zi.put("size", Long.valueOf(OtaCore.MAX_ZIP + 1)); zn.put("id", "web-huge");
        publishRaw("web-huge", zn, bytes("zz"), keys, false);
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return signed.fetchInfo("web-huge"); } }, "size", "oversized bundle refused before download");

        // latest pointer + release listing
        srv.put("/dl/web-latest/latest.json", bytes("{\"tag\":\"web-r5\",\"commit\":\"deadbeef5\",\"version\":\"2.9.5\",\"run\":5}"));
        T.eq(MiniJson.str(signed.latestPointer(), "tag", ""), "web-r5", "latest pointer read");
        srv.put("/dl/web-latest/latest.json", bytes("{\"tag\":\"../../x\"}"));
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return signed.latestPointer(); } }, "bad tag", "latest pointer with bad tag refused");
        srv.put("/api/releases", bytes("[{\"tag_name\":\"web-r5\",\"name\":\"R5\",\"published_at\":\"2026-11-06T00:00:00Z\"},{\"tag_name\":\"web-latest\"},{\"tag_name\":\"nino-latest\"},{\"tag_name\":\"web-d\",\"draft\":true},{\"tag_name\":\"web-r9\",\"name\":\"R9\"}]"));
        List<Map<String, Object>> rem = signed.remote();
        T.eq(rem.size(), 2, "remote list keeps only real web-* releases");
        T.eq(rem.get(0).get("installed"), Boolean.TRUE, "installed flag");
        T.eq(rem.get(1).get("installed"), Boolean.FALSE, "not-installed flag");

        // APK download
        byte[] apk = new byte[50000];
        for (int i = 0; i < apk.length; i++) apk[i] = (byte) (i * 31);
        Map<String, Object> ai = new LinkedHashMap<String, Object>();
        ai.put("schema", Long.valueOf(1)); ai.put("size", Long.valueOf(apk.length)); ai.put("sha256", Trust.sha256Hex(apk)); ai.put("versionCode", Long.valueOf(3001));
        srv.put("/dl/nino-latest/apk.json", bytes(MiniJson.write(ai)));
        srv.put("/dl/nino-latest/NINO.apk", apk);
        Map<String, Object> info = signed.apkInfo();
        T.eq(MiniJson.num(info, "versionCode", 0), 3001L, "apk.json read");
        File got = signed.downloadApk(info, null, null);
        T.eq(Trust.sha256Hex(got), Trust.sha256Hex(apk), "apk downloaded intact");
        got.delete();
        ai.put("sha256", Trust.sha256Hex(bytes("different")));
        srv.put("/dl/nino-latest/apk.json", bytes(MiniJson.write(ai)));
        final Map<String, Object> badInfo = signed.apkInfo();
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return signed.downloadApk(badInfo, null, null); } }, "sha256", "apk with wrong hash refused");
        T.ok(!new File(work, "dl-work/NINO-update.apk").exists(), "bad apk deleted");

        fetcher();
    }

    static void fetcher() throws Exception {
        T.section("Fetcher");
        final Fetcher f = new Fetcher(HostPolicy.loopbackForTests(), "NINO-test", 3000, 5000);
        String base = "http://127.0.0.1:" + srv.port();
        srv.put("/big", new byte[10000]);
        final String bigUrl = base + "/big";
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return f.getBytes(bigUrl, 1000, null, null); } }, "too large", "getBytes honours size cap");
        final File dest = new File(work, "big.bin");
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return f.download(bigUrl, dest, 1000, null, null, null); } }, "too large", "download honours size cap");
        T.ok(!dest.exists(), "oversized download removed");
        T.eq(Long.valueOf(f.download(bigUrl, dest, 20000, null, null, null)), Long.valueOf(10000), "download ok under cap");
        dest.delete();
        srv.redirect("/loop", base + "/loop");
        final String loopUrl = base + "/loop";
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return f.getBytes(loopUrl, 100, null, null); } }, "redirects", "redirect loop stopped");
        srv.redirect("/to-evil", "http://localhost:" + srv.port() + "/big");
        final String evilUrl = base + "/to-evil";
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return f.getBytes(evilUrl, 100, null, null); } }, "blocked host", "redirect to a non-allowlisted host refused");
        srv.redirect("/to-https", "https://evil.example/x");
        final String httpsUrl = base + "/to-https";
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return f.getBytes(httpsUrl, 100, null, null); } }, "blocked host", "redirect to unknown https host refused");
        srv.put("/who", new byte[]{1});
        f.getBytes(base + "/who", 10, "tok123", null);
        T.eq(srv.auth.get("/who"), "Bearer tok123", "token sent to allowed host");
        f.getBytes(base + "/who", 10, null, null);
        T.eq(srv.auth.get("/who"), null, "no token header when none configured");
        Fetcher.Result nf = f.getBytes(base + "/nothing-here", 10, null, null);
        T.eq(nf.status, 404, "404 reported as status");
        final AtomicBoolean cancel = new AtomicBoolean(true);
        final File cdest = new File(work, "cancel.bin");
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return f.download(bigUrl, cdest, 20000, null, null, cancel); } }, "cancelled", "cancel flag aborts download");
        T.ok(!cdest.exists(), "cancelled download removed");
        T.throwsIO(new Callable<Object>() { public Object call() throws Exception { return f.download(base0() + "/nothing-here", cdest, 100, null, null, null); } }, "HTTP 404", "non-200 download throws StatusException");
    }

    static String base0() {
        return "http://127.0.0.1:" + srv.port();
    }
}
