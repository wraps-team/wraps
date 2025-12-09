"use client";

import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";
import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type EditorErrorBoundaryProps = {
  children: ReactNode;
  onReset?: () => void;
};

type EditorErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
};

export class EditorErrorBoundary extends Component<
  EditorErrorBoundaryProps,
  EditorErrorBoundaryState
> {
  constructor(props: EditorErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(
    error: Error
  ): Partial<EditorErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("Template editor error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="font-semibold text-xl">Something went wrong</h2>
              <p className="max-w-md text-muted-foreground text-sm">
                The template editor encountered an error. You can try again or
                reset the editor to its initial state.
              </p>
            </div>
          </div>

          {this.state.error && (
            <div className="w-full max-w-lg rounded-md border border-destructive/20 bg-destructive/5 p-4">
              <p className="font-mono text-destructive text-xs">
                {this.state.error.message}
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <Button onClick={this.handleRetry} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
            <Button onClick={this.handleReset} variant="default">
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset Editor
            </Button>
          </div>

          <p className="text-muted-foreground text-xs">
            If this problem persists, try refreshing the page or contact
            support.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
