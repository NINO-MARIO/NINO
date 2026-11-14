// Fallback launcher for machines that have a JRE with the jdk.compiler module but no javac binary.
import javax.tools.JavaCompiler;
import javax.tools.ToolProvider;

public class Javac {
    public static void main(String[] args) {
        JavaCompiler c = ToolProvider.getSystemJavaCompiler();
        if (c == null) {
            System.err.println("no Java compiler available");
            System.exit(2);
        }
        System.exit(c.run(null, null, null, args));
    }
}
