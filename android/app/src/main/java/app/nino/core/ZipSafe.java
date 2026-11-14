package app.nino.core;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** Extracts a web bundle zip while refusing path traversal, executables and oversized content. */
public final class ZipSafe {

    public static final class Limits {
        public int maxFiles = 4000;
        public long maxFileBytes = 64L << 20;
        public long maxTotalBytes = 200L << 20;
    }

    public static final class Stats {
        public int files;
        public long bytes;
    }

    private ZipSafe() {}

    private static boolean badName(String n) {
        if (n.length() == 0 || n.length() > 240) return true;
        if (n.indexOf('\\') >= 0 || n.indexOf('\0') >= 0 || n.indexOf(':') >= 0) return true;
        if (n.charAt(0) == '/') return true;
        for (String seg : n.split("/", -1)) {
            if (seg.equals("..") || seg.equals(".")) return true;
        }
        return false;
    }

    private static boolean forbiddenExt(String n) {
        String l = n.toLowerCase(Locale.ROOT);
        return l.endsWith(".apk") || l.endsWith(".dex") || l.endsWith(".so") || l.endsWith(".jar") || l.endsWith(".exe") || l.endsWith(".sh");
    }

    public static Stats extract(File zip, File dest, Limits lim) throws IOException {
        if (!dest.mkdirs() && !dest.isDirectory()) throw new IOException("cannot create " + dest);
        String destCanon = dest.getCanonicalPath() + File.separator;
        Stats st = new Stats();
        ZipInputStream zin = new ZipInputStream(new FileInputStream(zip));
        try {
            ZipEntry e;
            byte[] buf = new byte[32768];
            while ((e = zin.getNextEntry()) != null) {
                String name = e.getName();
                boolean dir = e.isDirectory();
                String clean = dir && name.endsWith("/") ? name.substring(0, name.length() - 1) : name;
                if (clean.length() == 0) continue;
                if (badName(clean)) throw new IOException("unsafe path in zip: " + name);
                if (!dir && forbiddenExt(clean)) throw new IOException("forbidden file type in bundle: " + name);
                File out = new File(dest, clean);
                String canon = out.getCanonicalPath();
                if (!(canon + File.separator).startsWith(destCanon)) throw new IOException("path escapes bundle: " + name);
                if (dir) {
                    out.mkdirs();
                    continue;
                }
                if (++st.files > lim.maxFiles) throw new IOException("too many files in bundle");
                File parent = out.getParentFile();
                if (parent != null && !parent.isDirectory() && !parent.mkdirs()) throw new IOException("cannot create dir for " + name);
                OutputStream os = new FileOutputStream(out);
                try {
                    long fileBytes = 0;
                    int n;
                    while ((n = zin.read(buf)) > 0) {
                        fileBytes += n;
                        st.bytes += n;
                        if (fileBytes > lim.maxFileBytes) throw new IOException("file too large in bundle: " + name);
                        if (st.bytes > lim.maxTotalBytes) throw new IOException("bundle too large when unpacked");
                        os.write(buf, 0, n);
                    }
                } finally {
                    os.close();
                }
            }
        } finally {
            zin.close();
        }
        return st;
    }

    /** Recursively deletes a directory tree (no symlink following). */
    public static void deleteTree(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.isDirectory() ? f.listFiles() : null;
        if (kids != null) {
            for (File k : kids) {
                try {
                    if (k.getCanonicalPath().equals(k.getAbsolutePath()) || !isLink(k)) deleteTree(k);
                    else k.delete();
                } catch (IOException ex) {
                    k.delete();
                }
            }
        }
        f.delete();
    }

    private static boolean isLink(File f) {
        try {
            return java.nio.file.Files.isSymbolicLink(f.toPath());
        } catch (Exception e) {
            return false;
        }
    }
}
