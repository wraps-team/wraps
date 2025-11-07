import { Logo } from "@/components/logo";
import { LoginForm2 } from "./components/login-form-2";

export default function LoginPage() {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <a className="flex items-center gap-2 font-medium" href="/">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Logo size={24} />
            </div>
            ShadcnStore
          </a>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md">
            <LoginForm2 />
          </div>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block">
        <img
          alt="Image"
          className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.95] dark:invert"
          src="https://ui.shadcn.com/placeholder.svg"
        />
      </div>
    </div>
  );
}
