import { Component, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

type State = { hasError: boolean; error?: Error };

/**
 * Top-level boundary that catches render errors anywhere in the route tree
 * and shows a friendly recovery card instead of a white screen.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("ErrorBoundary caught:", error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-hero p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-4" />
          <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground mt-2">
            An unexpected error broke this page. Reload to try again.
          </p>
          <Button variant="hero" className="mt-6 w-full" onClick={this.reset}>
            Reload page
          </Button>
        </Card>
      </div>
    );
  }
}
