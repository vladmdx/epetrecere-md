import { OrganizationDashboard } from "@/components/vendor/organization-dashboard";

export const dynamic = "force-dynamic";

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  return <OrganizationDashboard organizationId={Number(organizationId)} />;
}
