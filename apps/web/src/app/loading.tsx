export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-primary border-b-2" />
        <p className="mt-2 text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
