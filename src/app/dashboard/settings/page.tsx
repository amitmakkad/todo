"use client";

import { NotificationHelp } from "@/components/notification-help";
import { PushSetup } from "@/components/push-setup";

export default function SettingsPage() {
  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Settings</h1>
        <p className="text-sm text-zinc-500">
          Turn on reminders on this device, or send yourself a quick test below.
        </p>
      </div>
      <PushSetup />
      <NotificationHelp />
    </div>
  );
}
