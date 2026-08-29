package sk.faktero.drivedetector;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;

import android.os.Build;

import java.io.OutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Zapamätá si pád aplikácie, aby sa dal prečítať po jej ďalšom otvorení.
 *
 * Keď Android napíše „aplikácia sa opakovane zastavuje", nezostane po tom nič,
 * čo by sa dalo poslať — výpis je len v systémovom logu, ku ktorému sa človek
 * bez počítača nedostane. Bez neho sa príčina háda, a hádanie stálo dnes dva
 * pokusy. Tu sa uloží posledný výpis a Diagnostika ho ukáže; odtiaľ ho vie
 * človek poslať jedným klepnutím.
 *
 * Býva to v tomto module preto, že je to jediná natívna knižnica, ktorú majú
 * obe appky spoločnú. S detekciou jázd to inak nesúvisí.
 */
public final class PadAppky {

    private static final String SUBOR = "faktero_pady";
    private static final String KLUC = "posledny";
    /** Dlhý výpis nikto nečíta a do notifikácie sa aj tak nezmestí. */
    private static final int STROP = 4000;

    private PadAppky() {
    }

    /** Kam sa výpis posiela. Verejný endpoint — pri páde niet prihlásenia. */
    private static final String ADRESA = "https://www.faktero.sk/api/mobil/pad";

    public static void sleduj(Context context) {
        Context app = context.getApplicationContext();
        // Čo sa nazbieralo minule, nech odíde hneď — do Diagnostiky sa pri
        // páde pri štarte nikto nedostane.
        posliUlozeny(app);
        ohlasStart(app);
        Thread.UncaughtExceptionHandler predosly = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((vlakno, chyba) -> {
            try {
                zapis(app, vlakno, chyba);
            } catch (Throwable ignored) {
                // Zlyhanie zápisu nesmie prekryť pôvodnú chybu.
            }
            // Systém musí pád dokončiť po svojom — inak appka ostane visieť
            // v nepoužiteľnom stave namiesto toho, aby sa reštartovala.
            if (predosly != null) predosly.uncaughtException(vlakno, chyba);
        });
    }

    private static void zapis(Context app, Thread vlakno, Throwable chyba) {
        StringWriter out = new StringWriter();
        chyba.printStackTrace(new PrintWriter(out));
        String kedy = new SimpleDateFormat("d. M. yyyy H:mm:ss", Locale.US).format(new Date());
        String text = kedy + " (" + vlakno.getName() + ")\n" + out;
        if (text.length() > STROP) text = text.substring(0, STROP) + "…";
        prefs(app).edit().putString(KLUC, text).commit();
    }

    /**
     * Pošle uložený výpis na server a až po úspechu ho zabudne.
     *
     * Vlastné vlákno a krátke časové limity: toto beží pri štarte appky a
     * nesmie ju zdržať ani vtedy, keď telefón nemá signál. Keď sa nepodarí,
     * výpis ostáva a skúsi sa pri ďalšom otvorení.
     */
    private static void posliUlozeny(Context app) {
        String vypis = posledny(app);
        if (vypis == null) return;
        new Thread(() -> {
            // Zabudne sa až po úspechu — bez signálu výpis ostáva.
            if (posli(app, "pad", vypis)) zabudni(app);
        }, "faktero-pad").start();
    }

    /** Odoslanie na server. Vracia `true`, keď to server prijal. */
    private static boolean posli(Context app, String typ, String vypis) {
        HttpURLConnection spojenie = null;
        try {
            String telo = "{\"balicek\":" + json(app.getPackageName())
                    + ",\"system\":" + json("Android " + Build.VERSION.RELEASE + " / " + Build.MODEL)
                    + ",\"typ\":" + json(typ)
                    + ",\"vypis\":" + json(vypis) + "}";
            spojenie = (HttpURLConnection) new URL(ADRESA).openConnection();
            spojenie.setRequestMethod("POST");
            spojenie.setRequestProperty("Content-Type", "application/json");
            spojenie.setConnectTimeout(8000);
            spojenie.setReadTimeout(8000);
            spojenie.setDoOutput(true);
            try (OutputStream out = spojenie.getOutputStream()) {
                out.write(telo.getBytes(StandardCharsets.UTF_8));
            }
            int stav = spojenie.getResponseCode();
            return stav >= 200 && stav < 300;
        } catch (Exception e) {
            return false;
        } finally {
            if (spojenie != null) spojenie.disconnect();
        }
    }

    /**
     * Ohlási, že sa appka spustila — len zo skúšobných buildov.
     *
     * Pri hľadaní chyby je to jediný spôsob, ako odlíšiť „appka sa ani
     * nespustila" od „appka beží a padá až niekde ďalej", a zároveň zistiť,
     * ktorý balíček má človek naozaj v telefóne. Z buildu pre obchod sa
     * neposiela nič: `FLAG_DEBUGGABLE` má len skúšobná verzia.
     */
    private static void ohlasStart(Context app) {
        if ((app.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) == 0) return;
        new Thread(() -> {
            try {
                PackageInfo info = app.getPackageManager().getPackageInfo(app.getPackageName(), 0);
                String kedy = new SimpleDateFormat("d. M. yyyy H:mm", Locale.US)
                        .format(new Date(info.lastUpdateTime));
                posli(app, "start", "Appka sa spustila. Verzia " + info.versionName
                        + ", nainštalovaná " + kedy + ".");
            } catch (Exception ignored) {
                // Ohlásenie štartu nesmie appke prekážať.
            }
        }, "faktero-start").start();
    }

    /** Reťazec do JSON. Vlastné, aby modul nezávisel od žiadnej knižnice. */
    private static String json(String text) {
        StringBuilder sb = new StringBuilder("\"");
        for (char z : text.toCharArray()) {
            switch (z) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (z < 0x20) sb.append(String.format("\\u%04x", (int) z));
                    else sb.append(z);
            }
        }
        return sb.append('"').toString();
    }

    /** Posledný pád, alebo `null`. */
    public static String posledny(Context context) {
        return prefs(context).getString(KLUC, null);
    }

    public static void zabudni(Context context) {
        prefs(context).edit().remove(KLUC).apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(SUBOR, Context.MODE_PRIVATE);
    }
}
