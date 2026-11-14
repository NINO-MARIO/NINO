package app.nino.core;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.Map;

/**
 * CI self-check: verifies a freshly built dist/ with the same classes the phone uses
 * (signature -> size -> sha256 -> safe unzip -> index.html -> build-info matches).
 * usage: VerifyBundle DIST_DIR [CERT.der | none]
 */
public final class VerifyBundle {

    public static void main(String[] a) throws Exception {
        File dist = new File(a[0]);
        byte[] cert = a.length > 1 && !"none".equals(a[1]) ? Files.readAllBytes(new File(a[1]).toPath()) : null;
        try {
            run(dist, cert);
            System.out.println("VERIFY OK " + dist);
        } catch (IOException e) {
            System.out.println("VERIFY FAILED: " + e.getMessage());
            System.exit(1);
        }
    }

    static void run(File dist, byte[] cert) throws IOException {
        byte[] json = Files.readAllBytes(new File(dist, "bundle.json").toPath());
        File sigf = new File(dist, "bundle.json.sig");
        if (cert != null) {
            if (!sigf.isFile()) throw new IOException("bundle.json.sig is missing but a certificate was given");
            if (!Trust.verify(cert, json, Files.readAllBytes(sigf.toPath()))) throw new IOException("signature does not verify against the app certificate");
            System.out.println("  signature: valid");
        } else {
            System.out.println("  signature: skipped (unsigned build)");
        }
        Map<String, Object> m = MiniJson.parseObject(new String(json, OtaCore.UTF8));
        if (MiniJson.num(m, "schema", 0) != 1) throw new IOException("schema must be 1");
        String id = MiniJson.str(m, "id", "");
        if (!BundleStore.validId(id) || !id.startsWith("web-")) throw new IOException("bad id " + id);
        Map<String, Object> z = MiniJson.map(m, "zip");
        File zip = new File(dist, MiniJson.str(z, "name", "?"));
        if (!zip.isFile()) throw new IOException("zip not found: " + zip);
        if (zip.length() != MiniJson.num(z, "size", -1)) throw new IOException("size mismatch");
        if (zip.length() > OtaCore.MAX_ZIP) throw new IOException("zip larger than the app accepts (" + OtaCore.MAX_ZIP + ")");
        if (!Trust.sameHex(Trust.sha256Hex(zip), MiniJson.str(z, "sha256", ""))) throw new IOException("sha256 mismatch");
        System.out.println("  zip: " + zip.length() + " bytes, sha256 ok");
        File tmp = Files.createTempDirectory("verify").toFile();
        try {
            ZipSafe.Stats st = ZipSafe.extract(zip, new File(tmp, "x"), new ZipSafe.Limits());
            System.out.println("  unpack: " + st.files + " files, " + st.bytes + " bytes");
            File idx = new File(tmp, "x/index.html");
            if (!idx.isFile()) throw new IOException("index.html missing at bundle root");
            File bi = new File(tmp, "x/build-info.json");
            if (!bi.isFile()) throw new IOException("build-info.json missing");
            Map<String, Object> info = MiniJson.parseObject(new String(Files.readAllBytes(bi.toPath()), OtaCore.UTF8));
            if (!MiniJson.str(info, "commit", "").equals(MiniJson.str(m, "commit", ""))) throw new IOException("build-info.json commit differs from bundle.json");
            if (!id.equals("web-" + MiniJson.str(m, "commit", "").substring(0, 7))) throw new IOException("id does not match the commit");
        } finally {
            ZipSafe.deleteTree(tmp);
        }
    }
}
