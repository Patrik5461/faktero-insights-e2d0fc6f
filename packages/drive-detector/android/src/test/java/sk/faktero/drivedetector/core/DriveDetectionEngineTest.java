package sk.faktero.drivedetector.core;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

import org.junit.Test;

/**
 * Preklad testov z iOS, prípad po prípade.
 *
 * Zmysel nie je len v tom, že Android motor funguje — ale že sa **správa
 * rovnako**. Keby sa jadrá rozišli, tá istá cesta by sa na iPhone a na
 * Androide rozpoznala inak a nikto by nevedel, ktoré je správne.
 *
 * Celá kaskáda sa dá prejsť bez auta, bez GPS a bez čakania: čas aj merania sú
 * vstupom, nie prostredím.
 */
public class DriveDetectionEngineTest {

    private static final double START = 1_000;

    private DriveDetectionEngine motor() {
        return motor(c -> {});
    }

    private DriveDetectionEngine motor(Consumer<DetectorConfig> uprav) {
        DetectorConfig config = new DetectorConfig();
        uprav.accept(config);
        int[] poradie = {0};
        return new DriveDetectionEngine(config, () -> "jazda-" + (++poradie[0]));
    }

    private Fix fix(double cas, double speed) {
        return fix(cas, speed, 10, 48.15, 17.11);
    }

    private Fix fix(double cas, double speed, double accuracy) {
        return fix(cas, speed, accuracy, 48.15, 17.11);
    }

    private Fix fix(double cas, double speed, double accuracy, double lat, double lng) {
        return new Fix(lat, lng, speed, accuracy, 150d, cas);
    }

    /** Nakŕmi motor meraniami v pravidelnom takte a vráti všetky úkony. */
    private List<DetectorEffect> jazdi(DriveDetectionEngine motor, double od, double po) {
        return jazdi(motor, od, po, 5, 60, 10);
    }

    private List<DetectorEffect> jazdi(DriveDetectionEngine motor, double od, double po, double krok, double speed) {
        return jazdi(motor, od, po, krok, speed, 10);
    }

    private List<DetectorEffect> jazdi(
            DriveDetectionEngine motor, double od, double po, double krok, double speed, double accuracy) {
        List<DetectorEffect> vsetky = new ArrayList<>();
        for (double t = od; t <= po; t += krok) {
            vsetky.addAll(motor.ingest(fix(t, speed, accuracy), t));
        }
        return vsetky;
    }

    private BufferedTrip zaciatokJazdy(List<DetectorEffect> ukony) {
        for (DetectorEffect e : ukony) if (e.druh == DetectorEffect.Druh.TRIP_STARTED) return e.trip;
        return null;
    }

    private BufferedTrip koniecJazdy(List<DetectorEffect> ukony) {
        for (DetectorEffect e : ukony) if (e.druh == DetectorEffect.Druh.TRIP_ENDED) return e.trip;
        return null;
    }

    private boolean obsahuje(List<DetectorEffect> ukony, DetectorEffect.Druh druh) {
        for (DetectorEffect e : ukony) if (e.druh == druh) return true;
        return false;
    }

    // ── Prebudenie a overovanie ────────────────────────────────────────────

    @Test
    public void prebudenieZapinaPresnuPolohuAPohyboveSenzory() {
        DriveDetectionEngine m = motor();
        List<DetectorEffect> ukony = m.wake(START);
        assertEquals(2, ukony.size());
        assertTrue(obsahuje(ukony, DetectorEffect.Druh.START_PRECISE_UPDATES));
        assertTrue(obsahuje(ukony, DetectorEffect.Druh.START_MOTION_UPDATES));
        assertEquals(DetectorState.VERIFYING, m.getState());
    }

    @Test
    public void jazdaSaPotvrdiPoDrzaniPrahu() {
        DriveDetectionEngine m = motor();
        m.wake(START);
        List<DetectorEffect> ukony = jazdi(m, START, START + 60);

        BufferedTrip jazda = zaciatokJazdy(ukony);
        assertNotNull(jazda);
        assertEquals(DetectorState.DRIVING, m.getState());
        // Trasa začína pri prebudení, nie až pri potvrdení prahu.
        assertEquals(START, jazda.startedAt, 0.001);
        assertEquals(13, jazda.points.size());
        assertFalse(jazda.manual);
    }

    @Test
    public void kratkeZrychlenieJazduNespusti() {
        DriveDetectionEngine m = motor();
        m.wake(START);
        // 30 sekúnd nad prahom, potom státie — na 60 sekúnd to nestačí.
        jazdi(m, START, START + 30);
        jazdi(m, START + 35, START + 80, 5, 2);

        assertEquals(DetectorState.VERIFYING, m.getState());
        assertNull(m.getTrip());
    }

    @Test
    public void poDevatdesiatichSekundachSaOverovanieVzda() {
        DriveDetectionEngine m = motor();
        m.wake(START);
        jazdi(m, START, START + 30, 5, 10);

        List<DetectorEffect> ukony = m.tick(START + 90);
        assertTrue(obsahuje(ukony, DetectorEffect.Druh.STOP_PRECISE_UPDATES));
        assertTrue(obsahuje(ukony, DetectorEffect.Druh.BUFFER_DISCARDED));
        assertEquals(DetectorState.IDLE, m.getState());
        assertNull(m.getTrip());
    }

    /**
     * Kvôli tomuto sa počítanie menilo: pôvodne musel prah držať minútu bez
     * jediného poklesu. V meste sa jazda nepotvrdila prakticky nikdy — stačil
     * jeden semafor.
     */
    @Test
    public void mestskaJazdaSoSemaformiSaPotvrdi() {
        DriveDetectionEngine m = motor();
        m.wake(START);
        jazdi(m, START, START + 25);
        jazdi(m, START + 30, START + 70, 5, 3);
        jazdi(m, START + 75, START + 95);
        jazdi(m, START + 100, START + 115, 5, 12);
        List<DetectorEffect> ukony = jazdi(m, START + 120, START + 145);

        assertNotNull(zaciatokJazdy(ukony));
        assertEquals(DetectorState.DRIVING, m.getState());
    }

    @Test
    public void oknoDrziKymChodiaMeraniaNadPrahom() {
        DriveDetectionEngine m = motor(c -> c.sustainedSeconds = 300);
        m.wake(START);
        jazdi(m, START, START + 200);

        assertEquals(DetectorState.VERIFYING, m.getState());
        assertTrue(m.tick(START + 250).isEmpty());
    }

    /** Po výpadku signálu sa nesmie prirátať celá diera — v nej sa mohlo aj stáť. */
    @Test
    public void dieraMedziMeraniamiSaDoCasuNadPrahomNepocita() {
        DriveDetectionEngine m = motor();
        m.wake(START);
        jazdi(m, START, START + 20);
        m.ingest(fix(START + 60, 60), START + 60);

        assertEquals(20, m.sekundyNadPrahom(), 0.001);
        assertNull(m.getTrip());
    }

    /** Poistka pre batériu: overovanie sa nesmie natiahnuť donekonečna. */
    @Test
    public void overovanieMaTvrdyStrop() {
        DriveDetectionEngine m = motor();
        m.wake(START);
        // Striedavo nad a pod prahom — séria troch sa nenazbiera nikdy,
        // ale okno by sa bez stropu obnovovalo stále.
        for (double t = START; t <= START + 700; t += 5) {
            double rychlost = (t % 10 == 0) ? 60 : 5;
            m.ingest(fix(t, rychlost), t);
        }

        assertEquals(DetectorState.IDLE, m.getState());
        assertNull(m.getTrip());
    }

    @Test
    public void zapornaRychlostSeriuNepretrhne() {
        DriveDetectionEngine m = motor();
        m.wake(START);
        jazdi(m, START, START + 25);
        // Systém občas rýchlosť nevie určiť — také meranie sa zahodí, ale
        // sériu nesmie zhodiť.
        m.ingest(fix(START + 30, -1), START + 30);
        List<DetectorEffect> ukony = jazdi(m, START + 35, START + 60);

        assertNotNull(zaciatokJazdy(ukony));
        // Meranie bez rýchlosti sa do trasy nedostane.
        assertEquals(12, m.getTrip().points.size());
    }

    @Test
    public void zlaPresnostSeriuPretrhne() {
        DriveDetectionEngine m = motor();
        m.wake(START);
        jazdi(m, START, START + 25);
        m.ingest(fix(START + 30, 60, 80), START + 30);
        jazdi(m, START + 35, START + 60);

        assertEquals(DetectorState.VERIFYING, m.getState());
        assertNull(m.getTrip());
    }

    @Test
    public void nepresneMeranieSaDoTrasyNedostane() {
        DriveDetectionEngine m = motor();
        m.wake(START);
        m.ingest(fix(START, 60, 500), START);
        jazdi(m, START + 5, START + 65);

        List<TripPoint> body = m.getTrip().points;
        assertFalse(body.isEmpty());
        for (TripPoint b : body) assertTrue(b.accuracy < 50);
    }

    @Test
    public void pohyboveSenzorySkracujuDrzaniePrahu() {
        DriveDetectionEngine m = motor();
        m.wake(START);
        m.setAutomotive(true);
        List<DetectorEffect> ukony = jazdi(m, START, START + 30);

        assertNotNull(zaciatokJazdy(ukony));
        assertTrue(obsahuje(ukony, DetectorEffect.Druh.STOP_MOTION_UPDATES));
    }

    @Test
    public void pohyboveSenzoryNepredlzujuKratsieNastavenie() {
        // Keď si appka nastaví kratšie držanie ako 30 s, senzory ho nesmú predĺžiť.
        DriveDetectionEngine m = motor(c -> c.sustainedSeconds = 15);
        m.wake(START);
        m.setAutomotive(true);
        List<DetectorEffect> ukony = jazdi(m, START, START + 15);

        assertNotNull(zaciatokJazdy(ukony));
    }

    // ── Priebeh a ukončenie ────────────────────────────────────────────────

    @Test
    public void jazdaSaUkonciPoDlhomStati() {
        DriveDetectionEngine m = motor();
        m.wake(START);
        jazdi(m, START, START + 60);

        assertTrue(m.tick(START + 300).isEmpty());
        List<DetectorEffect> ukony = m.tick(START + 360);

        BufferedTrip jazda = koniecJazdy(ukony);
        assertNotNull(jazda);
        assertEquals(START + 360, jazda.endedAt, 0.001);
        assertTrue(obsahuje(ukony, DetectorEffect.Druh.STOP_PRECISE_UPDATES));
        assertEquals(DetectorState.IDLE, m.getState());
        assertNull(m.getTrip());
    }

    @Test
    public void stojaceAutoBezMeraniSaTiezUkonci() {
        // Pri filtri na 30 metrov stojace auto neposiela vôbec nič. Keby sa
        // koniec počítal len z meraní, jazda by nikdy neskončila.
        DriveDetectionEngine m = motor();
        m.wake(START);
        jazdi(m, START, START + 60);

        assertNotNull(koniecJazdy(m.tick(START + 400)));
    }

    @Test
    public void pomalaJazdaVKolonePokracuje() {
        DriveDetectionEngine m = motor();
        m.wake(START);
        jazdi(m, START, START + 60);
        // Popolzávanie v kolóne je stále jazda — rýchlosť nad `stopSpeedKmh`.
        jazdi(m, START + 65, START + 400, 20, 8);

        assertEquals(DetectorState.DRIVING, m.getState());
    }

    @Test
    public void trasaMaVzdialenostAMaximalnuRychlost() {
        DriveDetectionEngine m = motor();
        m.wake(START);
        double lat = 48.15;
        for (double t = START; t <= START + 60; t += 5) {
            m.ingest(fix(t, t == START + 30 ? 95 : 60, 10, lat, 17.11), t);
            lat += 0.001;
        }

        assertEquals(95, m.getTrip().maxSpeedKmh, 0.001);
        assertTrue(m.getTrip().distanceMeters > 1_000);
        assertTrue(m.getTrip().avgSpeedKmh() > 0);
    }

    // ── Zamietnutie a debounce ─────────────────────────────────────────────

    @Test
    public void poZamietnutiSaDetekciaChvilkuNespusta() {
        DriveDetectionEngine m = motor();
        m.wake(START);
        jazdi(m, START, START + 60);
        String id = m.getTrip().id;

        List<DetectorEffect> ukony = m.discard(id, START + 70);
        assertTrue(obsahuje(ukony, DetectorEffect.Druh.STOP_PRECISE_UPDATES));
        assertNull(m.getTrip());

        // 30 minút ticho.
        assertTrue(m.wake(START + 70 + 29 * 60).isEmpty());
        assertFalse(m.wake(START + 70 + 31 * 60).isEmpty());
    }

    @Test
    public void zamietnutieUzUkoncenejJazdyNastaviLenDebounce() {
        DriveDetectionEngine m = motor();
        m.wake(START);
        jazdi(m, START, START + 60);
        m.tick(START + 400);

        m.discard("jazda-1", START + 410);
        assertTrue(m.wake(START + 500).isEmpty());
    }

    @Test
    public void pocasJazdySaDruhaDetekciaNespusti() {
        DriveDetectionEngine m = motor();
        m.wake(START);
        jazdi(m, START, START + 60);
        String id = m.getTrip().id;

        assertTrue(m.wake(START + 120).isEmpty());
        assertEquals(id, m.getTrip().id);
    }

    // ── Ručná jazda ────────────────────────────────────────────────────────

    @Test
    public void rucnaJazdaNemaNotifikaciuANekonciSama() {
        DriveDetectionEngine m = motor();
        List<DetectorEffect> ukony = m.startManualTrip(START);
        BufferedTrip jazda = zaciatokJazdy(ukony);
        assertNotNull(jazda);
        boolean notify = false;
        for (DetectorEffect e : ukony) if (e.druh == DetectorEffect.Druh.TRIP_STARTED) notify = e.notify;
        assertFalse(notify);
        assertTrue(jazda.manual);

        // Ručná jazda sa sama neukončí ani po dlhom státí.
        assertTrue(m.tick(START + 900).isEmpty());
        assertEquals(DetectorState.DRIVING, m.getState());

        assertNotNull(koniecJazdy(m.endTrip(START + 950)));
    }

    @Test
    public void rucneSpustenieNezacneDruhuJazdu() {
        DriveDetectionEngine m = motor();
        m.wake(START);
        jazdi(m, START, START + 60);
        String id = m.getTrip().id;

        assertTrue(m.startManualTrip(START + 70).isEmpty());
        assertEquals(id, m.getTrip().id);
    }

    // ── Obnova a zaradenie ─────────────────────────────────────────────────

    @Test
    public void obnovenaJazdaPokracuje() {
        DriveDetectionEngine m = motor();
        List<TripPoint> body = new ArrayList<>();
        body.add(new TripPoint(48.15, 17.11, 60, 10, null, START));
        BufferedTrip ulozena = new BufferedTrip("z-databazy", START, null, body, 120, 60, null, false);

        List<DetectorEffect> ukony = m.resume(ulozena, null, START + 3_600);
        assertEquals(1, ukony.size());
        assertTrue(obsahuje(ukony, DetectorEffect.Druh.START_PRECISE_UPDATES));
        assertEquals(DetectorState.DRIVING, m.getState());

        jazdi(m, START + 3_600, START + 3_620);
        assertEquals(6, m.getTrip().points.size());
        assertEquals("z-databazy", m.getTrip().id);
    }

    @Test
    public void zaradenieJazduNeukonci() {
        DriveDetectionEngine m = motor();
        m.wake(START);
        jazdi(m, START, START + 60);
        String id = m.getTrip().id;

        BufferedTrip zaradena = m.classify(id, Classification.BUSINESS);
        assertEquals(Classification.BUSINESS, zaradena.classification);
        assertEquals(DetectorState.DRIVING, m.getState());
    }
}
