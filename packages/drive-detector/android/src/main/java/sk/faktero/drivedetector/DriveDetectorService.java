package sk.faktero.drivedetector;

import android.Manifest;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.Nullable;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import com.google.android.gms.location.ActivityRecognition;
import com.google.android.gms.location.ActivityTransition;
import com.google.android.gms.location.ActivityTransitionRequest;
import com.google.android.gms.location.ActivityTransitionResult;
import com.google.android.gms.location.DetectedActivity;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import java.util.ArrayList;
import java.util.List;

import sk.faktero.drivedetector.core.BufferedTrip;
import sk.faktero.drivedetector.core.Classification;
import sk.faktero.drivedetector.core.DetectorEffect;
import sk.faktero.drivedetector.core.DriveDetectionEngine;
import sk.faktero.drivedetector.core.Fix;

/**
 * Detekcia jazdy na pozadí.
 *
 * Android nemá lacné prebúdzanie pri väčšom presune ako iOS, takže kaskáda je
 * postavená na dvoch režimoch tej istej služby:
 *
 * 1. **Čakanie** — poloha s vyváženou spotrebou, raz za minútu a najskôr po
 *    200 metroch. To je náš ekvivalent „významnej zmeny polohy": lacné a stačí
 *    to na to, aby sa spustilo overovanie.
 * 2. **Overovanie a jazda** — presná poloha s filtrom na vzdialenosť
 *    z nastavení. Zapína sa až vtedy, keď sa niekam ide.
 *
 * Rozpoznávanie pohybu (`IN_VEHICLE`) je len pomôcka, ktorá skracuje držanie
 * prahu — presne ako pohybové senzory na iOS. Beží aj bez neho.
 *
 * Služba je v popredí zámerne. Bez notifikácie Android meranie po pár minútach
 * zastaví a jazda by sa doratala nesprávne — to je na Androide najčastejší
 * dôvod, prečo knihy jázd nefungujú.
 */
public class DriveDetectorService extends Service {

    public static final String AKCIA_START = "sk.faktero.drivedetector.START";
    public static final String AKCIA_STOP = "sk.faktero.drivedetector.STOP";
    public static final String AKCIA_START_TRIP = "sk.faktero.drivedetector.START_TRIP";
    public static final String AKCIA_END_TRIP = "sk.faktero.drivedetector.END_TRIP";

    /** Kým appka beží, počúva udalosti. Keď nebeží, plugin si ich vyzdvihne z úložiska. */
    public interface Poslucháč {
        void naJazduRozpoznanu(BufferedTrip trip);
        void naZmenuJazdy(BufferedTrip trip);
        void naKoniecJazdy(BufferedTrip trip);
    }

    private static Poslucháč poslucháč;
    private static DriveDetectorService bezici;

    public static void nastavPoslucháča(Poslucháč p) {
        poslucháč = p;
    }

    public static DriveDetectorService instancia() {
        return bezici;
    }

    private DriveDetectionEngine motor;
    private TripStore store;
    private FusedLocationProviderClient poloha;
    private LocationCallback odberPresny;
    private LocationCallback odberLacny;
    private Handler tikac;
    private Runnable tik;
    /** Priebeh sa hlási najviac raz za desať sekúnd — inak by WebView nerobil nič iné. */
    private double poslednyOznam = 0;

    // ── Životný cyklus ─────────────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        bezici = this;
        store = new TripStore(this);
        motor = new DriveDetectionEngine(store.nacitajConfig(), () -> java.util.UUID.randomUUID().toString());
        poloha = LocationServices.getFusedLocationProviderClient(this);
        DriveNotifications.pripravKanaly(this);

        // Po reštarte zariadenia pokračuje rozpracovaná jazda tam, kde skončila.
        BufferedTrip ulozena = store.nacitajAktivnu();
        if (ulozena != null) {
            vykonaj(motor.resume(ulozena, store.nacitajDebounce(), teraz()));
        } else {
            motor.setDebounce(store.nacitajDebounce());
        }
        store.pripocitaj("spusteniProcesu", 1);
        spustiTikac();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String akcia = intent != null ? intent.getAction() : null;

        /*
          Bez polohy sa služba v popredí spustiť nesmie.

          Od Androidu 14 systém odmietne službu typu „location" appke, ktorá
          polohu povolenú nemá — a keď sa služba do piatich sekúnd neohlási
          ako bežiaca v popredí, systém **zabije celú aplikáciu**. Navonok to
          vyzerá tak, že appka po zatvorení spadne a už sa neotvorí, pritom
          príčina je v povolení, ktoré si človek nedal.

          Zastavenie sa vybavuje bez popredia — vypnutá detekcia nemá čo
          hlásiť.
        */
        if (!AKCIA_STOP.equals(akcia)) {
            if (!mamePolohu() || !doPopredia()) {
                zastavPresnuPolohu();
                zastavLacnuPolohu();
                stopSelf();
                return START_NOT_STICKY;
            }
        }

        if (akcia == null) return START_STICKY;

        switch (akcia) {
            case AKCIA_START:
                store.nastavMonitoring(true);
                spustiLacnuPolohu();
                break;
            case AKCIA_STOP:
                store.nastavMonitoring(false);
                zastavPresnuPolohu();
                zastavLacnuPolohu();
                stopSelf();
                break;
            case AKCIA_START_TRIP:
                vykonaj(motor.startManualTrip(teraz()));
                break;
            case AKCIA_END_TRIP:
                vykonaj(motor.endTrip(teraz()));
                break;
            case DriveNotifications.AKCIA_SLUZOBNA:
                zarad(intent.getStringExtra(DriveNotifications.EXTRA_TRIP), Classification.BUSINESS);
                break;
            case DriveNotifications.AKCIA_SUKROMNA:
                zarad(intent.getStringExtra(DriveNotifications.EXTRA_TRIP), Classification.PRIVATE);
                break;
            case DriveNotifications.AKCIA_ZAHODIT:
                vykonaj(motor.discard(intent.getStringExtra(DriveNotifications.EXTRA_TRIP), teraz()));
                store.ulozDebounce(motor.getDebounceUntil());
                break;
            default:
                // Prechod rozpoznávania pohybu — príde ako výsledok v tom istom intente.
                spracujPohyb(intent);
                break;
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        zastavPresnuPolohu();
        zastavLacnuPolohu();
        if (tikac != null && tik != null) tikac.removeCallbacks(tik);
        bezici = null;
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // ── Vstupy do motora ───────────────────────────────────────────────────

    private void spustiTikac() {
        tikac = new Handler(Looper.getMainLooper());
        tik = new Runnable() {
            @Override
            public void run() {
                vykonaj(motor.tick(teraz()));
                tikac.postDelayed(this, 15_000);
            }
        };
        tikac.postDelayed(tik, 15_000);
    }

    private void prijmiPolohu(Location l, boolean lacna) {
        double cas = l.getTime() / 1000d;
        store.pripocitaj("fixovOdSpustenia", 1);
        store.zapisDiag("poslednyFix", cas);

        if (lacna) {
            // Ekvivalent významnej zmeny polohy — púšťa druhý stupeň kaskády.
            List<DetectorEffect> ukony = motor.wake(teraz());
            if (!ukony.isEmpty()) {
                store.pripocitaj("prebudeni", 1);
                store.zapisDiag("poslednePrebudenie", teraz());
            }
            vykonaj(ukony);
            return;
        }

        // `hasSpeed()` je jediné, čo odlíši „stojí" od „rýchlosť nevieme".
        double rychlost = l.hasSpeed() ? l.getSpeed() * 3.6 : -1;
        double presnost = l.hasAccuracy() ? l.getAccuracy() : -1;
        Fix fix = new Fix(
                l.getLatitude(),
                l.getLongitude(),
                rychlost,
                presnost,
                l.hasAltitude() ? l.getAltitude() : null,
                cas);
        vykonaj(motor.ingest(fix, teraz()));
    }

    private void spracujPohyb(Intent intent) {
        if (!ActivityTransitionResult.hasResult(intent)) return;
        ActivityTransitionResult vysledok = ActivityTransitionResult.extractResult(intent);
        if (vysledok == null) return;
        for (com.google.android.gms.location.ActivityTransitionEvent e : vysledok.getTransitionEvents()) {
            if (e.getActivityType() != DetectedActivity.IN_VEHICLE) continue;
            boolean vozidlo = e.getTransitionType() == ActivityTransition.ACTIVITY_TRANSITION_ENTER;
            motor.setAutomotive(vozidlo);
            // Nasadnutie do auta je dôvod začať overovať, aj keď sa telefón
            // ešte nikam neposunul.
            if (vozidlo) vykonaj(motor.wake(teraz()));
        }
    }

    private void zarad(String tripId, Classification trieda) {
        BufferedTrip t = motor.classify(tripId, trieda);
        if (t != null) {
            store.ulozAktivnu(t);
            if (poslucháč != null) poslucháč.naZmenuJazdy(t);
            return;
        }
        // Zaraďuje sa už ukončená jazda — je v zozname nevyriešených.
        List<BufferedTrip> zoznam = store.nacitajNevyriesene();
        for (BufferedTrip u : zoznam) {
            if (!u.id.equals(tripId)) continue;
            u.classification = trieda;
            store.odoberNevyriesenu(tripId);
            store.pridajNevyriesenu(u);
            if (poslucháč != null) poslucháč.naKoniecJazdy(u);
            return;
        }
    }

    // ── Vykonávanie úkonov ─────────────────────────────────────────────────

    private void vykonaj(List<DetectorEffect> ukony) {
        for (DetectorEffect u : ukony) {
            switch (u.druh) {
                case START_PRECISE_UPDATES:
                    spustiPresnuPolohu();
                    break;
                case STOP_PRECISE_UPDATES:
                    zastavPresnuPolohu();
                    if (store.jeMonitoring()) spustiLacnuPolohu();
                    break;
                case START_MOTION_UPDATES:
                    spustiRozpoznavaniePohybu();
                    break;
                case STOP_MOTION_UPDATES:
                    zastavRozpoznavaniePohybu();
                    break;
                case TRIP_STARTED:
                    store.ulozAktivnu(u.trip);
                    store.zapisDiag("poslednaJazda", teraz());
                    doPopredia();
                    if (u.notify) DriveNotifications.spytajSa(this, u.trip.id, store.nacitajTexty());
                    if (poslucháč != null) poslucháč.naJazduRozpoznanu(u.trip);
                    break;
                case POINT_APPENDED: {
                    BufferedTrip bezi = motor.getTrip();
                    if (bezi == null) break;
                    // Ukladá sa po každom bode: službu môže systém zabiť kedykoľvek.
                    store.ulozAktivnu(bezi);
                    if (teraz() - poslednyOznam >= 10) {
                        poslednyOznam = teraz();
                        doPopredia();
                        if (poslucháč != null) poslucháč.naZmenuJazdy(bezi);
                    }
                    break;
                }
                case TRIP_ENDED:
                    store.ulozAktivnu(null);
                    store.pridajNevyriesenu(u.trip);
                    DriveNotifications.zavriOtazku(this);
                    doPopredia();
                    if (poslucháč != null) poslucháč.naKoniecJazdy(u.trip);
                    break;
                case BUFFER_DISCARDED:
                    store.ulozAktivnu(null);
                    store.ulozDebounce(motor.getDebounceUntil());
                    DriveNotifications.zavriOtazku(this);
                    doPopredia();
                    break;
            }
        }
    }

    // ── Poloha ─────────────────────────────────────────────────────────────

    private boolean mamePolohu() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    private void spustiPresnuPolohu() {
        if (odberPresny != null || !mamePolohu()) return;
        zastavLacnuPolohu();
        float filter = (float) motor.getConfig().distanceFilterMeters;
        LocationRequest ziadost = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5_000)
                .setMinUpdateIntervalMillis(2_000)
                .setMinUpdateDistanceMeters(filter)
                .build();
        odberPresny = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult vysledok) {
                Location l = vysledok.getLastLocation();
                if (l != null) prijmiPolohu(l, false);
            }
        };
        try {
            poloha.requestLocationUpdates(ziadost, odberPresny, Looper.getMainLooper());
        } catch (SecurityException e) {
            odberPresny = null;
        }
    }

    private void zastavPresnuPolohu() {
        if (odberPresny == null) return;
        poloha.removeLocationUpdates(odberPresny);
        odberPresny = null;
    }

    /**
     * Lacný režim čakania. Interval je zámerne dlhý a posun veľký — toto beží
     * celý deň a batéria to musí zniesť.
     */
    private void spustiLacnuPolohu() {
        if (odberLacny != null || !mamePolohu()) return;
        LocationRequest ziadost = new LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 60_000)
                .setMinUpdateIntervalMillis(30_000)
                .setMinUpdateDistanceMeters(200)
                .build();
        odberLacny = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult vysledok) {
                Location l = vysledok.getLastLocation();
                if (l != null) prijmiPolohu(l, true);
            }
        };
        try {
            poloha.requestLocationUpdates(ziadost, odberLacny, Looper.getMainLooper());
        } catch (SecurityException e) {
            odberLacny = null;
        }
    }

    private void zastavLacnuPolohu() {
        if (odberLacny == null) return;
        poloha.removeLocationUpdates(odberLacny);
        odberLacny = null;
    }

    // ── Rozpoznávanie pohybu (nepovinné) ───────────────────────────────────

    private void spustiRozpoznavaniePohybu() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                && ContextCompat.checkSelfPermission(this, "android.permission.ACTIVITY_RECOGNITION")
                != PackageManager.PERMISSION_GRANTED) {
            return; // Detekcia beží aj bez toho, len s dlhším držaním prahu.
        }
        List<ActivityTransition> prechody = new ArrayList<>();
        prechody.add(new ActivityTransition.Builder()
                .setActivityType(DetectedActivity.IN_VEHICLE)
                .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER)
                .build());
        prechody.add(new ActivityTransition.Builder()
                .setActivityType(DetectedActivity.IN_VEHICLE)
                .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_EXIT)
                .build());
        try {
            ActivityRecognition.getClient(this)
                    .requestActivityTransitionUpdates(new ActivityTransitionRequest(prechody), pohybIntent());
        } catch (SecurityException ignored) {
        }
    }

    private void zastavRozpoznavaniePohybu() {
        try {
            ActivityRecognition.getClient(this).removeActivityTransitionUpdates(pohybIntent());
        } catch (SecurityException ignored) {
        }
    }

    private android.app.PendingIntent pohybIntent() {
        Intent i = new Intent(this, DriveDetectorService.class).setAction("sk.faktero.drivedetector.POHYB");
        return android.app.PendingIntent.getService(
                this, 7788, i,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_MUTABLE);
    }

    // ── Popredie ───────────────────────────────────────────────────────────

    /** `false`, keď sa službu do popredia dostať nepodarilo. */
    private boolean doPopredia() {
        BufferedTrip bezi = motor != null ? motor.getTrip() : null;
        String nadpis = bezi != null ? "Nahrávam jazdu" : "Kniha jázd sleduje jazdy";
        String popis = bezi != null
                ? String.format(java.util.Locale.US, "%.1f km", bezi.distanceMeters / 1000)
                : "Jazda sa zapíše sama, keď sa rozbehnete.";
        try {
            ServiceCompat.startForeground(
                    this,
                    DriveNotifications.ID_BEH,
                    DriveNotifications.prubeh(this, nadpis, popis),
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                            ? android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
                            : 0);
            return true;
        } catch (Exception e) {
            // Android 14+ odmietne štart v popredí bez povolenia polohy.
            // Volajúci musí službu zastaviť — inak ju systém zabije aj
            // s aplikáciou za to, že sa neohlásila.
            return false;
        }
    }

    private double teraz() {
        return System.currentTimeMillis() / 1000d;
    }
}
