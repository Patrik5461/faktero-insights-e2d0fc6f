package sk.faktero.drivedetector.core;

import java.util.ArrayList;
import java.util.List;

/** Rozpracovaná alebo ukončená jazda držaná v pluginu, kým si ju appka neprevezme. */
public final class BufferedTrip {
    public final String id;
    public final double startedAt;
    public Double endedAt;
    public final List<TripPoint> points;
    public double distanceMeters;
    public double maxSpeedKmh;
    public Classification classification;
    /** Jazdu spustil človek tlačidlom, nie detekcia. */
    public final boolean manual;

    public BufferedTrip(String id, double startedAt, boolean manual) {
        this(id, startedAt, null, new ArrayList<>(), 0, 0, null, manual);
    }

    public BufferedTrip(
            String id,
            double startedAt,
            Double endedAt,
            List<TripPoint> points,
            double distanceMeters,
            double maxSpeedKmh,
            Classification classification,
            boolean manual) {
        this.id = id;
        this.startedAt = startedAt;
        this.endedAt = endedAt;
        this.points = points != null ? points : new ArrayList<>();
        this.distanceMeters = distanceMeters;
        this.maxSpeedKmh = maxSpeedKmh;
        this.classification = classification;
        this.manual = manual;
    }

    /**
     * Priemer sa počíta z prejdenej vzdialenosti a času, nie z priemeru
     * nameraných rýchlostí — merania chodia nepravidelne (filter na 30 m),
     * takže ich priemer by nadhodnocoval rýchlu časť jazdy.
     */
    public double avgSpeedKmh() {
        double koniec = endedAt != null
                ? endedAt
                : (points.isEmpty() ? startedAt : points.get(points.size() - 1).timestamp);
        double trvanie = koniec - startedAt;
        if (trvanie <= 0) return 0;
        return distanceMeters / trvanie * 3.6;
    }
}
