import { useAuth } from "../auth/use-auth";

export function ProfilePage() {
  const { user } = useAuth();

  return (
    <section className="w-full p-6">
      <div className="max-w-4xl">
        <p className="text-sm uppercase tracking-[0.2em] text-cyan-300">
          Account
        </p>
        <h2 className="mt-2 text-2xl font-semibold">Profile</h2>
        <div className="mt-6 grid gap-3 text-sm text-muted-foreground">
          <div>Name: {user?.fullName ?? "Unknown"}</div>
          <div>Email: {user?.email ?? "Unknown"}</div>
          <div>Organization: {user?.organization || "Not provided"}</div>
          <div>Role: {user?.role || "Not selected"}</div>
        </div>
      </div>
    </section>
  );
}
