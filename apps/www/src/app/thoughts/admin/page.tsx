import { checkAuth } from "../actions";
import AdminCommandCenter from "./AdminCommandCenter";
import LoginForm from "./LoginForm";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

export default async function AdminPage() {
  if (!isSupabaseConfigured) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-4">
        <h1 className="text-2xl font-bold font-heading text-gray-100 mb-2">Admin Unavailable</h1>
        <p className="text-gray-400 max-w-md">
          The admin interface requires Supabase configuration. Please set <code className="bg-white/10 px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</code> and <code className="bg-white/10 px-1 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in your environment variables.
        </p>
      </div>
    );
  }

  const isAuthenticated = await checkAuth();

  if (!isAuthenticated) {
    return <LoginForm />;
  }

  return (
    <div className="pb-20">
      <AdminCommandCenter />
    </div>
  );
}
