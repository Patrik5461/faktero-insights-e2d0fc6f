import ActivityKit
import Foundation

/**
 Údaje prúžku na uzamknutej obrazovke počas jazdy.

 Tento súbor je v **dvoch cieľoch naraz** — v appke, ktorá prúžok zapína, aj
 v rozšírení, ktoré ho kreslí. Sú to dva samostatné programy a spoločnú pamäť
 nemajú; ActivityKit ich spája podľa mena typu a podľa toho, že sa údaje dajú
 zakódovať rovnako. Preto jeden súbor a nie dve kópie: pri dvoch kópiách stačí
 premenovať jedno pole a prúžok prestane chodiť, pričom sa nič nepokazí ani
 nezobrazí chyba — len sa nikdy neukáže.

 `ContentState` je to, čo sa počas jazdy mení; `DriveActivityAttributes` to,
 čo platí celú jazdu.

 Označenie verzie je povinné: `ActivityAttributes` existuje až od iOS 16.1,
 kým appka beží od 15.0 — bez neho sa cieľ appky ani neskompiluje.
 */
@available(iOS 16.1, *)
struct DriveActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        /// Prejdené kilometre.
        var kilometre: Double
        /// Kedy jazda začala — z toho si prúžok počíta, ako dlho beží.
        var zaciatok: Date
    }

    /// `true`, keď jazdu spustil človek tlačidlom, nie detekcia.
    var rucna: Bool
}
