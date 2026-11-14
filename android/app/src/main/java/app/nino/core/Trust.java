package app.nino.core;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;

/** Hashing and signature checks. Bundles are signed in CI with the same key that signs the APK. */
public final class Trust {

    private Trust() {}

    public static String hex(byte[] b) {
        char[] d = "0123456789abcdef".toCharArray();
        char[] o = new char[b.length * 2];
        for (int i = 0; i < b.length; i++) {
            o[i * 2] = d[(b[i] >> 4) & 15];
            o[i * 2 + 1] = d[b[i] & 15];
        }
        return new String(o);
    }

    public static String sha256Hex(byte[] data) {
        try {
            return hex(MessageDigest.getInstance("SHA-256").digest(data));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public static String sha256Hex(File f) throws IOException {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            InputStream in = new FileInputStream(f);
            try {
                byte[] buf = new byte[32768];
                int n;
                while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
            } finally {
                in.close();
            }
            return hex(md.digest());
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Length-independent comparison of two hex strings. */
    public static boolean sameHex(String a, String b) {
        if (a == null || b == null || a.length() != b.length()) return false;
        int r = 0;
        for (int i = 0; i < a.length(); i++) r |= Character.toLowerCase(a.charAt(i)) ^ Character.toLowerCase(b.charAt(i));
        return r == 0;
    }

    /** Verifies sig over data using the public key of the DER X.509 certificate (RSA or EC). */
    public static boolean verify(byte[] certDer, byte[] data, byte[] sig) {
        if (certDer == null || data == null || sig == null || sig.length == 0) return false;
        try {
            Certificate c = CertificateFactory.getInstance("X.509").generateCertificate(new ByteArrayInputStream(certDer));
            PublicKey k = c.getPublicKey();
            String alg = "RSA".equals(k.getAlgorithm()) ? "SHA256withRSA" : "EC".equals(k.getAlgorithm()) ? "SHA256withECDSA" : null;
            if (alg == null) return false;
            Signature s = Signature.getInstance(alg);
            s.initVerify(k);
            s.update(data);
            return s.verify(sig);
        } catch (Exception e) {
            return false;
        }
    }

    /** True when both DER certificates are byte-identical. */
    public static boolean sameCert(byte[] a, byte[] b) {
        return a != null && b != null && MessageDigest.isEqual(a, b);
    }
}
