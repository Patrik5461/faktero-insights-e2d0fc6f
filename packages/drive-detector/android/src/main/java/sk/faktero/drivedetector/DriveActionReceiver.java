package sk.faktero.drivedetector;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Tlačidlá v notifikácii. Odpoveď musí prejsť aj vtedy, keď appka nebeží —
 * práve preto sa na ňu odpovedá z notifikácie a nie v aplikácii.
 */
public class DriveActionReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String akcia = intent.getAction();
        String tripId = intent.getStringExtra(DriveNotifications.EXTRA_TRIP);
        if (akcia == null) return;

        Intent pre = new Intent(context, DriveDetectorService.class)
                .setAction(akcia)
                .putExtra(DriveNotifications.EXTRA_TRIP, tripId);
        // Služba beží v popredí, takže ju smieme naštartovať aj z pozadia.
        context.startService(pre);
        DriveNotifications.zavriOtazku(context);
    }
}
