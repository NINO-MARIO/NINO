package app.nino.core;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** Minimal assertion helpers (no JUnit needed so the suite runs anywhere a JDK exists). */
final class T {
    static int pass, fail;

    static void ok(boolean cond, String name) {
        if (cond) {
            pass++;
        } else {
            fail++;
            System.out.println("  FAIL: " + name);
        }
    }

    static void eq(Object a, Object b, String name) {
        boolean same = a == null ? b == null : a.equals(b);
        if (!same) System.out.println("    expected <" + b + "> got <" + a + ">");
        ok(same, name);
    }

    static void throwsIO(Callable<?> c, String contains, String name) {
        try {
            c.call();
            ok(false, name + " (no exception)");
        } catch (Exception e) {
            boolean m = contains == null || String.valueOf(e.getMessage()).contains(contains);
            if (!m) System.out.println("    exception was: " + e);
            ok(m, name);
        }
    }

    static void section(String s) {
        System.out.println("== " + s);
    }

    static File tmpDir(String p) throws IOException {
        File d = java.nio.file.Files.createTempDirectory(p).toFile();
        d.deleteOnExit();
        return d;
    }

    static File zip(File dir, String name, String... kv) throws IOException {
        File f = new File(dir, name);
        ZipOutputStream z = new ZipOutputStream(new FileOutputStream(f));
        try {
            for (int i = 0; i < kv.length; i += 2) {
                z.putNextEntry(new ZipEntry(kv[i]));
                z.write(kv[i + 1].getBytes("UTF-8"));
                z.closeEntry();
            }
        } finally {
            z.close();
        }
        return f;
    }

    static byte[] readAll(File f) throws IOException {
        InputStream in = new java.io.FileInputStream(f);
        try {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] b = new byte[8192];
            int n;
            while ((n = in.read(b)) > 0) bo.write(b, 0, n);
            return bo.toByteArray();
        } finally {
            in.close();
        }
    }

    static String run(File cwd, Map<String, String> env, String... cmd) throws Exception {
        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.directory(cwd);
        pb.redirectErrorStream(true);
        if (env != null) pb.environment().putAll(env);
        Process p = pb.start();
        byte[] out = new byte[0];
        InputStream in = p.getInputStream();
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] b = new byte[4096];
        int n;
        while ((n = in.read(b)) > 0) bo.write(b, 0, n);
        out = bo.toByteArray();
        int code = p.waitFor();
        if (code != 0) throw new IOException(String.join(" ", cmd) + " exited " + code + ": " + new String(out, "UTF-8"));
        return new String(out, "UTF-8");
    }
}
