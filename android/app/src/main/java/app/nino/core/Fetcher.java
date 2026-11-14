package app.nino.core;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.atomic.AtomicBoolean;

/** HTTPS downloader: manual redirects (each hop checked against HostPolicy), size caps, progress, cancel. */
public final class Fetcher {

    public interface Progress {
        void on(long done, long total);
    }

    public static final class Result {
        public int status;
        public byte[] body;
        public String finalUrl;
    }

    public static final class StatusException extends IOException {
        public final int status;

        public StatusException(int status, String url) {
            super("HTTP " + status + " " + url);
            this.status = status;
        }
    }

    private static final int MAX_HOPS = 5;

    private final HostPolicy policy;
    private final String userAgent;
    private final int connectMs;
    private final int readMs;

    public Fetcher(HostPolicy policy, String userAgent) {
        this(policy, userAgent, 15000, 30000);
    }

    public Fetcher(HostPolicy policy, String userAgent, int connectMs, int readMs) {
        this.policy = policy;
        this.userAgent = userAgent;
        this.connectMs = connectMs;
        this.readMs = readMs;
    }

    private HttpURLConnection open(String url, String token, String accept, int[] hopOut, String[] finalUrl) throws IOException {
        String cur = url;
        for (int hop = 0; hop <= MAX_HOPS; hop++) {
            URL u = new URL(cur);
            if (!policy.allows(u)) throw new IOException("blocked host: " + u.getHost());
            HttpURLConnection c = (HttpURLConnection) u.openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(connectMs);
            c.setReadTimeout(readMs);
            c.setRequestProperty("User-Agent", userAgent);
            c.setRequestProperty("Accept", accept == null ? "*/*" : accept);
            if (token != null && token.length() > 0 && policy.mayCarryToken(u)) c.setRequestProperty("Authorization", "Bearer " + token);
            int code = c.getResponseCode();
            if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                String loc = c.getHeaderField("Location");
                c.disconnect();
                if (loc == null) throw new IOException("redirect without Location");
                cur = new URL(u, loc).toString();
                continue;
            }
            hopOut[0] = code;
            finalUrl[0] = cur;
            return c;
        }
        throw new IOException("too many redirects");
    }

    /** Small downloads (JSON, signatures). Returns status 404 etc. without throwing; other IO problems throw. */
    public Result getBytes(String url, long maxBytes, String token, String accept) throws IOException {
        int[] code = new int[1];
        String[] fin = new String[1];
        HttpURLConnection c = open(url, token, accept, code, fin);
        try {
            Result r = new Result();
            r.status = code[0];
            r.finalUrl = fin[0];
            InputStream in = code[0] >= 200 && code[0] < 300 ? c.getInputStream() : c.getErrorStream();
            if (in == null) {
                r.body = new byte[0];
                return r;
            }
            try {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                long total = 0;
                int n;
                while ((n = in.read(buf)) > 0) {
                    total += n;
                    if (total > maxBytes) throw new IOException("response too large (> " + maxBytes + " bytes)");
                    bo.write(buf, 0, n);
                }
                r.body = bo.toByteArray();
            } finally {
                in.close();
            }
            return r;
        } finally {
            c.disconnect();
        }
    }

    /** Streams a 200 response into dest. Throws StatusException for non-200. Returns bytes written. */
    public long download(String url, File dest, long maxBytes, Progress p, String token, AtomicBoolean cancel) throws IOException {
        int[] code = new int[1];
        String[] fin = new String[1];
        HttpURLConnection c = open(url, token, "application/octet-stream", code, fin);
        try {
            if (code[0] != 200) throw new StatusException(code[0], url);
            long total = c.getContentLengthLong();
            if (total > maxBytes) throw new IOException("file too large: " + total);
            File parent = dest.getParentFile();
            if (parent != null) parent.mkdirs();
            long done = 0;
            InputStream in = c.getInputStream();
            OutputStream out = new FileOutputStream(dest);
            boolean ok = false;
            try {
                byte[] buf = new byte[32768];
                int n;
                long lastTick = 0;
                while ((n = in.read(buf)) > 0) {
                    if (cancel != null && cancel.get()) throw new IOException("cancelled");
                    done += n;
                    if (done > maxBytes) throw new IOException("file too large (> " + maxBytes + " bytes)");
                    out.write(buf, 0, n);
                    long now = System.currentTimeMillis();
                    if (p != null && now - lastTick > 150) {
                        lastTick = now;
                        p.on(done, total);
                    }
                }
                if (total >= 0 && done != total) throw new IOException("truncated download (" + done + "/" + total + ")");
                out.flush();
                ok = true;
            } finally {
                try { out.close(); } catch (IOException ignore) { }
                in.close();
                if (!ok) dest.delete();
            }
            if (p != null) p.on(done, total >= 0 ? total : done);
            return done;
        } finally {
            c.disconnect();
        }
    }
}
