/**
 * Vehicle category feature catalog (03-A03).
 *
 * Versioned, documented feature keys. Labels are the localized display
 * strings (ar/fr/en) used by the fleet UI (03-D); keys are stable.
 */
export const FEATURE_CATALOG = {
  AIR_CONDITIONING: 'air_conditioning',
  HEATED_SEATS: 'heated_seats',
  BLUETOOTH: 'bluetooth',
  USB_PORTS: 'usb_ports',
  ANDROID_AUTO: 'android_auto',
  APPLE_CARPLAY: 'apple_carplay',
  GPS_NAVIGATION: 'gps_navigation',
  CRUISE_CONTROL: 'cruise_control',
  PARKING_SENSORS: 'parking_sensors',
  BACKUP_CAMERA: 'backup_camera',
  KEYLESS_ENTRY: 'keyless_entry',
  SUNROOF: 'sunroof',
} as const;

export type FeatureKey = (typeof FEATURE_CATALOG)[keyof typeof FEATURE_CATALOG];

export const FEATURE_LABELS: Record<FeatureKey, { ar: string; fr: string; en: string }> = {
  [FEATURE_CATALOG.AIR_CONDITIONING]: {
    ar: 'تكييف هواء',
    fr: 'Climatisation',
    en: 'Air conditioning',
  },
  [FEATURE_CATALOG.HEATED_SEATS]: {
    ar: 'مقاعد مدفأة',
    fr: 'Sièges chauffants',
    en: 'Heated seats',
  },
  [FEATURE_CATALOG.BLUETOOTH]: { ar: 'بلوتوث', fr: 'Bluetooth', en: 'Bluetooth' },
  [FEATURE_CATALOG.USB_PORTS]: { ar: 'منافذ USB', fr: 'Ports USB', en: 'USB ports' },
  [FEATURE_CATALOG.ANDROID_AUTO]: { ar: 'أندرويد أوتو', fr: 'Android Auto', en: 'Android Auto' },
  [FEATURE_CATALOG.APPLE_CARPLAY]: { ar: 'أبل كار بلاي', fr: 'Apple CarPlay', en: 'Apple CarPlay' },
  [FEATURE_CATALOG.GPS_NAVIGATION]: {
    ar: 'نظام ملاحة',
    fr: 'Navigation GPS',
    en: 'GPS navigation',
  },
  [FEATURE_CATALOG.CRUISE_CONTROL]: {
    ar: 'مثبت سرعة',
    fr: 'Régulateur de vitesse',
    en: 'Cruise control',
  },
  [FEATURE_CATALOG.PARKING_SENSORS]: {
    ar: 'حساسات ركن',
    fr: 'Capteurs de stationnement',
    en: 'Parking sensors',
  },
  [FEATURE_CATALOG.BACKUP_CAMERA]: {
    ar: 'كاميرا خلفية',
    fr: 'Caméra de recul',
    en: 'Backup camera',
  },
  [FEATURE_CATALOG.KEYLESS_ENTRY]: {
    ar: 'دخول بدون مفتاح',
    fr: 'Entrée sans clé',
    en: 'Keyless entry',
  },
  [FEATURE_CATALOG.SUNROOF]: { ar: 'سقف بانورامي', fr: 'Toit ouvrant', en: 'Sunroof' },
};

export const ALL_FEATURE_KEYS: readonly FeatureKey[] = Object.values(FEATURE_CATALOG);

export function isFeatureKey(value: string): value is FeatureKey {
  return (ALL_FEATURE_KEYS as readonly string[]).includes(value);
}
