package sk.faktero.drivedetector;

import android.content.Context;
import android.content.SharedPreferences;

import java.io.PrintWriter;
import java.io.StringWriter;
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

    public static void sleduj(Context context) {
        Context app = context.getApplicationContext();
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
