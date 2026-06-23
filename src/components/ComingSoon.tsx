export default function ComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h1 className="text-lg font-semibold text-matera-ink">{title}</h1>
      <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="text-sm text-matera-muted">{description}</p>
        <p className="mt-2 text-xs text-matera-muted">
          Cette section sera disponible dans une prochaine itération.
        </p>
      </div>
    </div>
  );
}
