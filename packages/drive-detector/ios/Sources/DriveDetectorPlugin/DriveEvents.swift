import Foundation

/// Ohlásenie jazdy do zvyšku aplikácie.
///
/// Plugin o Live Activity nevie a vedieť nemá — je to vec appky, rovnako ako
/// jazyk textov. Tadiaľto sa len povie „jazda začala / posunula sa / skončila"
/// a čo s tým, si rozhodne appka: dnes z toho kreslí prúžok na uzamknutej
/// obrazovke, zajtra môže čokoľvek iné.
///
/// `NotificationCenter`, nie delegát: delegáta má plugin obsadeného mostom do
/// JavaScriptu, a hlavne — pri prebudení na pozadí žiadny JavaScript nebeží,
/// zatiaľ čo appka (jej natívna časť) beží vždy.
public extension Notification.Name {
    /// Jazda sa začala. `userInfo`: `tripId`, `startedAt`, `manual`.
    static let fakteroDriveStarted = Notification.Name("sk.faktero.drive.started")
    /// Pribudli kilometre. `userInfo`: `tripId`, `startedAt`, `distanceMeters`.
    static let fakteroDriveUpdated = Notification.Name("sk.faktero.drive.updated")
    /// Jazda skončila. `userInfo`: `tripId`, `distanceMeters`.
    static let fakteroDriveEnded = Notification.Name("sk.faktero.drive.ended")
}

/// Kľúče v `userInfo`. Ako konštanty preto, že preklep v reťazci sa nikde
/// neprejaví — prúžok by len ostal prázdny a nikto by nevedel prečo.
public enum DriveEventKey {
    public static let tripId = "tripId"
    public static let startedAt = "startedAt"
    public static let distanceMeters = "distanceMeters"
    public static let manual = "manual"
}
