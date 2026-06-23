import type { ModificationStatus } from "@/lib/types";

// Response status pill:
//  - pending modification request -> orange ("Modif. demandée")
//  - responded                    -> green  (shows the response label)
//  - otherwise                    -> grey   ("En attente")
export default function StatusPill({
  hasResponse,
  requestStatus,
  label,
}: {
  hasResponse: boolean;
  requestStatus: ModificationStatus | null;
  label: string;
}) {
  let cls = "bg-slate-100 text-slate-500";
  let text = label;

  if (requestStatus === "pending") {
    cls = "bg-amber-100 text-amber-800";
    text = "Modif. demandée";
  } else if (hasResponse) {
    cls = "bg-emerald-100 text-emerald-800";
  }

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {text}
    </span>
  );
}
