import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ForgotPasswordForm2 } from "./components/forgot-password-form-2";

export default function ForgotPassword2Page() {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link className="flex items-center gap-2 font-medium" href="/">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Logo size={24} />
            </div>
            ShadcnStore
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md">
            <ForgotPasswordForm2 />
          </div>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block">
        <Image
          alt="Image"
          className="object-cover dark:brightness-[0.95] dark:invert"
          fill
          src="https://ui.shadcn.com/placeholder.svg"
        />
      </div>
    </div>
  );
}
