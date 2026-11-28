package app.nino.core;

import java.net.URL;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/** Which hosts the updater may talk to. Everything else is refused, including every redirect hop. */
public final class HostPolicy {

    private final Set<String> exact;
    private final Set<String> tokenHosts;
    private final boolean plainHttpLoopback;

    private HostPolicy(Set<String> exact, Set<String> tokenHosts, boolean plainHttpLoopback) {
        this.exact = exact;
        this.tokenHosts = tokenHosts;
        this.plainHttpLoopback = plainHttpLoopback;
    }

    public static HostPolicy github() {
        return new HostPolicy(
            new HashSet<String>(Arrays.asList(
                "github.com", "api.github.com", "objects.githubusercontent.com",
                "release-assets.githubusercontent.com", "raw.githubusercontent.com",
                "github-releases.githubusercontent.com", "codeload.github.com")),
            new HashSet<String>(Arrays.asList("github.com", "api.github.com")),
            false);
    }

    /** For unit tests only: allows plain http to 127.0.0.1 and sends the token there too. */
    public static HostPolicy loopbackForTests() {
        Set<String> h = new HashSet<String>(Arrays.asList("127.0.0.1"));
        return new HostPolicy(h, h, true);
    }

    public boolean allows(URL u) {
        if (u == null || u.getHost() == null) return false;
        String host = u.getHost().toLowerCase();
        String proto = u.getProtocol();
        if (u.getUserInfo() != null) return false;
        if (plainHttpLoopback && "http".equals(proto)) return exact.contains(host);
        if (!"https".equals(proto)) return false;
        if (u.getPort() != -1 && u.getPort() != 443) return false;
        return exact.contains(host);
    }

    /** The bearer token is only ever attached to the hosts the user configured it for, never to CDN redirects. */
    public boolean mayCarryToken(URL u) {
        return u != null && u.getHost() != null && tokenHosts.contains(u.getHost().toLowerCase());
    }
}
