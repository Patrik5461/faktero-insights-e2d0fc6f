package sk.faktero.drivedetector.core;

import java.util.List;

public final class Distance {
    /** Polomer Zeme v metroch (stredný). */
    private static final double POLOMER_ZEME = 6_371_000d;

    private Distance() {}

    /**
     * Haversine. `Location.distanceBetween` by bol presnejší, ale ten sem
     * nesmie — jadro musí ísť otestovať bez tried Androidu.
     */
    public static double meters(TripPoint a, TripPoint b) {
        double toRad = Math.PI / 180d;
        double dLat = (b.lat - a.lat) * toRad;
        double dLng = (b.lng - a.lng) * toRad;
        double lat1 = a.lat * toRad;
        double lat2 = b.lat * toRad;
        double h = Math.pow(Math.sin(dLat / 2), 2)
                + Math.pow(Math.sin(dLng / 2), 2) * Math.cos(lat1) * Math.cos(lat2);
        return 2 * POLOMER_ZEME * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    /**
     * Nad touto rýchlosťou to už nie je jazda, ale skok polohy.
     *
     * GPS v meste, v tuneli alebo pri chytaní signálu občas hodí polohu
     * o stovky metrov vedľa. Taký úsek sa nesmie započítať ani do kilometrov,
     * ani do najvyššej rýchlosti. Rovnaká hranica je v appke aj v jadre pre iOS.
     */
    public static final double MAX_ROZUMNA_KMH = 250d;

    /** Je úsek medzi dvoma bodmi vôbec možný? Bez času sa to posúdiť nedá, započíta sa. */
    public static boolean verohodny(TripPoint a, TripPoint b) {
        double sekundy = b.timestamp - a.timestamp;
        if (sekundy <= 0) return true;
        return meters(a, b) / sekundy * 3.6 <= MAX_ROZUMNA_KMH;
    }

    /** Dĺžka úseku, ktorá sa pripočíta k jazde — skok polohy je nula. */
    public static double usek(TripPoint a, TripPoint b) {
        return verohodny(a, b) ? meters(a, b) : 0;
    }

    /** Súčet vzdialeností medzi po sebe idúcimi bodmi, bez skokov polohy. */
    public static double total(List<TripPoint> points) {
        if (points == null || points.size() < 2) return 0;
        double spolu = 0;
        for (int i = 1; i < points.size(); i++) spolu += usek(points.get(i - 1), points.get(i));
        return spolu;
    }

    /** Najvyššia nameraná rýchlosť; nezmysly nad hranicou sa nepočítajú. */
    public static double maxSpeed(List<TripPoint> points) {
        double max = 0;
        if (points == null) return 0;
        for (TripPoint p : points) {
            if (p.speedKmh <= MAX_ROZUMNA_KMH) max = Math.max(max, p.speedKmh);
        }
        return max;
    }
}
