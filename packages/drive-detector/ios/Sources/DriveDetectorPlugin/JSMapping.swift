import Foundation
import Capacitor
import DriveDetectorCore

/// Natívne sa s časom pracuje v sekundách, JavaScript počíta v milisekundách.
/// Prevod je na jednom mieste, aby sa niekde nezabudol.
private func milis(_ cas: TimeInterval) -> Double {
    (cas * 1000).rounded()
}

extension TripPoint {
    var jsObject: JSObject {
        var o = JSObject()
        o["lat"] = lat
        o["lng"] = lng
        o["speedKmh"] = speedKmh
        o["accuracy"] = accuracy
        o["altitude"] = altitude.map { $0 as JSValue } ?? NSNull()
        o["timestamp"] = milis(timestamp)
        return o
    }
}

extension BufferedTrip {
    var jsObject: JSObject {
        var o = JSObject()
        o["id"] = id
        o["startedAt"] = milis(startedAt)
        o["endedAt"] = endedAt.map { milis($0) as JSValue } ?? NSNull()
        o["points"] = points.map { $0.jsObject as JSValue } as JSArray
        o["distanceMeters"] = distanceMeters
        o["maxSpeedKmh"] = maxSpeedKmh
        o["avgSpeedKmh"] = avgSpeedKmh
        o["classification"] = classification.map { $0.rawValue as JSValue } ?? NSNull()
        o["manual"] = manual
        return o
    }
}
