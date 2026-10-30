import { Heart } from "lucide-react";
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="px-4 py-6 lg:px-6">
        <div className="flex flex-col items-center justify-center space-y-2 text-center">
          <div className="flex items-center space-x-2 text-muted-foreground text-sm">
            <span>Made with</span>
            <Heart className="h-4 w-4 fill-destructive text-destructive" />
            <span>by</span>
            <Link
              className="font-medium text-foreground transition-colors hover:text-primary"
              href="https://wraps.dev"
              rel="noopener noreferrer"
              target="_blank"
            >
              Wraps Team
            </Link>
          </div>
          <p className="text-muted-foreground text-xs">
            Deploy production-ready email infrastructure to your AWS account in
            minutes. Zero stored credentials, beautiful DX, and transparent AWS
            pricing.
          </p>
        </div>
      </div>
    </footer>
  );
}
