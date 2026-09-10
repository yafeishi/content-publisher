import prisma from '@/lib/prisma';
import { AppSettings, defaultAppSettings, sanitizeAppSettings } from '@/lib/settings-schema';

export const APP_SETTINGS_KEY = 'app_settings_v1';

export async function getAppSettings(): Promise<AppSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: APP_SETTINGS_KEY } });
  if (!row) return defaultAppSettings;
  try {
    const parsed = JSON.parse(row.value) as Partial<AppSettings>;
    return sanitizeAppSettings(parsed);
  } catch {
    return defaultAppSettings;
  }
}

export async function saveAppSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getAppSettings();
  const merged = sanitizeAppSettings({ ...current, ...(settings || {}) });
  await prisma.appSetting.upsert({
    where: { key: APP_SETTINGS_KEY },
    create: {
      key: APP_SETTINGS_KEY,
      value: JSON.stringify(merged),
    },
    update: {
      value: JSON.stringify(merged),
    },
  });
  return merged;
}
