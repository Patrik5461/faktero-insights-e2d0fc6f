package sk.faktero.drivedetector.core;

/**
 * Čo má obslužná vrstva spraviť. Motor sám nesiaha na hardvér ani na úložisko —
 * vracia len zoznam úkonov, takže sa celé správanie dá prejsť v testoch.
 */
public final class DetectorEffect {
    public enum Druh {
        START_PRECISE_UPDATES,
        STOP_PRECISE_UPDATES,
        START_MOTION_UPDATES,
        STOP_MOTION_UPDATES,
        TRIP_STARTED,
        POINT_APPENDED,
        TRIP_ENDED,
        BUFFER_DISCARDED
    }

    public final Druh druh;
    public final BufferedTrip trip;
    public final TripPoint point;
    public final String tripId;
    /** `false` pri ručne spustenej jazde — kto stlačil tlačidlo, otázku nepotrebuje. */
    public final boolean notify;

    private DetectorEffect(Druh druh, BufferedTrip trip, TripPoint point, String tripId, boolean notify) {
        this.druh = druh;
        this.trip = trip;
        this.point = point;
        this.tripId = tripId;
        this.notify = notify;
    }

    public static DetectorEffect jednoduchy(Druh druh) {
        return new DetectorEffect(druh, null, null, null, false);
    }

    public static DetectorEffect tripStarted(BufferedTrip trip, boolean notify) {
        return new DetectorEffect(Druh.TRIP_STARTED, trip, null, trip.id, notify);
    }

    public static DetectorEffect pointAppended(String tripId, TripPoint point) {
        return new DetectorEffect(Druh.POINT_APPENDED, null, point, tripId, false);
    }

    public static DetectorEffect tripEnded(BufferedTrip trip) {
        return new DetectorEffect(Druh.TRIP_ENDED, trip, null, trip.id, false);
    }

    @Override
    public String toString() {
        return druh.name() + (tripId != null ? "(" + tripId + ")" : "");
    }
}
