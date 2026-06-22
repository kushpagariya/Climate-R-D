import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "../ui/input";

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type">;

export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={`pr-10 transition-all duration-300 hover:border-cyan-500/40 hover:shadow-[0_0_18px_rgba(6,182,212,0.12)] focus-visible:shadow-[0_0_22px_rgba(6,182,212,0.18)] ${props.className ?? ""}`}
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        className="absolute bottom-0 right-1.5 top-0 my-auto flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-all duration-300 hover:bg-cyan-500/10 hover:text-cyan-300 hover:shadow-[0_0_14px_rgba(6,182,212,0.16)]"
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}
