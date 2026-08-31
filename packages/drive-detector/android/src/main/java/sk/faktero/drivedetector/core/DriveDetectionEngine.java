package sk.faktero.drivedetector.core;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

/**
 * Kaskáda detekcie jazdy — verný preklad jadra z iOS.
 *
 * Žiadna poloha, žiadne senzory, žiadne hodiny: čas aj merania prídu zvonku,
 * takže sa celé správanie dá prejsť v testoch za milisekundy namiesto hodiny
 * v aute. To je jediný dôvod, prečo je tento súbor oddelený od služby.
 *
 * Preklad je zámerne doslovný. Keby sa jadrá rozišli, tá istá jazda by sa na
 * iPhone a na Androide rozpoznala inak a nikto by nevedel, ktoré je správne.
 */
public final class DriveDetectionEngine {

    /** Zdroj identifikátorov. V testoch sa nahrádza, aby boli predvídateľné. */
    public interface IdFactory {
        String make();
    }

    private DetectorConfig config;
    private DetectorState state = DetectorState.IDLE;
    /** Prebiehajúca jazda. Po ukončení sa čistí — odchádza v úkone TRIP_ENDED. */
    private BufferedTrip trip;
    /** Dokedy sa detekcia nespúšťa po zamietnutí jazdy. */
    private Double debounceUntil;

    /** Body zbierané od prebudenia. Keď prah prejde, jazda ich zdedí. */
    private List<TripPoint> pending = new ArrayList<>();
    private Double verifyStartedAt;
    /**
     * Koľko sekúnd sme počas tohto overovania dokopy videli nad prahom.
     *
     * Zámerne súčet, nie súvislý úsek. Prvá verzia vyžadovala minútu bez
     * jediného poklesu — semafor, kruhový objazd či odbočka počítanie
     * vynulovali a v meste sa jazda nepotvrdila prakticky nikdy.
     */
    private double aboveTotal = 0;
    private Double lastFixAt;
    private boolean predchadzajuciBolNadPrahom = false;
    /** Posledné meranie nad prahom — drží okno overovania otvorené. */
    private Double lastAboveAt;
    private int consecutive = 0;
    private boolean automotive = false;
    /**
     * Kedy sa naposledy hýbalo. Nie je to čas posledného merania: stojace auto
     * pri filtri na 30 m neposiela nič, takže ticho sa musí počítať ako státie,
     * inak by sa jazda neukončila nikdy.
     */
    private Double lastMovingAt;

    private final IdFactory makeId;

    public DriveDetectionEngine() {
        this(new DetectorConfig(), () -> UUID.randomUUID().toString());
    }

    public DriveDetectionEngine(DetectorConfig config, IdFactory makeId) {
        this.config = config;
        this.makeId = makeId;
    }

    // ── Čítanie stavu ──────────────────────────────────────────────────────

    public DetectorConfig getConfig() {
        return config;
    }

    public DetectorState getState() {
        return state;
    }

    public BufferedTrip getTrip() {
        return trip;
    }

    public Double getDebounceUntil() {
        return debounceUntil;
    }

    /** Koľko sekúnd nad prahom už overovanie nazbieralo a koľko ich potrebuje. */
    public double sekundyNadPrahom() {
        return aboveTotal;
    }

    public double potrebnychSekund() {
        return requiredSustained();
    }

    // ── Nastavenia a obnova ────────────────────────────────────────────────

    public void update(DetectorConfig config) {
        this.config = config;
    }

    /**
     * Po reštarte zariadenia pokračuje rozpracovaná jazda tam, kde skončila —
     * ak sa medzitým nezastavila.
     *
     * Kým bola appka mimo (uspatá alebo zabitá), nikto neťukal, takže sa jazda
     * nemala ako ukončiť. Keď je od posledného pohybu viac než prah státia,
     * skončila sa dávno a zapíše sa <b>spätne k poslednému pohybu</b>, nie
     * k tomuto okamihu.
     *
     * Predtým tu bolo {@code lastMovingAt = now}, aby sa jazda neukončila v tej
     * istej sekunde, v ktorej sa obnovila. Lenže tým každé prebudenie nastavilo
     * hodiny státia na nulu — otvorená jazda potom v knihe jázd zožrala aj
     * hodinu státia a k nej kus ďalšej cesty.
     */
    public List<DetectorEffect> resume(BufferedTrip trip, Double debounceUntil, double now) {
        this.trip = trip;
        this.debounceUntil = debounceUntil;
        this.state = DetectorState.DRIVING;
        this.lastMovingAt = null;

        double posledny = poslednyPohyb(trip);
        if (!trip.manual && now - posledny >= config.stopAfterSeconds) {
            return finishTrip(posledny);
        }
        this.lastMovingAt = posledny;
        return jeden(DetectorEffect.Druh.START_PRECISE_UPDATES);
    }

    /**
     * Kedy sa auto naposledy hýbalo — podľa hodín tohto behu aj podľa bodov.
     *
     * Bez druhej časti sa po prebudení procesu nedá zistiť nič: appka vstáva
     * s prázdnou pamäťou a jedinou stopou po jazde sú body v databáze.
     * Zámerne sa hľadá posledný bod <b>nad prahom státia</b>, nie posledný bod:
     * stojacim autom vie GPS posúvať aj o desiatky metrov a taká drž by jazdu
     * držala otvorenú donekonečna.
     */
    private double poslednyPohyb(BufferedTrip jazda) {
        double posledny = jazda.startedAt;
        for (TripPoint bod : jazda.points) {
            if (bod.speedKmh >= config.stopSpeedKmh) posledny = bod.timestamp;
        }
        if (lastMovingAt != null) posledny = Math.max(posledny, lastMovingAt);
        return posledny;
    }

    public void setDebounce(Double until) {
        this.debounceUntil = until;
    }

    /** Rozpoznávanie pohybu hlási jazdu autom. */
    public void setAutomotive(boolean value) {
        this.automotive = value;
    }

    // ── Vstupy ─────────────────────────────────────────────────────────────

    /** Lacné prebudenie. Púšťa druhý stupeň kaskády. */
    public List<DetectorEffect> wake(double now) {
        // Počas jazdy sa druhá detekcia nespúšťa nikdy.
        if (state != DetectorState.IDLE) return Collections.emptyList();
        if (debounceUntil != null && now < debounceUntil) return Collections.emptyList();

        state = DetectorState.VERIFYING;
        verifyStartedAt = now;
        pending = new ArrayList<>();
        aboveTotal = 0;
        lastFixAt = null;
        lastAboveAt = null;
        predchadzajuciBolNadPrahom = false;
        consecutive = 0;
        automotive = false;
        List<DetectorEffect> ukony = new ArrayList<>();
        ukony.add(DetectorEffect.jednoduchy(DetectorEffect.Druh.START_PRECISE_UPDATES));
        ukony.add(DetectorEffect.jednoduchy(DetectorEffect.Druh.START_MOTION_UPDATES));
        return ukony;
    }

    public List<DetectorEffect> ingest(Fix fix, double now) {
        switch (state) {
            case VERIFYING:
                return ingestWhileVerifying(fix, now);
            case DRIVING:
                return ingestWhileDriving(fix, now);
            default:
                return Collections.emptyList();
        }
    }

    /**
     * Pravidelné ťuknutie. Bez neho by sa nezistil ani strop overovania, ani
     * koniec jazdy — v oboch prípadoch je typické, že merania prestanú chodiť.
     */
    public List<DetectorEffect> tick(double now) {
        switch (state) {
            case VERIFYING:
                if (!jeCasVzdatOverovanie(now)) return Collections.emptyList();
                return abortVerification();
            case DRIVING:
                if (trip == null || trip.manual) return Collections.emptyList();
                if (lastMovingAt == null || now - lastMovingAt < config.stopAfterSeconds) {
                    return Collections.emptyList();
                }
                // Koniec patrí k poslednému pohybu, nie k okamihu zistenia.
                return finishTrip(lastMovingAt);
            default:
                return Collections.emptyList();
        }
    }

    // ── Príkazy zvonku ─────────────────────────────────────────────────────

    /** Ručné spustenie tlačidlom. Keď jazda beží, nerobí nič. */
    public List<DetectorEffect> startManualTrip(double now) {
        if (trip != null) return Collections.emptyList();
        BufferedTrip jazda = new BufferedTrip(makeId.make(), now, true);
        trip = jazda;
        state = DetectorState.DRIVING;
        pending = new ArrayList<>();
        vycistiOverovanie();
        lastMovingAt = now;
        List<DetectorEffect> ukony = new ArrayList<>();
        ukony.add(DetectorEffect.jednoduchy(DetectorEffect.Druh.START_PRECISE_UPDATES));
        ukony.add(DetectorEffect.tripStarted(jazda, false));
        return ukony;
    }

    /** Ručné ukončenie. Vracia prázdno, keď nič nebeží. */
    public List<DetectorEffect> endTrip(double now) {
        if (state != DetectorState.DRIVING) return Collections.emptyList();
        return finishTrip(now);
    }

    /**
     * Zamietnutie jazdy. Debounce platí aj vtedy, keď sa zamieta už ukončená
     * jazda — človek práve povedal, že o takéto jazdy nestojí.
     */
    public List<DetectorEffect> discard(String tripId, double now) {
        debounceUntil = now + config.debounceMinutes * 60;

        if (trip == null || (tripId != null && !trip.id.equals(tripId))) {
            // Zamietla sa jazda, ktorá už nebeží — stačí debounce.
            return Collections.emptyList();
        }
        trip = null;
        pending = new ArrayList<>();
        vycistiOverovanie();
        lastMovingAt = null;
        state = DetectorState.IDLE;
        List<DetectorEffect> ukony = new ArrayList<>();
        ukony.add(DetectorEffect.jednoduchy(DetectorEffect.Druh.STOP_PRECISE_UPDATES));
        ukony.add(DetectorEffect.jednoduchy(DetectorEffect.Druh.STOP_MOTION_UPDATES));
        ukony.add(DetectorEffect.jednoduchy(DetectorEffect.Druh.BUFFER_DISCARDED));
        return ukony;
    }

    /**
     * Zaradenie jazdy nič neukončuje — človek odpovedá na notifikáciu hneď na
     * začiatku cesty a nahrávanie musí ísť ďalej.
     */
    public BufferedTrip classify(String tripId, Classification classification) {
        if (trip == null || !trip.id.equals(tripId)) return null;
        trip.classification = classification;
        return trip;
    }

    // ── Vnútro ─────────────────────────────────────────────────────────────

    private double requiredSustained() {
        return automotive
                ? Math.min(config.sustainedSeconds, config.automotiveSustainedSeconds)
                : config.sustainedSeconds;
    }

    /**
     * Meranie s neznámou alebo horšou presnosťou ako povolená sa do trasy
     * nedostane a sériu prerušuje — je to skutočný výpadok signálu.
     */
    private boolean isUsable(Fix fix) {
        return fix.accuracy >= 0 && fix.accuracy < config.maxAccuracyMeters;
    }

    /**
     * Okno overovania sa neráta od prebudenia, ale od posledného merania nad
     * prahom. Pevné okno od prebudenia znamenalo, že jazda musela prah udržať
     * takmer bez prestávky hneď v prvej minúte. Strop je poistka pre batériu.
     */
    private boolean jeCasVzdatOverovanie(double now) {
        if (verifyStartedAt == null) return false;
        if (now - verifyStartedAt >= config.verificationMaxSeconds) return true;
        double od = lastAboveAt != null ? lastAboveAt : verifyStartedAt;
        return now - od >= config.verificationWindowSeconds;
    }

    private List<DetectorEffect> ingestWhileVerifying(Fix fix, double now) {
        if (jeCasVzdatOverovanie(now)) return abortVerification();

        if (!isUsable(fix)) {
            consecutive = 0;
            predchadzajuciBolNadPrahom = false;
            return Collections.emptyList();
        }
        // Rýchlosť sa nedá určiť — meranie sa zahadzuje, ale sériu nepretŕha.
        if (fix.speedKmh < 0) return Collections.emptyList();

        pending.add(new TripPoint(fix));

        if (fix.speedKmh >= config.speedThresholdKmh) {
            // Čas sa prirátava medzi dvoma meraniami nad prahom. Po výpadku
            // signálu by sa inak prirátala celá diera, v ktorej sa mohlo aj stáť.
            if (predchadzajuciBolNadPrahom && lastFixAt != null) {
                double medzera = fix.timestamp - lastFixAt;
                if (medzera > 0 && medzera <= config.maxGapSeconds) aboveTotal += medzera;
            }
            consecutive += 1;
            lastAboveAt = fix.timestamp;
            predchadzajuciBolNadPrahom = true;
        } else {
            consecutive = 0;
            predchadzajuciBolNadPrahom = false;
        }
        lastFixAt = fix.timestamp;

        if (consecutive < config.minConsecutiveFixes || aboveTotal < requiredSustained()) {
            return Collections.emptyList();
        }
        return confirmTrip(now);
    }

    private List<DetectorEffect> ingestWhileDriving(Fix fix, double now) {
        if (trip == null) return Collections.emptyList();

        // Diera v meraniach znamená, že appka medzitým nebežala — systém ju
        // uspal alebo zabil. Ťukanie počas spánku nechodí, takže jazda ostala
        // otvorená; bez tejto kontroly by k nej teraz pribudla aj cesta, ktorá
        // s ňou nesúvisí. Stará sa uzavrie k poslednému pohybu a toto meranie
        // začína overovanie novej.
        double posledny = poslednyPohyb(trip);
        if (!trip.manual && fix.timestamp - posledny >= config.stopAfterSeconds) {
            List<DetectorEffect> ukony = new ArrayList<>(finishTrip(posledny));
            ukony.addAll(wake(now));
            ukony.addAll(ingest(fix, now));
            return ukony;
        }

        if (!isUsable(fix) || fix.speedKmh < 0) return Collections.emptyList();

        TripPoint bod = new TripPoint(fix);
        if (!trip.points.isEmpty()) {
            trip.distanceMeters += Distance.meters(trip.points.get(trip.points.size() - 1), bod);
        }
        trip.points.add(bod);
        trip.maxSpeedKmh = Math.max(trip.maxSpeedKmh, bod.speedKmh);

        if (bod.speedKmh >= config.stopSpeedKmh) {
            lastMovingAt = Math.max(now, bod.timestamp);
        }

        List<DetectorEffect> ukony = new ArrayList<>();
        ukony.add(DetectorEffect.pointAppended(trip.id, bod));
        if (!trip.manual && lastMovingAt != null && now - lastMovingAt >= config.stopAfterSeconds) {
            ukony.addAll(finishTrip(lastMovingAt));
        }
        return ukony;
    }

    private List<DetectorEffect> confirmTrip(double now) {
        List<TripPoint> body = pending;
        BufferedTrip jazda = new BufferedTrip(
                makeId.make(),
                body.isEmpty() ? now : body.get(0).timestamp,
                null,
                new ArrayList<>(body),
                Distance.total(body),
                Distance.maxSpeed(body),
                null,
                false);

        trip = jazda;
        state = DetectorState.DRIVING;
        pending = new ArrayList<>();
        vycistiOverovanie();
        lastMovingAt = now;

        // Rozpoznávanie pohybu už netreba — svoju úlohu (skrátenie držania
        // prahu) splnilo a na pozadí stojí batériu.
        List<DetectorEffect> ukony = new ArrayList<>();
        ukony.add(DetectorEffect.jednoduchy(DetectorEffect.Druh.STOP_MOTION_UPDATES));
        ukony.add(DetectorEffect.tripStarted(jazda, true));
        return ukony;
    }

    private List<DetectorEffect> abortVerification() {
        state = DetectorState.IDLE;
        pending = new ArrayList<>();
        vycistiOverovanie();
        automotive = false;
        List<DetectorEffect> ukony = new ArrayList<>();
        ukony.add(DetectorEffect.jednoduchy(DetectorEffect.Druh.STOP_PRECISE_UPDATES));
        ukony.add(DetectorEffect.jednoduchy(DetectorEffect.Druh.STOP_MOTION_UPDATES));
        ukony.add(DetectorEffect.jednoduchy(DetectorEffect.Druh.BUFFER_DISCARDED));
        return ukony;
    }

    private void vycistiOverovanie() {
        aboveTotal = 0;
        lastFixAt = null;
        lastAboveAt = null;
        predchadzajuciBolNadPrahom = false;
        consecutive = 0;
        verifyStartedAt = null;
    }

    private List<DetectorEffect> finishTrip(double now) {
        if (trip == null) return Collections.emptyList();
        BufferedTrip jazda = trip;
        jazda.endedAt = now;
        trip = null;
        state = DetectorState.IDLE;
        lastMovingAt = null;
        List<DetectorEffect> ukony = new ArrayList<>();
        ukony.add(DetectorEffect.tripEnded(jazda));
        ukony.add(DetectorEffect.jednoduchy(DetectorEffect.Druh.STOP_PRECISE_UPDATES));
        return ukony;
    }

    private List<DetectorEffect> jeden(DetectorEffect.Druh druh) {
        List<DetectorEffect> z = new ArrayList<>();
        z.add(DetectorEffect.jednoduchy(druh));
        return z;
    }
}
