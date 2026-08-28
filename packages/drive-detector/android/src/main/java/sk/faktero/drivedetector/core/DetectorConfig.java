package sk.faktero.drivedetector.core;

/**
 * Nastavenia kaskády. Predvolené hodnoty sú tie isté ako na iOS — keby sa
 * rozišli, tá istá jazda by sa na dvoch telefónoch rozpoznala inak.
 */
public final class DetectorConfig {
    public double speedThresholdKmh = 15;
    public double sustainedSeconds = 60;
    public int minConsecutiveFixes = 3;
    public double maxAccuracyMeters = 50;
    public double debounceMinutes = 30;
    public double stopSpeedKmh = 5;
    public double stopAfterSeconds = 300;
    public double distanceFilterMeters = 30;

    /**
     * Ako dlho po poslednom meraní nad prahom sa overovanie ešte drží. Keď
     * dovtedy nič nepríde, presné meranie sa vypína.
     */
    public double verificationWindowSeconds = 90;
    /**
     * Tvrdý strop jedného overovania — poistka pre batériu, keby prah držal
     * niekto, kto nesedí v aute (vlak, autobus).
     */
    public double verificationMaxSeconds = 600;
    /**
     * Väčšia diera medzi dvoma meraniami sa do času nad prahom nepočíta —
     * v nej sa mohlo aj stáť.
     */
    public double maxGapSeconds = 30;
    /** Skrátené držanie prahu, keď rozpoznávanie pohybu hlási jazdu autom. */
    public double automotiveSustainedSeconds = 30;
}
