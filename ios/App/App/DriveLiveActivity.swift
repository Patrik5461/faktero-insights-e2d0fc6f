import ActivityKit
import Foundation
import FakteroDriveDetector

/**
 Prúžok „Nahrávam jazdu" na uzamknutej obrazovke a v Dynamic Islande.

 Notifikácia o rozpoznanej jazde príde **raz** a v aute sa ľahko prehliadne —
 telefón býva vo vrecku alebo v držiaku so zapnutým sústredením na šoférovanie.
 Človek potom celú cestu nevie, či sa niečo nahráva, a istotu má až po príchode
 v knihe jázd. Prúžok je odpoveď na to: kým jazda beží, je na uzamknutej
 obrazovke a rastú mu kilometre; netreba naň ani odomykať telefón.

 Prečo to nie je v plugine: plugin má byť o meraní, nie o kreslení, a prúžok
 musí kresliť rozšírenie appky, ktoré s pluginom nič spoločné nemá. Sem sa
 dostávajú len ohlásenia (`Notification.Name.fakteroDrive*`).

 Živé aktivity existujú od iOS 16.1, appka beží od 15.0 — na starších
 telefónoch tu teda nesmie nastať nič a jazda sa nahráva ako doteraz.
 */
final class DriveLiveActivity {

    static let shared = DriveLiveActivity()

    /// Ako často sa prúžok prekresľuje. ActivityKit má denný strop na počet
    /// obnovení, takže častejšie než raz za pol minúty to nemá zmysel — a na
    /// kilometre v aute to bohato stačí.
    private static let obnovaSekund: TimeInterval = 30

    private var poslednaObnova = Date.distantPast
    /// Začiatok bežiacej jazdy — pri ukončení sa posiela ten istý, aký prúžok
    /// dostal na začiatku, nie „teraz".
    private var zaciatokJazdy = Date()

    /// Typ sa nedá napísať bez `@available`, preto `Any` a pretypovanie nižšie.
    private var beziacaAktivita: Any?

    private var odbery: [NSObjectProtocol] = []

    private init() {}

    /// Odberom cez uzáver (nie `#selector`) naschvál: selektor by si vyžiadal
    /// dedenie z `NSObject` a preklep v jeho mene by sa prejavil až pádom
    /// v aute, nie pri preklade.
    func zacniPocuvat() {
        odoberaj(.fakteroDriveStarted) { [weak self] n in
            guard #available(iOS 16.1, *) else { return }
            self?.zapni(
                zaciatok: DriveLiveActivity.datum(n.userInfo?[DriveEventKey.startedAt]),
                rucna: n.userInfo?[DriveEventKey.manual] as? Bool ?? false)
        }
        odoberaj(.fakteroDriveUpdated) { [weak self] n in
            guard #available(iOS 16.1, *) else { return }
            self?.obnov(
                km: DriveLiveActivity.kilometre(n.userInfo?[DriveEventKey.distanceMeters]),
                zaciatok: DriveLiveActivity.datum(n.userInfo?[DriveEventKey.startedAt]),
                rucna: n.userInfo?[DriveEventKey.manual] as? Bool ?? false)
        }
        odoberaj(.fakteroDriveEnded) { [weak self] n in
            guard #available(iOS 16.1, *) else { return }
            self?.ukonci(km: DriveLiveActivity.kilometre(n.userInfo?[DriveEventKey.distanceMeters]))
        }
    }

    private func odoberaj(_ meno: Notification.Name, _ co: @escaping (Notification) -> Void) {
        odbery.append(
            NotificationCenter.default.addObserver(
                forName: meno, object: nil, queue: .main, using: co))
    }

    // MARK: - Ohlásenia z detekcie

    private static func kilometre(_ hodnota: Any?) -> Double {
        (hodnota as? Double ?? 0) / 1000
    }

    /// Časy chodia z detekcie ako sekundy od roku 1970.
    private static func datum(_ hodnota: Any?) -> Date {
        guard let sekundy = hodnota as? TimeInterval else { return Date() }
        return Date(timeIntervalSince1970: sekundy)
    }

    // MARK: - ActivityKit

    @available(iOS 16.1, *)
    private func zapni(zaciatok: Date, rucna: Bool) {
        // Človek si ich môže vypnúť v Nastaveniach a potom `request` len hodí
        // chybu — nemá zmysel to ani skúšať.
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        // Dve jazdy naraz nie sú, ale po páde appky môže prúžok z minulej
        // ostať visieť — nech ich tam nie je viac.
        ukonciVsetkyStare()

        zaciatokJazdy = zaciatok
        let stav = DriveActivityAttributes.ContentState(kilometre: 0, zaciatok: zaciatok)
        do {
            beziacaAktivita = try Activity<DriveActivityAttributes>.request(
                attributes: DriveActivityAttributes(rucna: rucna),
                contentState: stav)
            poslednaObnova = Date()
        } catch {
            // Neúspech nesmie zhodiť jazdu — meranie beží ďalej aj bez prúžku.
            beziacaAktivita = nil
        }
    }

    @available(iOS 16.1, *)
    private func obnov(km: Double, zaciatok: Date, rucna: Bool) {
        /*
          Appku mohol systém zabiť a znovu spustiť uprostred jazdy — detekcia
          beží aj vtedy, keď appka nebeží. Prvá správa o kilometroch je vtedy
          jediná príležitosť prúžok vôbec zapnúť; správu o začiatku jazdy sme
          zmeškali, lebo v tej chvíli sme neexistovali.
        */
        guard let aktivita = beziacaAktivita as? Activity<DriveActivityAttributes> else {
            zapni(zaciatok: zaciatok, rucna: rucna)
            return
        }
        let teraz = Date()
        guard teraz.timeIntervalSince(poslednaObnova) >= Self.obnovaSekund else { return }
        poslednaObnova = teraz

        let stav = DriveActivityAttributes.ContentState(kilometre: km, zaciatok: zaciatok)
        Task { await aktivita.update(using: stav) }
    }

    @available(iOS 16.1, *)
    private func ukonci(km: Double) {
        guard let aktivita = beziacaAktivita as? Activity<DriveActivityAttributes> else { return }
        beziacaAktivita = nil
        let stav = DriveActivityAttributes.ContentState(kilometre: km, zaciatok: zaciatokJazdy)
        Task {
            // `.immediate` naschvál: po zaparkovaní nemá čo na obrazovke visieť.
            await aktivita.end(using: stav, dismissalPolicy: .immediate)
        }
    }

    @available(iOS 16.1, *)
    private func ukonciVsetkyStare() {
        for aktivita in Activity<DriveActivityAttributes>.activities {
            Task { await aktivita.end(dismissalPolicy: .immediate) }
        }
    }
}
