import Foundation

public enum Distance {
    /// Polomer Zeme v metroch (stredný).
    static let earthRadius: Double = 6_371_000

    /// Haversine. CLLocation.distance(from:) by bol presnejší, ale ten sem
    /// nesmie — jadro musí ísť otestovať bez CoreLocation.
    public static func meters(from a: TripPoint, to b: TripPoint) -> Double {
        let toRad = Double.pi / 180
        let dLat = (b.lat - a.lat) * toRad
        let dLng = (b.lng - a.lng) * toRad
        let lat1 = a.lat * toRad
        let lat2 = b.lat * toRad
        let h = pow(sin(dLat / 2), 2) + pow(sin(dLng / 2), 2) * cos(lat1) * cos(lat2)
        return 2 * earthRadius * asin(min(1, sqrt(h)))
    }

    /// Súčet vzdialeností medzi po sebe idúcimi bodmi.
    public static func total(of points: [TripPoint]) -> Double {
        guard points.count > 1 else { return 0 }
        var spolu: Double = 0
        for i in 1..<points.count {
            spolu += meters(from: points[i - 1], to: points[i])
        }
        return spolu
    }

    public static func maxSpeed(of points: [TripPoint]) -> Double {
        points.reduce(0) { max($0, $1.speedKmh) }
    }
}
