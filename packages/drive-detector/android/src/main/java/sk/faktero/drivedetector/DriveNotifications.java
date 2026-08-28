package sk.faktero.drivedetector;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONObject;

/**
 * Dve notifikácie, dva celkom iné účely.
 *
 * **Prúžok počas jazdy** je povinný — bez notifikácie v popredí Android službu
 * na pozadí po pár minútach zabije a jazda by sa merať prestala. Je preto tichý
 * a nedá sa odsunúť.
 *
 * **Otázka po rozpoznaní jazdy** je to, čo človek naozaj vidí: tri tlačidlá,
 * ktorými jazdu zaradí bez otvorenia aplikácie. Texty prídu z appky — natívna
 * vrstva o slovenčine nemá čo vedieť, appka má päť jazykov.
 */
public final class DriveNotifications {

    public static final String KANAL_BEH = "faktero_jazda_beh";
    public static final String KANAL_OTAZKA = "faktero_jazda_otazka";
    public static final int ID_BEH = 4711;
    public static final int ID_OTAZKA = 4712;

    public static final String AKCIA_SLUZOBNA = "sk.faktero.drivedetector.SLUZOBNA";
    public static final String AKCIA_SUKROMNA = "sk.faktero.drivedetector.SUKROMNA";
    public static final String AKCIA_ZAHODIT = "sk.faktero.drivedetector.ZAHODIT";
    public static final String EXTRA_TRIP = "tripId";

    private DriveNotifications() {}

    public static void pripravKanaly(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) return;

        // Nízka dôležitosť: prúžok musí byť vidieť, ale nesmie zvoniť pri každej jazde.
        NotificationChannel beh = new NotificationChannel(
                KANAL_BEH, "Priebeh jazdy", NotificationManager.IMPORTANCE_LOW);
        beh.setShowBadge(false);
        nm.createNotificationChannel(beh);

        NotificationChannel otazka = new NotificationChannel(
                KANAL_OTAZKA, "Rozpoznaná jazda", NotificationManager.IMPORTANCE_HIGH);
        nm.createNotificationChannel(otazka);
    }

    /** Prúžok, kým sa meria. Bez neho systém službu zabije. */
    public static Notification prubeh(Context context, String nadpis, String popis) {
        return new NotificationCompat.Builder(context, KANAL_BEH)
                .setContentTitle(nadpis)
                .setContentText(popis)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .build();
    }

    /**
     * Otázka po rozpoznaní jazdy. Keď appka texty nedodala, notifikácia sa
     * nevypáli vôbec — cudzia angličtina uprostred slovenskej appky je horšia
     * než ticho.
     */
    public static void spytajSa(Context context, String tripId, JSONObject texty) {
        if (texty == null) return;
        String nadpis = texty.optString("title", null);
        String popis = texty.optString("body", "");
        String sluzobna = texty.optString("businessLabel", null);
        String sukromna = texty.optString("privateLabel", null);
        String zahodit = texty.optString("discardLabel", null);
        if (nadpis == null || sluzobna == null || sukromna == null || zahodit == null) return;

        NotificationCompat.Builder b = new NotificationCompat.Builder(context, KANAL_OTAZKA)
                .setContentTitle(nadpis)
                .setContentText(popis)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .addAction(0, sluzobna, akcia(context, AKCIA_SLUZOBNA, tripId))
                .addAction(0, sukromna, akcia(context, AKCIA_SUKROMNA, tripId))
                .addAction(0, zahodit, akcia(context, AKCIA_ZAHODIT, tripId));

        try {
            NotificationManagerCompat.from(context).notify(ID_OTAZKA, b.build());
        } catch (SecurityException ignored) {
            // Povolenie na notifikácie nie je — meranie beží ďalej, len sa nepýtame.
        }
    }

    public static void zavriOtazku(Context context) {
        NotificationManagerCompat.from(context).cancel(ID_OTAZKA);
    }

    private static PendingIntent akcia(Context context, String akcia, String tripId) {
        Intent i = new Intent(context, DriveActionReceiver.class)
                .setAction(akcia)
                .putExtra(EXTRA_TRIP, tripId);
        return PendingIntent.getBroadcast(
                context,
                akcia.hashCode(),
                i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
