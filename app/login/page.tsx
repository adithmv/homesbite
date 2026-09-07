import { Login } from '@/components/auth';
export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role } = await searchParams;
  return <Login initialRole={role === 'restaurant' || role === 'rider' ? role : 'customer'} />;
}
