import ImportClient from "./ImportClient";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <div>
      <h1 className="text-lg font-semibold text-matera-ink">Import des données</h1>
      <p className="mt-1 max-w-2xl text-sm text-matera-muted">
        Chargez le fichier <strong>BSPCE 2026</strong> (.xlsx) fourni par la
        finance. Le statut employé (actif / ex), les fondateurs et les figures de
        vesting sont lus directement depuis le fichier. Un rapport de pré-import
        est affiché avant toute écriture ; l&apos;import rafraîchit les lots de
        chaque détenteur (source de vérité) sans créer de doublons et sans
        réinitialiser les NDA déjà acceptés.
      </p>
      <ImportClient />
    </div>
  );
}
