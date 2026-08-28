package sk.faktero.drivedetector.core;

/** Služobná alebo súkromná jazda — do knihy jázd patrí len prvá. */
public enum Classification {
    BUSINESS("business"),
    PRIVATE("private");

    public final String kod;

    Classification(String kod) {
        this.kod = kod;
    }

    /** Z hodnoty, ktorá prišla z JavaScriptu. Neznáme vráti `null`. */
    public static Classification zKodu(String kod) {
        if (kod == null) return null;
        for (Classification c : values()) if (c.kod.equals(kod)) return c;
        return null;
    }
}
