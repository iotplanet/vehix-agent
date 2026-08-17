/** Consistent inline error / notice banner. */
export default function AlertBanner({
  children,
  tone = "danger",
}: {
  children: React.ReactNode;
  tone?: "danger" | "warning" | "info";
}) {
  const cls =
    tone === "warning"
      ? "bg-warning/10 border-warning/30 text-warning"
      : tone === "info"
        ? "bg-primary/10 border-primary/30 text-primary"
        : "bg-danger/10 border-danger/30 text-danger";

  return (
    <div className={`p-3 rounded-lg border text-sm ${cls}`}>
      {children}
    </div>
  );
}
