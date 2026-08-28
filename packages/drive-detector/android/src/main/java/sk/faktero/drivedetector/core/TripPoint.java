package sk.faktero.drivedetector.core;

/** Bod trasy. To isté, čo `Fix`, len už prijaté do jazdy. */
public final class TripPoint {
    public final double lat;
    public final double lng;
    public final double speedKmh;
    public final double accuracy;
    public final Double altitude;
    public final double timestamp;

    public TripPoint(double lat, double lng, double speedKmh, double accuracy, Double altitude, double timestamp) {
        this.lat = lat;
        this.lng = lng;
        this.speedKmh = speedKmh;
        this.accuracy = accuracy;
        this.altitude = altitude;
        this.timestamp = timestamp;
    }

    public TripPoint(Fix fix) {
        this(fix.lat, fix.lng, fix.speedKmh, fix.accuracy, fix.altitude, fix.timestamp);
    }
}
