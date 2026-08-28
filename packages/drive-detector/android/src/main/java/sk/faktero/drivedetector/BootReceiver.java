package sk.faktero.drivedetector;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

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
        context.startForegroundService(
                new Intent(context, DriveDetectorService.class).setAction(DriveDetectorService.AKCIA_START));
    }
}
