package sk.faktero.drivedetector.core;

/**
 * Jedno meranie polohy tak, ako príde zo systému — bez tried z Androidu, aby sa
 * kaskáda dala testovať bez zariadenia.
 *
 * Časy sú v sekundách (nie v milisekundách) — rovnako ako na iOS, aby sa obe
 * jadrá dali porovnávať riadok po riadku.
 */
public final class Fix {
    public final double lat;
    public final double lng;
    /** Záporná, keď zariadenie rýchlosť nevie určiť. */
    public final double speedKmh;
    /** Záporná, keď je poloha neplatná. */
    public final double accuracy;
    public final Double altitude;
    public final double timestamp;

    public Fix(double lat, double lng, double speedKmh, double accuracy, Double altitude, double timestamp) {
        this.lat = lat;
        this.lng = lng;
        this.speedKmh = speedKmh;
        this.accuracy = accuracy;
        this.altitude = altitude;
        this.timestamp = timestamp;
    }
}
