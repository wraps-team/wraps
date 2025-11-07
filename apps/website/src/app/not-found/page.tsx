import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="mb-4 font-bold text-9xl text-primary">404</h1>
        <h2 className="mb-4 font-semibold text-3xl">Page Not Found</h2>
        <p className="mb-8 text-lg text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Button asChild size="lg">
          <Link to="/">Go Home</Link>
        </Button>
      </div>
    </div>
  );
}
