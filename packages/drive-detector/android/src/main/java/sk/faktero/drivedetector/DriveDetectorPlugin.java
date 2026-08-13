package sk.faktero.drivedetector;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Kostra pre Android.
 *
 * Rovnaké názvy metód ako na iOS, ale každá povie, že nie je hotová. Vďaka
 * tomu je TypeScript vrstva platformovo neutrálna a doplnenie Androidu
 * (Fused Location + Activity Recognition + Foreground Service) sa zaobíde bez
 * zmeny rozhrania.
 */
@CapacitorPlugin(name = "DriveDetector")
public class DriveDetectorPlugin extends Plugin {

    private static final String SPRAVA = "Detekcia jazdy zatiaľ nie je pre Android implementovaná.";

    @PluginMethod
    public void configure(PluginCall call) {
        call.unimplemented(SPRAVA);
    }

    @PluginMethod
    public void start(PluginCall call) {
        call.unimplemented(SPRAVA);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        call.unimplemented(SPRAVA);
    }

    @PluginMethod
    public void getState(PluginCall call) {
        call.unimplemented(SPRAVA);
    }

    @PluginMethod
    public void getBufferedTrip(PluginCall call) {
        call.unimplemented(SPRAVA);
    }

    @PluginMethod
    public void confirmTrip(PluginCall call) {
        call.unimplemented(SPRAVA);
    }

    @PluginMethod
    public void discardTrip(PluginCall call) {
        call.unimplemented(SPRAVA);
    }

    @PluginMethod
    public void startTrip(PluginCall call) {
        call.unimplemented(SPRAVA);
    }

    @PluginMethod
    public void endTrip(PluginCall call) {
        call.unimplemented(SPRAVA);
    }

    @Override
    @PluginMethod
    public void checkPermissions(PluginCall call) {
        call.unimplemented(SPRAVA);
    }

    @Override
    @PluginMethod
    public void requestPermissions(PluginCall call) {
        call.unimplemented(SPRAVA);
    }

    @PluginMethod
    public void requestBackgroundPermission(PluginCall call) {
        call.unimplemented(SPRAVA);
    }
}
