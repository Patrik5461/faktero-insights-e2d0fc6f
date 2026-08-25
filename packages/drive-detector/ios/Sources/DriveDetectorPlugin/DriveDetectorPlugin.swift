import Foundation
import Capacitor
import DriveDetectorCore

/// Most medzi JavaScriptom a detekciou. Sám nič nerozhoduje — všetko drží
/// `DriveDetectorService`, ktorý žije aj vtedy, keď WebView neexistuje.
@objc(DriveDetectorPlugin)
public class DriveDetectorPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DriveDetectorPlugin"
    public let jsName = "DriveDetector"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getBufferedTrip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getUnresolvedTrips", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "markSynced", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "confirmTrip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "discardTrip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startTrip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endTrip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestBackgroundPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPrecisePermission", returnType: CAPPluginReturnPromise)
    ]

    private let service = DriveDetectorService.shared

    override public func load() {
        service.delegate = self
        // Keby appku spustil používateľ (nie prebudenie na pozadí), toto je
        // prvé miesto, kde sa detekcia postaví na nohy.
        DispatchQueue.main.async { [weak self] in
            self?.service.bootstrap()
        }
    }

    // MARK: - Metódy

    @objc func configure(_ call: CAPPluginCall) {
        let values = call.jsObjectRepresentation
        onMain {
            self.service.configure(values: values)
            call.resolve()
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        onMain {
            self.service.start()
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        onMain {
            self.service.stop()
            call.resolve()
        }
    }

    @objc func getState(_ call: CAPPluginCall) {
        onMain {
            let aktivna: JSValue = self.service.activeTrip.map { $0.jsObject as JSValue } ?? NSNull()
            var diagnostika = JSObject()
            for (kluc, hodnota) in self.service.diagnostika {
                switch hodnota {
                // Všetko číselné ide ako Double — JavaScript iné čísla nepozná
                // a `Int` by tu závisel od toho, čo má Capacitor v `JSValue`.
                case let v as Int: diagnostika[kluc] = Double(v)
                case let v as Double: diagnostika[kluc] = v
                case let v as String: diagnostika[kluc] = v
                default: break
                }
            }
            call.resolve([
                "monitoring": self.service.isMonitoring,
                "activeTrip": aktivna,
                "diagnostika": diagnostika
            ])
        }
    }

    /// Obálka `{ trip }` je tu preto, že `resolve` vždy vracia objekt —
    /// „žiadna jazda" sa inak od prázdnej jazdy nedá odlíšiť.
    @objc func getBufferedTrip(_ call: CAPPluginCall) {
        onMain {
            let jazda: JSValue = self.service.bufferedTrip().map { $0.jsObject as JSValue } ?? NSNull()
            call.resolve(["trip": jazda])
        }
    }

    @objc func getUnresolvedTrips(_ call: CAPPluginCall) {
        onMain {
            let jazdy = self.service.unresolvedTrips().map { $0.jsObject as JSValue } as JSArray
            call.resolve(["trips": jazdy])
        }
    }

    @objc func markSynced(_ call: CAPPluginCall) {
        guard let tripId = call.getString("tripId") else {
            return call.reject("Chýba tripId.")
        }
        onMain {
            self.service.markSynced(tripId: tripId)
            call.resolve()
        }
    }

    @objc func confirmTrip(_ call: CAPPluginCall) {
        guard let tripId = call.getString("tripId") else {
            return call.reject("Chýba tripId.")
        }
        guard let raw = call.getString("classification"),
              let zaradenie = Classification(rawValue: raw)
        else {
            return call.reject("Neplatné zaradenie jazdy.")
        }
        onMain {
            guard let jazda = self.service.confirmTrip(tripId: tripId, classification: zaradenie) else {
                return call.reject("Jazda sa nenašla.")
            }
            call.resolve(jazda.jsObject)
        }
    }

    @objc func discardTrip(_ call: CAPPluginCall) {
        guard let tripId = call.getString("tripId") else {
            return call.reject("Chýba tripId.")
        }
        onMain {
            self.service.discardTrip(tripId: tripId)
            call.resolve()
        }
    }

    @objc func startTrip(_ call: CAPPluginCall) {
        onMain {
            guard let jazda = self.service.startManualTrip() else {
                return call.reject("Jazdu sa nepodarilo spustiť.")
            }
            call.resolve(jazda.jsObject)
        }
    }

    @objc func endTrip(_ call: CAPPluginCall) {
        onMain {
            let jazda: JSValue = self.service.endTrip().map { $0.jsObject as JSValue } ?? NSNull()
            call.resolve(["trip": jazda])
        }
    }

    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        onMain {
            call.resolve(self.povolenia())
        }
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        onMain {
            self.service.requestWhenInUse {
                call.resolve(self.povolenia())
            }
        }
    }

    @objc func requestBackgroundPermission(_ call: CAPPluginCall) {
        onMain {
            self.service.requestAlways {
                call.resolve(self.povolenia())
            }
        }
    }

    @objc func requestPrecisePermission(_ call: CAPPluginCall) {
        onMain {
            self.service.requestPrecise {
                call.resolve(self.povolenia())
            }
        }
    }

    private func povolenia() -> JSObject {
        var out = JSObject()
        for (kluc, hodnota) in service.permissions() { out[kluc] = hodnota }
        return out
    }

    /// CoreLocation sa obsluhuje z hlavného vlákna, JS most volá z iného.
    private func onMain(_ blok: @escaping () -> Void) {
        DispatchQueue.main.async(execute: blok)
    }
}

// MARK: - Udalosti do JS

extension DriveDetectorPlugin: DriveDetectorServiceDelegate {
    public func driveDetected(tripId: String, startedAt: TimeInterval) {
        notifyListeners("driveDetected", data: [
            "tripId": tripId,
            "startedAt": (startedAt * 1000).rounded()
        ])
    }

    public func tripUpdated(_ trip: BufferedTrip) {
        notifyListeners("tripUpdated", data: trip.jsObject)
    }

    public func tripEnded(_ trip: BufferedTrip) {
        notifyListeners("tripEnded", data: trip.jsObject)
    }

    public func permissionRevoked() {
        notifyListeners("permissionRevoked", data: [:])
    }
}
