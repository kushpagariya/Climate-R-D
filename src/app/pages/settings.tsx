export function SettingsPage() {
  return (
    <section className="w-full p-6">
      <div className="max-w-4xl">
        <p className="text-sm uppercase tracking-[0.2em] text-cyan-300">
          Preferences
        </p>
        <h2 className="mt-2 text-2xl font-semibold">Settings</h2>
        <div className="mt-6 grid gap-4 text-sm text-muted-foreground">
          <div>Account Information</div>
          <div>Organization</div>
          <div>Theme</div>
          <div>Notification Preferences</div>
          <div>Data Export</div>
        </div>
      </div>
    </section>
  );
}
