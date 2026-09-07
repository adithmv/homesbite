import { RestaurantMenu } from '@/components/discovery';
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <RestaurantMenu slug={slug} />;
}
