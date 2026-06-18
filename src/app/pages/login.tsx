import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { AlertCircle, Loader2, LockKeyhole, Mail } from "lucide-react";
import { AuthShell } from "../components/auth/auth-shell";
import { PasswordInput } from "../components/auth/password-input";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useAuth } from "../auth/use-auth";

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    clearError();
    setFormError(null);

    if (!email.trim() || !password.trim()) {
      setFormError("Email and password are required.");
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setFormError("Enter a valid email address.");
      return;
    }

    const nextUser = await login({ email, password, rememberMe });

    if (!nextUser) return;

    navigate("/");
  };

  return (
    <AuthShell
      eyebrow="Secure login"
      title="Access your climate intelligence workspace"
      description="Sign in to continue your atmospheric analytics, radiosonde review, and live mission workflows."
      footer={
        <>
          New to Indravani?{" "}
          <Link to="/signup" className="text-cyan-400 transition-all duration-300 hover:text-cyan-300 hover:drop-shadow-[0_0_10px_rgba(34,211,238,0.65)]">
            Create an account
          </Link>
        </>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        {(formError || error) && (
          <div className="flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{formError || error}</span>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email" className="text-xs uppercase tracking-widest text-muted-foreground">
            Email
          </Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="researcher@institution.edu"
              className="pl-10 transition-all duration-300 hover:border-cyan-500/40 hover:shadow-[0_0_18px_rgba(6,182,212,0.12)] focus-visible:shadow-[0_0_22px_rgba(6,182,212,0.18)]"
              autoComplete="email"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-xs uppercase tracking-widest text-muted-foreground">
            Password
          </Label>
          <div className="relative">
            <LockKeyhole className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <PasswordInput
              id="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
              className="pl-10"
              autoComplete="current-password"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={rememberMe}
              onCheckedChange={(checked) => setRememberMe(checked === true)}
            />
            Remember me
          </label>
          <button type="button" className="text-sm text-cyan-400 transition-all duration-300 hover:text-cyan-300 hover:drop-shadow-[0_0_10px_rgba(34,211,238,0.65)]">
            Forgot password?
          </button>
        </div>

        <Button type="submit" className="h-10 w-full shadow-lg shadow-cyan-500/10 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-cyan-500/25" disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Login
        </Button>
      </form>
    </AuthShell>
  );
}
