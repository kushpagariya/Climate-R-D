import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { AlertCircle, Building2, Loader2, Mail, UserRound } from "lucide-react";
import { AuthShell } from "../components/auth/auth-shell";
import { PasswordInput } from "../components/auth/password-input";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useAuth } from "../auth/use-auth";

export function SignupPage() {
  const navigate = useNavigate();
  const { signup, isLoading, error, clearError } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    clearError();
    setFormError(null);
    setSuccess(false);

    if (!fullName.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
      setFormError("Full name, email, password, and confirmation are required.");
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setFormError("Enter a valid email address.");
      return;
    }

    if (password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    if (!acceptedTerms) {
      setFormError("Accept the terms and conditions to continue.");
      return;
    }

    try {
      await signup({ fullName, email, password, organization });
      setSuccess(true);
      window.setTimeout(() => navigate("/role-selection"), 650);
    } catch {
      // Error message is surfaced through auth context.
    }
  };

  return (
    <AuthShell
      eyebrow="Create access"
      title="Create your account for Indravani"
      description="Create an account for climate learning, institutional research, or professional weather analysis."
      footer={
        <>
          Already have access?{" "}
          <Link to="/login" className="text-cyan-400 transition-all duration-300 hover:text-cyan-300 hover:drop-shadow-[0_0_10px_rgba(34,211,238,0.65)]">
            Sign in
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        {(formError || error) && (
          <div className="flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{formError || error}</span>
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-green-400/30 bg-green-400/10 px-3 py-2 text-sm text-green-200">
            Account created. Preparing role selection.
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="full-name" className="text-xs uppercase tracking-widest text-muted-foreground">
            Full Name
          </Label>
          <div className="relative">
            <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="full-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Enter your full name"
              className="pl-10 transition-all duration-300 hover:border-cyan-500/40 hover:shadow-[0_0_18px_rgba(6,182,212,0.12)] focus-visible:shadow-[0_0_22px_rgba(6,182,212,0.18)]"
              autoComplete="name"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="signup-email" className="text-xs uppercase tracking-widest text-muted-foreground">
            Email
          </Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="signup-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="user@example.com"
              className="pl-10 transition-all duration-300 hover:border-cyan-500/40 hover:shadow-[0_0_18px_rgba(6,182,212,0.12)] focus-visible:shadow-[0_0_22px_rgba(6,182,212,0.18)]"
              autoComplete="email"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="organization" className="text-xs uppercase tracking-widest text-muted-foreground">
            Organization / Institution
          </Label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="organization"
              value={organization}
              onChange={(event) => setOrganization(event.target.value)}
              placeholder="Your Organization"
              className="pl-10 transition-all duration-300 hover:border-cyan-500/40 hover:shadow-[0_0_18px_rgba(6,182,212,0.12)] focus-visible:shadow-[0_0_22px_rgba(6,182,212,0.18)]"
              autoComplete="organization"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="signup-password" className="text-xs uppercase tracking-widest text-muted-foreground">
              Password
            </Label>
            <PasswordInput
              id="signup-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password" className="text-xs uppercase tracking-widest text-muted-foreground">
              Confirm Password
            </Label>
            <PasswordInput
              id="confirm-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repeat password"
              autoComplete="new-password"
            />
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-2 text-sm leading-5 text-muted-foreground">
          <Checkbox
            className="mt-0.5"
            checked={acceptedTerms}
            onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
          />
          I agree to the terms and conditions for using this atmospheric intelligence platform.
        </label>

        <Button type="submit" className="h-10 w-full shadow-lg shadow-cyan-500/10 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-cyan-500/25" disabled={isLoading || success}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Create Account
        </Button>
      </form>
    </AuthShell>
  );
}
