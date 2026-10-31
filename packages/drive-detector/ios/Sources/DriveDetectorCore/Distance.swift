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

    /// Nad touto rýchlosťou to už nie je jazda, ale skok polohy.
    ///
    /// GPS v meste, v tuneli alebo pri chytaní signálu občas hodí polohu
    /// o stovky metrov vedľa. Taký úsek sa nesmie započítať ani do kilometrov,
    /// ani do najvyššej rýchlosti — kniha jázd by tvrdila, že auto prešlo
    /// cestu, ktorú nešlo. Rovnaká hranica je v appke (`gps-tracker.ts`,
    /// `auto-jazdy.ts`) aj v jadre pre Android.
    public static let maxRozumnaKmh: Double = 250

    /// Je úsek medzi dvoma bodmi vôbec možný? Bez času sa to posúdiť nedá,
    /// taký úsek sa radšej započíta.
    public static func verohodny(from a: TripPoint, to b: TripPoint) -> Bool {
        let sekundy = b.timestamp - a.timestamp
        guard sekundy > 0 else { return true }
        return meters(from: a, to: b) / sekundy * 3.6 <= maxRozumnaKmh
    }

    /// Dĺžka úseku, ktorá sa pripočíta k jazde — skok polohy je nula.
    public static func usek(from a: TripPoint, to b: TripPoint) -> Double {
        verohodny(from: a, to: b) ? meters(from: a, to: b) : 0
    }

    /// Súčet vzdialeností medzi po sebe idúcimi bodmi, bez skokov polohy.
    public static func total(of points: [TripPoint]) -> Double {
        guard points.count > 1 else { return 0 }
        var spolu: Double = 0
        for i in 1..<points.count {
            spolu += usek(from: points[i - 1], to: points[i])
        }
        return spolu
    }

    /// Najvyššia nameraná rýchlosť; nezmysly nad hranicou sa nepočítajú.
    public static func maxSpeed(of points: [TripPoint]) -> Double {
        points.reduce(0) { $1.speedKmh <= maxRozumnaKmh ? max($0, $1.speedKmh) : $0 }
    }
}
