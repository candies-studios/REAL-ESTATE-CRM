import { PlannedModule } from '@/components/dashboard/planned-module';

export const metadata = { title: "Properties" };

export default function Page() {
  return (
    <PlannedModule
      title={"Properties"}
      phase={4}
      summary={"Your inventory, from draft to sold."}
      features={["Add and edit listings with photos, RERA details and amenities", "Publish only verified listings; flag stale ones for re-verification", "Buyer-to-property matching with explained scores"]}
    />
  );
}
