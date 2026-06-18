import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowRight, UserCheck } from "lucide-react";
import { roleOptions } from "../auth/onboarding-options";
import type { UserRole } from "../auth/auth-types";
import { useAuth } from "../auth/use-auth";
import { AuthShell } from "../components/auth/auth-shell";
import { SelectionCard } from "../components/auth/selection-card";
import { Button } from "../components/ui/button";

export function RoleSelectionPage() {
  const navigate = useNavigate();
  const { user, setRole } = useAuth();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(user?.role ?? null);

  useEffect(() => {
    setSelectedRole(user?.role ?? null);
  }, [user?.role]);

  const handleContinue = () => {
    if (!selectedRole) return;
    setRole(selectedRole);
    navigate("/purpose-selection");
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
          disabled={!selectedRole}
          className="h-10 w-full shadow-lg shadow-cyan-500/10 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-cyan-500/25"
        >
          Continue to Purpose
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </AuthShell>
  );
}
