import Foundation
import UIKit
import UserNotifications

/// Texty notifikácie prichádzajú z aplikácie cez `configure()`. V Swifte
/// nesmie byť ani slovo po slovensky — jazyk patrí appke, nie pluginu.
struct DriveNotificationTexts: Equatable {
    let title: String
    let body: String
    let businessLabel: String
    let privateLabel: String
    let discardLabel: String

    init(title: String, body: String, businessLabel: String, privateLabel: String, discardLabel: String) {
        self.title = title
        self.body = body
        self.businessLabel = businessLabel
        self.privateLabel = privateLabel
        self.discardLabel = discardLabel
    }

    init?(dictionary: [String: Any]?) {
        guard let d = dictionary,
              let title = d["title"] as? String,
              let body = d["body"] as? String,
              let business = d["businessLabel"] as? String,
              let privateLabel = d["privateLabel"] as? String,
              let discard = d["discardLabel"] as? String
        else { return nil }
        self.init(
            title: title,
            body: body,
            businessLabel: business,
            privateLabel: privateLabel,
            discardLabel: discard)
    }

    var dictionary: [String: Any] {
        [
            "title": title,
            "body": body,
            "businessLabel": businessLabel,
            "privateLabel": privateLabel,
            "discardLabel": discardLabel
        ]
    }
}

enum DriveNotificationAction {
    case business
    case privateDrive
    case discard
}

/// Notifikácia sa vypaľuje natívne, lebo v momente rozpoznania jazdy nemusí
/// bežať žiadny JavaScript — appka mohla byť dávno zabitá a systém nás
/// prebudil len kvôli polohe.
///
/// Delegáta si berieme sami a to, čo nie je naše, posielame ďalej pôvodnému.
/// Capacitor si svojho delegáta nastavuje až pri vzniku mosta, čo sa pri
/// prebudení na pozadí nemusí stať vôbec — keby sme čakali na neho, akcie
/// z notifikácie by sa stratili.
final class DriveNotifications: NSObject, UNUserNotificationCenterDelegate {
    static let categoryId = "SK_FAKTERO_DRIVE"
    static let actionBusiness = "SK_FAKTERO_DRIVE_BUSINESS"
    static let actionPrivate = "SK_FAKTERO_DRIVE_PRIVATE"
    static let actionDiscard = "SK_FAKTERO_DRIVE_DISCARD"

    var onAction: ((String, DriveNotificationAction) -> Void)?

    private weak var previousDelegate: UNUserNotificationCenterDelegate?
    private var installed = false

    func install() {
        claimDelegate()
        guard !installed else { return }
        installed = true
        // Most Capacitoru si delegáta prepíše, keď sa neskôr načíta WebView.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(claimDelegate),
            name: UIApplication.didBecomeActiveNotification,
            object: nil)
    }

    @objc private func claimDelegate() {
        let center = UNUserNotificationCenter.current()
        if let existing = center.delegate, existing !== self {
            previousDelegate = existing
        }
        center.delegate = self
    }

    /// Kategóriu treba zaregistrovať skôr, než príde prvá notifikácia — inak
    /// systém tlačidlá nezobrazí.
    func registerCategory(texts: DriveNotificationTexts) {
        let akcie = [
            UNNotificationAction(identifier: Self.actionBusiness, title: texts.businessLabel, options: []),
            UNNotificationAction(identifier: Self.actionPrivate, title: texts.privateLabel, options: []),
            UNNotificationAction(identifier: Self.actionDiscard, title: texts.discardLabel, options: [.destructive])
        ]
        let kategoria = UNNotificationCategory(
            identifier: Self.categoryId,
            actions: akcie,
            intentIdentifiers: [],
            options: [])
        UNUserNotificationCenter.current().setNotificationCategories([kategoria])
    }

    func fire(tripId: String, texts: DriveNotificationTexts) {
        let obsah = UNMutableNotificationContent()
        obsah.title = texts.title
        obsah.body = texts.body
        obsah.sound = .default
        obsah.categoryIdentifier = Self.categoryId
        obsah.userInfo = ["tripId": tripId]

        let ziadost = UNNotificationRequest(identifier: identifier(for: tripId), content: obsah, trigger: nil)
        UNUserNotificationCenter.current().add(ziadost)
    }

    func remove(tripId: String) {
        let id = [identifier(for: tripId)]
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: id)
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: id)
    }

    func requestAuthorization(completion: ((Bool) -> Void)? = nil) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, _ in
            completion?(granted)
        }
    }

    private func identifier(for tripId: String) -> String { "\(Self.categoryId)_\(tripId)" }

    // MARK: - UNUserNotificationCenterDelegate

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        guard notification.request.content.categoryIdentifier != Self.categoryId else {
            completionHandler([.banner, .list, .sound])
            return
        }
        let selector = #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:willPresent:withCompletionHandler:))
        if let predchodca = previousDelegate, predchodca.responds(to: selector) {
            predchodca.userNotificationCenter?(center, willPresent: notification, withCompletionHandler: completionHandler)
        } else {
            completionHandler([])
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let obsah = response.notification.request.content
        guard obsah.categoryIdentifier == Self.categoryId else {
            let selector = #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:didReceive:withCompletionHandler:))
            if let predchodca = previousDelegate, predchodca.responds(to: selector) {
                predchodca.userNotificationCenter?(center, didReceive: response, withCompletionHandler: completionHandler)
            } else {
                completionHandler()
            }
            return
        }

        if let tripId = obsah.userInfo["tripId"] as? String {
            switch response.actionIdentifier {
            case Self.actionBusiness:
                onAction?(tripId, .business)
            case Self.actionPrivate:
                onAction?(tripId, .privateDrive)
            case Self.actionDiscard:
                onAction?(tripId, .discard)
            default:
                // Ťuknutie na samotnú notifikáciu otvorí appku, kde sa jazda
                // zaradí ručne — nič sa tu nerozhoduje za človeka.
                break
            }
        }
        completionHandler()
    }
}
