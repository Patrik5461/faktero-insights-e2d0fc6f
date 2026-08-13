import Foundation

/// Jedno meranie polohy tak, ako príde zo systému — bez CoreLocation, aby sa
/// kaskáda dala testovať bez zariadenia.
public struct Fix: Equatable {
    public let lat: Double
    public let lng: Double
    /// Záporná, keď zariadenie rýchlosť nevie určiť. iOS to robí bežne.
    public let speedKmh: Double
    /// Záporná, keď je poloha neplatná.
    public let accuracy: Double
    public let altitude: Double?
    public let timestamp: TimeInterval

    public init(
        lat: Double,
        lng: Double,
        speedKmh: Double,
        accuracy: Double,
        altitude: Double? = nil,
        timestamp: TimeInterval
    ) {
        self.lat = lat
        self.lng = lng
        self.speedKmh = speedKmh
        self.accuracy = accuracy
        self.altitude = altitude
        self.timestamp = timestamp
    }
}

public struct TripPoint: Equatable {
    public let lat: Double
    public let lng: Double
    public let speedKmh: Double
    public let accuracy: Double
    public let altitude: Double?
    public let timestamp: TimeInterval

    public init(
        lat: Double,
        lng: Double,
        speedKmh: Double,
        accuracy: Double,
        altitude: Double?,
        timestamp: TimeInterval
    ) {
        self.lat = lat
        self.lng = lng
        self.speedKmh = speedKmh
        self.accuracy = accuracy
        self.altitude = altitude
        self.timestamp = timestamp
    }

    public init(fix: Fix) {
        self.init(
            lat: fix.lat,
            lng: fix.lng,
            speedKmh: fix.speedKmh,
            accuracy: fix.accuracy,
            altitude: fix.altitude,
            timestamp: fix.timestamp)
    }
}

public enum Classification: String {
    case business
    /// `private` je v Swifte kľúčové slovo, do JS ide reťazcová hodnota.
    case privateDrive = "private"
}

public struct BufferedTrip: Equatable {
    public let id: String
    public let startedAt: TimeInterval
    public var endedAt: TimeInterval?
    public var points: [TripPoint]
    public var distanceMeters: Double
    public var maxSpeedKmh: Double
    public var classification: Classification?
    /// Jazdu spustil človek tlačidlom, nie detekcia.
    public let manual: Bool

    public init(
        id: String,
        startedAt: TimeInterval,
        endedAt: TimeInterval? = nil,
        points: [TripPoint] = [],
        distanceMeters: Double = 0,
        maxSpeedKmh: Double = 0,
        classification: Classification? = nil,
        manual: Bool = false
    ) {
        self.id = id
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.points = points
        self.distanceMeters = distanceMeters
        self.maxSpeedKmh = maxSpeedKmh
        self.classification = classification
        self.manual = manual
    }

    /// Priemer sa počíta z prejdenej vzdialenosti a času, nie z priemeru
    /// nameraných rýchlostí — merania chodia nepravidelne (filter na 30 m),
    /// takže ich priemer by nadhodnocoval rýchlu časť jazdy.
    public var avgSpeedKmh: Double {
        let koniec = endedAt ?? points.last?.timestamp ?? startedAt
        let trvanie = koniec - startedAt
        guard trvanie > 0 else { return 0 }
        return distanceMeters / trvanie * 3.6
    }
}

public struct DetectorConfig: Equatable {
    public var speedThresholdKmh: Double = 32
    public var sustainedSeconds: Double = 60
    public var minConsecutiveFixes: Int = 3
    public var maxAccuracyMeters: Double = 50
    public var debounceMinutes: Double = 30
    public var stopSpeedKmh: Double = 5
    public var stopAfterSeconds: Double = 300
    public var distanceFilterMeters: Double = 30

    /// Strop overovania. Po ňom sa presná poloha vypína, nech to dopadne akokoľvek.
    public var verificationWindowSeconds: Double = 90
    /// Skrátené držanie prahu, keď pohybové senzory hlásia jazdu autom.
    public var automotiveSustainedSeconds: Double = 30

    public init() {}
}

public enum DetectorState: String {
    case idle
    case verifying
    case driving
}

/// Čo má obslužná vrstva spraviť. Motor sám nesiaha na hardvér ani na databázu.
public enum DetectorEffect: Equatable {
    case startPreciseUpdates
    case stopPreciseUpdates
    case startMotionUpdates
    case stopMotionUpdates
    /// `notify` je `false` pri ručne spustenej jazde — kto stlačil tlačidlo,
    /// nepotrebuje notifikáciu s otázkou, či ide.
    case tripStarted(BufferedTrip, notify: Bool)
    case pointAppended(tripId: String, point: TripPoint)
    case tripEnded(BufferedTrip)
    case bufferDiscarded
}
