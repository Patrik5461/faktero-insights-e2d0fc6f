/**
 * Checklist data — používa sa v admin UI alebo CLI skripte na overenie
 * že appka je pripravená na submission.
 */
export const APP_STORE_PREP = {
  ios: {
    bundleId: "sk.faktero.app",
    minOs: "iOS 14.0",
    category: "Business",
    ageRating: "4+",
    privacyManifest: "ios/App/App/PrivacyInfo.xcprivacy",
    requiredPermissions: [
      { key: "NSCameraUsageDescription", reason: "Skenovanie dokladov a fotografie faktúr" },
      { key: "NSLocationWhenInUseUsageDescription", reason: "Záznam trasy v knihe jázd" },
      { key: "NSFaceIDUsageDescription", reason: "Rýchle prihlásenie cez Face ID" },
      { key: "NSPhotoLibraryUsageDescription", reason: "Ukladanie a načítanie príloh faktúr" },
    ],
    capabilities: ["Push Notifications", "Background Modes → Remote notifications"],
    screenshotSizes: ['6.7" (1290×2796)', '6.1" (1179×2556)', 'iPad 12.9" (2048×2732)'],
    privacyPolicyUrl: "https://www.faktero.sk/pravne/gdpr",
    supportUrl: "https://www.faktero.sk/pomoc",
    marketingUrl: "https://www.faktero.sk",
  },
  android: {
    packageName: "sk.faktero.app",
    targetSdk: 34,
    minSdk: 24,
    category: "BUSINESS",
    contentRating: "Everyone",
    permissions: [
      "android.permission.INTERNET",
      "android.permission.CAMERA",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.USE_BIOMETRIC",
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.RECEIVE_BOOT_COMPLETED",
    ],
    screenshotSizes: ["Phone (1080×1920+)", '7" tablet', '10" tablet'],
    privacyPolicyUrl: "https://www.faktero.sk/pravne/gdpr",
    dataSafetyUrl: "https://www.faktero.sk/pravne/gdpr",
  },
} as const;

export type AppStorePrep = typeof APP_STORE_PREP;
