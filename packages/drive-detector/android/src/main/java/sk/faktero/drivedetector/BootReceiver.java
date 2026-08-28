package sk.faktero.drivedetector;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;

import androidx.core.content.ContextCompat;

/**
 * Po reštarte telefónu sa detekcia musí naštartovať sama.
 *
 * Bez toho by človek po každom reštarte prišiel o sledovanie a zistil by to až
 * vtedy, keď by mu v knihe jázd chýbal celý deň.
 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        TripStore store = new TripStore(context);
        if (!store.jeMonitoring()) return;
        // Bez polohy systém službu typu „location" nepustí a appku by za
        // nesplnený sľub zabil hneď po štarte telefónu — teda vo chvíli, keď
        // sa človek nemá ako dozvedieť, čo sa stalo.
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) return;
        try {
            context.startForegroundService(
                    new Intent(context, DriveDetectorService.class).setAction(DriveDetectorService.AKCIA_START));
        } catch (Exception ignored) {
            // Systém nemusí štart na pozadí povoliť; detekcia sa zapne pri
            // najbližšom otvorení appky.
        }
    }
}
