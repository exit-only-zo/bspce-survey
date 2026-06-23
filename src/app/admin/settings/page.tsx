import { getSettings } from "@/lib/settings";
import { fmtDateFr } from "@/lib/format";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SettingsPage() {
  const settings = await getSettings();
  return (
    <div>
      <h1 className="text-lg font-semibold text-matera-ink">Paramètres</h1>
      <p className="mt-1 text-sm text-matera-muted">
        Les modifications de prix et de plafonds sont immédiatement répercutées
        sur le sondage et le tableau de bord des réponses (recalcul sans cache).
        Données à jour au : {fmtDateFr(settings.data_last_refreshed_at) ?? "—"}.
      </p>
      <SettingsForm settings={settings} />
    </div>
  );
}
