import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signin") {
        await signIn(email, password);
        toast.success("Innlogget");
        navigate("/", { replace: true });
      } else {
        await signUp(email, password);
        toast.success("Konto opprettet — sjekk e-posten din.");
        setMode("signin");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Noe gikk galt");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-3xl">Doffin Whisperer</CardTitle>
          <CardDescription>
            Triagér norske offentlige anbud i innboksen din.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-post</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Passord</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting
                ? "…"
                : mode === "signin"
                  ? "Logg inn"
                  : "Opprett konto"}
            </Button>
            <button
              type="button"
              onClick={() =>
                setMode((m) => (m === "signin" ? "signup" : "signin"))
              }
              className="w-full text-sm text-muted-foreground hover:text-foreground"
            >
              {mode === "signin"
                ? "Ny her? Opprett konto"
                : "Har du allerede konto? Logg inn"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
