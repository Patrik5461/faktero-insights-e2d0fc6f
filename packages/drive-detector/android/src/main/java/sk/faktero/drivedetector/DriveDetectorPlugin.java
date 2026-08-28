package sk.faktero.drivedetector;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.PowerManager;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.List;

import org.json.JSONObject;

import sk.faktero.drivedetector.core.BufferedTrip;
import sk.faktero.drivedetector.core.Classification;

/**
 * Mostík medzi detekciou a aplikáciou.
 *
 * Metódy sedia s rozhraním v `src/definitions.ts` — tie isté názvy a tie isté
 * návratové hodnoty ako na iOS. Appka nesmie vedieť, na ktorej platforme beží.
 *
 * Sám nič nemeria: meranie vlastní služba, ktorá beží aj vtedy, keď appka
 * nebeží. Plugin je len okno do nej a do jej úložiska.
 */
@CapacitorPlugin(
        name = "DriveDetector",
        permissions = {
                @Permission(alias = "location", strings = {
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                }),
                @Permission(alias = "background", strings = {
                        Manifest.permission.ACCESS_BACKGROUND_LOCATION
                }),
                @Permission(alias = "motion", strings = {
                        "android.permission.ACTIVITY_RECOGNITION"
                }),
                /*
                  Od Androidu 13 sa musí pýtať aj o notifikácie. Bez nich
                  nepríde otázka „bola táto jazda služobná?" — meranie beží,
                  ale človek o hotovej jazde nemá ako vedieť.
                */
                @Permission(alias = "notifications", strings = {
                        "android.permission.POST_NOTIFICATIONS"
                }),
                /*
                  Notifikácie a senzory naraz. Android ich v jednom volaní
                  ukáže za sebou sám — dve samostatné žiadosti hneď po sebe
                  systém spoľahlivo nedoručí a druhé okno sa jednoducho
                  neukáže, ako keby ho appka nikdy nevypýtala.
                */
                @Permission(alias = "doplnkove", strings = {
                        "android.permission.POST_NOTIFICATIONS",
                        "android.permission.ACTIVITY_RECOGNITION"
                })
        })
public class DriveDetectorPlugin extends Plugin implements DriveDetectorService.Poslucháč {

    private TripStore store;

    /**
     * Beží práve žiadosť o povolenie?
     *
     * Android dovolí naraz jednu; druhá spustená spopod prvej zhodí appku.
     * Stáva sa to ľahko: obrazovka si pýta povolenia a zapnutie detekcie
     * si o ne povie tiež.
     */
    private boolean pytameSa;

    @Override
    public void load() {
        store = new TripStore(getContext());
        DriveDetectorService.nastavPoslucháča(this);
        // Pád si appka zapamätá, aby ho vedela ukázať po ďalšom otvorení.
        PadAppky.sleduj(getContext());
    }

    /**
     * Posledný pád aplikácie pre obrazovku Diagnostika.
     *
     * „Aplikácia sa opakovane zastavuje" je bez výpisu neriešiteľné —
     * systémový log ostane v telefóne a k nám sa nedostane.
     */
    @PluginMethod
    public void getLastCrash(PluginCall call) {
        String text = PadAppky.posledny(getContext());
        JSObject von = new JSObject();
        von.put("crash", text == null ? JSObject.NULL : text);
        call.resolve(von);
    }

    @PluginMethod
    public void clearLastCrash(PluginCall call) {
        PadAppky.zabudni(getContext());
        call.resolve();
    }

    // ── Nastavenia a beh ───────────────────────────────────────────────────

    @PluginMethod
    public void configure(PluginCall call) {
        JSObject data = call.getData();
        store.ulozConfig(data);
        JSObject texty = data.getJSObject("notification");
        if (texty != null) store.ulozTexty(texty);
        call.resolve();
    }

    /**
     * Zapne meranie a cestou dopýta, čo Android pýtať musí.
     *
     * iOS si o notifikácie povie sám vo chvíli, keď sa detekcia spúšťa;
     * Android to spraviť nemôže — o povolenie smie požiadať len obrazovka,
     * nie služba na pozadí. Preto sa pýta tu, po jednom, a odmietnutie
     * meranie nezablokuje: bez notifikácií sa jazda zapíše tiež, len sa
     * appka na jej zaradenie spýta až pri najbližšom otvorení.
     */
    @PluginMethod
    public void start(PluginCall call) {
        if (!mameFinePolohu()) {
            call.reject("Bez povolenej polohy sa detekcia spustiť nedá.");
            return;
        }
        if (chybaNotifikacia() && zacniPytat()) {
            requestPermissionForAlias("notifications", call, "poNotifikaciach");
            return;
        }
        poNotifikaciach(call);
    }

    @PermissionCallback
    private void poNotifikaciach(PluginCall call) {
        pytameSa = false;
        if (chybaPohyb() && zacniPytat()) {
            requestPermissionForAlias("motion", call, "poPohybe");
            return;
        }
        poPohybe(call);
    }

    @PermissionCallback
    private void poPohybe(PluginCall call) {
        pytameSa = false;
        posliSluzbe(DriveDetectorService.AKCIA_START);
        call.resolve();
    }

    /** `true`, keď sa smie pýtať. Druhá žiadosť naraz by appku zhodila. */
    private boolean zacniPytat() {
        if (pytameSa) return false;
        pytameSa = true;
        return true;
    }

    private boolean chybaNotifikacia() {
        return Build.VERSION.SDK_INT >= 33
                && !"granted".equals(stav("android.permission.POST_NOTIFICATIONS"));
    }

    private boolean chybaPohyb() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                && !"granted".equals(stav("android.permission.ACTIVITY_RECOGNITION"));
    }

    @PluginMethod
    public void stop(PluginCall call) {
        posliSluzbe(DriveDetectorService.AKCIA_STOP);
        call.resolve();
    }

    @PluginMethod
    public void getState(PluginCall call) {
        JSObject von = new JSObject();
        von.put("monitoring", store.jeMonitoring());
        BufferedTrip aktivna = store.nacitajAktivnu();
        von.put("activeTrip", aktivna == null ? JSObject.NULL : naJs(JsPrevod.jazda(aktivna)));
        von.put("diagnostika", diagnostika());
        call.resolve(von);
    }

    @PluginMethod
    public void getBufferedTrip(PluginCall call) {
        BufferedTrip aktivna = store.nacitajAktivnu();
        if (aktivna == null) {
            // Keď žiadna nebeží, posledná nezaradená ukončená.
            List<BufferedTrip> zoznam = store.nacitajNevyriesene();
            if (!zoznam.isEmpty()) aktivna = zoznam.get(zoznam.size() - 1);
        }
        call.resolve(zabal(aktivna));
    }

    @PluginMethod
    public void getUnresolvedTrips(PluginCall call) {
        JSArray pole = new JSArray();
        for (BufferedTrip t : store.nacitajNevyriesene()) pole.put(JsPrevod.jazda(t));
        JSObject von = new JSObject();
        von.put("trips", pole);
        call.resolve(von);
    }

    @PluginMethod
    public void markSynced(PluginCall call) {
        String id = call.getString("tripId");
        if (id == null) {
            call.reject("Chýba tripId.");
            return;
        }
        store.odoberNevyriesenu(id);
        call.resolve();
    }

    @PluginMethod
    public void confirmTrip(PluginCall call) {
        String id = call.getString("tripId");
        Classification trieda = Classification.zKodu(call.getString("classification"));
        if (id == null || trieda == null) {
            call.reject("Chýba tripId alebo classification.");
            return;
        }
        Intent i = new Intent(getContext(), DriveDetectorService.class)
                .setAction(trieda == Classification.BUSINESS
                        ? DriveNotifications.AKCIA_SLUZOBNA
                        : DriveNotifications.AKCIA_SUKROMNA)
                .putExtra(DriveNotifications.EXTRA_TRIP, id);
        getContext().startService(i);

        BufferedTrip aktivna = store.nacitajAktivnu();
        if (aktivna != null && aktivna.id.equals(id)) {
            aktivna.classification = trieda;
            call.resolve(naJs(JsPrevod.jazda(aktivna)));
            return;
        }
        for (BufferedTrip t : store.nacitajNevyriesene()) {
            if (!t.id.equals(id)) continue;
            t.classification = trieda;
            call.resolve(naJs(JsPrevod.jazda(t)));
            return;
        }
        call.reject("Jazda sa nenašla.");
    }

    @PluginMethod
    public void discardTrip(PluginCall call) {
        String id = call.getString("tripId");
        Intent i = new Intent(getContext(), DriveDetectorService.class)
                .setAction(DriveNotifications.AKCIA_ZAHODIT)
                .putExtra(DriveNotifications.EXTRA_TRIP, id);
        getContext().startService(i);
        if (id != null) store.odoberNevyriesenu(id);
        call.resolve();
    }

    @PluginMethod
    public void startTrip(PluginCall call) {
        if (!mameFinePolohu()) {
            call.reject("Bez povolenej polohy sa jazda merať nedá.");
            return;
        }
        posliSluzbe(DriveDetectorService.AKCIA_START_TRIP);
        // Služba jazdu vytvorí a uloží; vraciame, čo je v úložisku.
        cakajNaUlozenie(call, true);
    }

    @PluginMethod
    public void endTrip(PluginCall call) {
        posliSluzbe(DriveDetectorService.AKCIA_END_TRIP);
        cakajNaUlozenie(call, false);
    }

    // ── Povolenia ──────────────────────────────────────────────────────────

    @PluginMethod
    @Override
    public void checkPermissions(PluginCall call) {
        call.resolve(povolenia());
    }

    @PluginMethod
    @Override
    public void requestPermissions(PluginCall call) {
        // Pýta sa len poloha „počas používania". Na „vždy" sa ide až potom —
        // Android 11+ inak žiadosť rovno odmietne.
        requestPermissionForAlias("location", call, "poVyzve");
    }

    /**
     * Notifikácie a pohybové senzory sa dajú vypýtať aj bez zapínania detekcie.
     *
     * Appka sa tak môže spýtať hneď na začiatku, na jednom mieste a s
     * vysvetlením, namiesto toho, aby človek zisťoval až po týždni bez jedinej
     * jazdy, že mu chýbalo povolenie. iOS tieto metódy nemá — tam si o
     * notifikácie hovorí systém push a o pohyb sa pýta pri prvom čítaní
     * senzora, takže ich appka volá len na Androide.
     */
    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (!chybaNotifikacia() || !zacniPytat()) {
            call.resolve(povolenia());
            return;
        }
        requestPermissionForAlias("notifications", call, "poVyzve");
    }

    /** Notifikácie aj pohybové senzory naraz — jedno volanie, dve okná za sebou. */
    @PluginMethod
    public void requestExtraPermissions(PluginCall call) {
        if ((!chybaNotifikacia() && !chybaPohyb()) || !zacniPytat()) {
            call.resolve(povolenia());
            return;
        }
        requestPermissionForAlias("doplnkove", call, "poVyzve");
    }

    @PluginMethod
    public void requestMotionPermission(PluginCall call) {
        if (!chybaPohyb() || !zacniPytat()) {
            call.resolve(povolenia());
            return;
        }
        requestPermissionForAlias("motion", call, "poVyzve");
    }

    /**
     * Otvorí nastavenia aplikácie.
     *
     * Polohu „vždy" od Androidu 11 nevie appka vypýtať oknom — systém na ňu
     * žiadne nezobrazí a žiadosť rovno zamietne. Jediná cesta vedie cez
     * nastavenia, tak nech tam človek nemusí hľadať sám.
     */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent i = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(android.net.Uri.fromParts("package", getContext().getPackageName(), null))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Nastavenia sa nepodarilo otvoriť.");
        }
    }

    @PluginMethod
    public void requestBackgroundPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || !zacniPytat()) {
            call.resolve(povolenia());
            return;
        }
        requestPermissionForAlias("background", call, "poVyzve");
    }

    /**
     * Na Androide sa presná poloha pýta spolu s hrubou — samostatná dočasná
     * výnimka ako na iOS tu neexistuje. Vraciame teda len stav.
     */
    @PluginMethod
    public void requestPrecisePermission(PluginCall call) {
        if (!zacniPytat()) {
            call.resolve(povolenia());
            return;
        }
        requestPermissionForAlias("location", call, "poVyzve");
    }

    @PermissionCallback
    private void poVyzve(PluginCall call) {
        pytameSa = false;
        call.resolve(povolenia());
    }

    private JSObject povolenia() {
        JSObject von = new JSObject();
        von.put("location", stav(Manifest.permission.ACCESS_COARSE_LOCATION));
        von.put("background", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? stav(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                : stav(Manifest.permission.ACCESS_FINE_LOCATION));
        von.put("motion", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? stav("android.permission.ACTIVITY_RECOGNITION")
                : "granted");
        // „Presná poloha" je na Androide samostatné povolenie od verzie 12.
        von.put("precise", stav(Manifest.permission.ACCESS_FINE_LOCATION));
        von.put("notifications", Build.VERSION.SDK_INT >= 33
                ? stav("android.permission.POST_NOTIFICATIONS")
                : "granted");
        // Obnovovanie na pozadí Android nepozná; úsporný režim ale prácu na
        // pozadí obmedzuje rovnako účinne, takže ho hlásime.
        PowerManager pm = ContextCompat.getSystemService(getContext(), PowerManager.class);
        von.put("lowPower", pm != null && pm.isPowerSaveMode() ? "on" : "off");
        return von;
    }

    private String stav(String povolenie) {
        return ContextCompat.checkSelfPermission(getContext(), povolenie) == PackageManager.PERMISSION_GRANTED
                ? "granted"
                : "denied";
    }

    private boolean mameFinePolohu() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    // ── Udalosti zo služby ─────────────────────────────────────────────────

    @Override
    public void naJazduRozpoznanu(BufferedTrip trip) {
        JSObject e = new JSObject();
        e.put("tripId", trip.id);
        e.put("startedAt", JsPrevod.milis(trip.startedAt));
        notifyListeners("driveDetected", e);
    }

    @Override
    public void naZmenuJazdy(BufferedTrip trip) {
        notifyListeners("tripUpdated", naJs(JsPrevod.jazda(trip)));
    }

    @Override
    public void naKoniecJazdy(BufferedTrip trip) {
        notifyListeners("tripEnded", naJs(JsPrevod.jazda(trip)));
    }

    // ── Pomocné ────────────────────────────────────────────────────────────

    private void posliSluzbe(String akcia) {
        Intent i = new Intent(getContext(), DriveDetectorService.class).setAction(akcia);
        /*
          Vypnutie sa posiela ako obyčajná služba. `startForegroundService`
          zaväzuje ohlásiť sa do piatich sekúnd notifikáciou v popredí — a
          keby sa mala služba vzápätí zastaviť, systém by za nesplnený sľub
          zabil celú appku.
        */
        boolean vPopredi = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !DriveDetectorService.AKCIA_STOP.equals(akcia);
        try {
            if (vPopredi) getContext().startForegroundService(i);
            else getContext().startService(i);
        } catch (Exception ignored) {
            // Systém službu na pozadí nemusí pustiť (úsporný režim, zamknutá
            // appka). Pád appky to nesmie znamenať; detekcia sa zapne pri
            // najbližšom otvorení.
        }
    }

    /**
     * Služba je v inom vlákne, takže jazda nemusí byť uložená v tej istej
     * milisekunde. Chvíľu sa počká — dlhšie čakanie by znamenalo, že sa niečo
     * pokazilo, a vtedy je poctivejšie vrátiť prázdno.
     */
    private void cakajNaUlozenie(PluginCall call, boolean ocakavamJazdu) {
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
            BufferedTrip t = store.nacitajAktivnu();
            if (ocakavamJazdu) {
                if (t == null) {
                    call.reject("Jazdu sa nepodarilo spustiť.");
                    return;
                }
                call.resolve(naJs(JsPrevod.jazda(t)));
            } else {
                List<BufferedTrip> zoznam = store.nacitajNevyriesene();
                call.resolve(zabal(zoznam.isEmpty() ? null : zoznam.get(zoznam.size() - 1)));
            }
        }, 350);
    }

    /**
     * `JSObject.fromJSONObject` hlási kontrolovanú výnimku, hoci vstup je vždy
     * náš vlastný JSON. Zabalené na jednom mieste, nech to nezaťažuje každé
     * volanie zvlášť.
     */
    private static JSObject naJs(JSONObject j) {
        try {
            return JSObject.fromJSONObject(j);
        } catch (org.json.JSONException e) {
            return new JSObject();
        }
    }

    /** `null` sa cez mostík posiela ako objekt s `trip: null`, nie ako prázdno. */
    private JSObject zabal(BufferedTrip t) {
        JSObject von = new JSObject();
        von.put("trip", t == null ? JSObject.NULL : naJs(JsPrevod.jazda(t)));
        return von;
    }

    private JSObject diagnostika() {
        JSONObject d = store.nacitajDiagnostiku();
        JSObject von = naJs(JsPrevod.dennik(d));
        BufferedTrip aktivna = store.nacitajAktivnu();
        von.put("stav", aktivna != null ? "jazdi" : (store.jeMonitoring() ? "caka" : "caka"));
        von.put("sekundyNadPrahom", d.optDouble("sekundyNadPrahom", 0));
        von.put("potrebnychSekund", store.nacitajConfig().sustainedSeconds);
        von.put("prebudeni", d.optInt("prebudeni", 0));
        von.put("neuspesnychOvereni", d.optInt("neuspesnychOvereni", 0));
        von.put("najvyssiaRychlost", d.optDouble("najvyssiaRychlost", 0));
        return von;
    }
}
