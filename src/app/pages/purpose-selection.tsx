import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { AlertCircle, ArrowRight, Loader2, Target } from "lucide-react";
import { purposeOptions } from "../auth/onboarding-options";
import type { UserPurpose } from "../auth/auth-types";
import { useAuth } from "../auth/use-auth";
import { AuthShell } from "../components/auth/auth-shell";
import { SelectionCard } from "../components/auth/selection-card";
import { Button } from "../components/ui/button";
import { ApiError } from "../api/client";

export function PurposeSelectionPage() {
  const navigate = useNavigate();
  const { user, setPurposes } = useAuth();
  const [selectedPurposes, setSelectedPurposes] = useState<UserPurpose[]>(user?.purposes ?? []);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedPurposes(user?.purposes ?? []);
  }, [user?.purposes]);

  const togglePurpose = (purpose: UserPurpose) => {
    setSelectedPurposes((current) =>
      current.includes(purpose)
        ? current.filter((item) => item !== purpose)
        : [...current, purpose],
    );
  };

  const handleContinue = async () => {
    if (selectedPurposes.length === 0) return;

    setIsSaving(true);
    setFormError(null);

    try {
      await setPurposes(selectedPurposes);
      navigate("/");
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Unable to save your purposes. Please try again.";
      setFormError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Purpose profile"
      title="Select how Indravani should support your work"
      description="Choose one or more use cases so the access profile can be connected to backend preferences later."
      footer={
        <>
          Adjust your profile from{" "}
          <Link to="/role-selection" className="text-cyan-400 transition-all duration-300 hover:text-cyan-300 hover:drop-shadow-[0_0_10px_rgba(34,211,238,0.65)]">
            Role Selection
          </Link>{" "}
          or return to{" "}
          <Link to="/login" className="text-cyan-400 transition-all duration-300 hover:text-cyan-300 hover:drop-shadow-[0_0_10px_rgba(34,211,238,0.65)]">
            Login
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
          <Target className="h-4 w-4 text-cyan-400" />
          Multiple selections are supported for interdisciplinary climate work.
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {purposeOptions.map((purpose) => (
            <SelectionCard
              key={purpose.id}
              title={purpose.title}
              description={purpose.description}
              icon={purpose.icon}
              selected={selectedPurposes.includes(purpose.id)}
              onClick={() => togglePurpose(purpose.id)}
              multi
            />
          ))}
        </div>

        <Button
          type="button"
          onClick={handleContinue}
          disabled={selectedPurposes.length === 0 || isSaving}
          className="h-10 w-full shadow-lg shadow-cyan-500/10 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-cyan-500/25"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Enter Platform
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </AuthShell>
  );
}
