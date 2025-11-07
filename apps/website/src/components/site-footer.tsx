import { Heart } from "lucide-react";
import { Link } from "react-router-dom";

export function SiteFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="px-4 py-6 lg:px-6">
        <div className="flex flex-col items-center justify-center space-y-2 text-center">
          <div className="flex items-center space-x-2 text-muted-foreground text-sm">
            <span>Made with</span>
            <Heart className="h-4 w-4 fill-red-500 text-red-500" />
            <span>by</span>
            <Link
              className="font-medium text-foreground transition-colors hover:text-primary"
              rel="noopener noreferrer"
              target="_blank"
              to="https://shadcnstore.com"
            >
              ShadcnStore Team
            </Link>
          </div>
          <p className="text-muted-foreground text-xs">
            Building beautiful, accessible blocks, templates and dashboards for
            modern web applications.
          </p>
        </div>
      </div>
    </footer>
  );
}
