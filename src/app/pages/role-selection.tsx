import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { AlertCircle, ArrowRight, Loader2, UserCheck } from "lucide-react";
import { roleOptions } from "../auth/onboarding-options";
import type { UserRole } from "../auth/auth-types";
import { useAuth } from "../auth/use-auth";
import { AuthShell } from "../components/auth/auth-shell";
import { SelectionCard } from "../components/auth/selection-card";
import { Button } from "../components/ui/button";
import { ApiError } from "../api/client";

export function RoleSelectionPage() {
  const navigate = useNavigate();
  const { user, setRole } = useAuth();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(user?.role ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedRole(user?.role ?? null);
  }, [user?.role]);

  const handleContinue = async () => {
    if (!selectedRole) return;

    setIsSaving(true);
    setFormError(null);

    try {
      await setRole(selectedRole);
      navigate("/purpose-selection");
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Unable to save your role. Please try again.";
      setFormError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Role calibration"
      title="Choose your primary operating role"
      description="Indravani can align the onboarding experience with your scientific, academic, or operational context."
      footer={
        <>
          Need a different account?{" "}
          <Link to="/login" className="text-cyan-400 transition-all duration-300 hover:text-cyan-300 hover:drop-shadow-[0_0_10px_rgba(34,211,238,0.65)]">
            Login
          </Link>{" "}
          or{" "}
          <Link to="/signup" className="text-cyan-400 transition-all duration-300 hover:text-cyan-300 hover:drop-shadow-[0_0_10px_rgba(34,211,238,0.65)]">
            Signup
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        {formError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <div className="flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
          <UserCheck className="h-4 w-4 text-cyan-400" />
          Select the role that best represents how you will use the platform.
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {roleOptions.map((role) => (
            <SelectionCard
              key={role.id}
              title={role.title}
              description={role.description}
              icon={role.icon}
              selected={selectedRole === role.id}
              onClick={() => setSelectedRole(role.id)}
            />
          ))}
        </div>

        <Button
          type="button"
          onClick={handleContinue}
          disabled={!selectedRole || isSaving}
          className="h-10 w-full shadow-lg shadow-cyan-500/10 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-cyan-500/25"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Continue to Purpose
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </AuthShell>
  );
}
