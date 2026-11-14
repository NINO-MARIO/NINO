package app.nino.core;

public final class TestMain {
    public static void main(String[] args) throws Exception {
        long t0 = System.currentTimeMillis();
        UnitTests.all();
        OtaTests.all();
        System.out.println();
        System.out.println("passed " + T.pass + ", failed " + T.fail + " in " + (System.currentTimeMillis() - t0) + " ms");
        System.exit(T.fail == 0 ? 0 : 1);
    }
}
