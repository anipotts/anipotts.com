"use server";

import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const adminPassword = process.env.ADMIN_PASSWORD;

const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

export async function checkAuth() {
  const cookieStore = await cookies();
  return cookieStore.get("admin_session")?.value === "true";
}

export async function login(password: string) {
  if (!adminPassword) {
    return { success: false, error: "Admin password not configured on server" };
  }
  if (password === adminPassword) {
    const cookieStore = await cookies();
    cookieStore.set("admin_session", "true", { httpOnly: true, secure: true, sameSite: "strict" });
    return { success: true };
  }
  return { success: false, error: "Invalid password" };
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete("admin_session");
}

export async function getAdminThoughts() {
  if (!supabase) return [];
  
  const isAuth = await checkAuth();
  if (!isAuth) return [];

  const { data, error } = await supabase
    .from("thoughts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching admin thoughts:", error);
    return [];
  }
  return data;
}

export async function upsertThought(thought: any) {
  if (!supabase) throw new Error("Supabase not configured");
  
  const isAuth = await checkAuth();
  if (!isAuth) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("thoughts")
    .upsert(thought)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteThought(id: string) {
  if (!supabase) throw new Error("Supabase not configured");

  const isAuth = await checkAuth();
  if (!isAuth) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("thoughts")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function incrementThoughtViews(slug: string) {
  if (!supabase) return;
  
  // Try RPC first (atomic increment)
  const { error } = await supabase.rpc('increment_thought_views', { thought_slug: slug });
  
  if (error) {
    // Fallback: Read-Modify-Write (not atomic, but works without custom SQL functions)
    // Note: This requires the 'views' column to exist.
    const { data: thought } = await supabase
      .from('thoughts')
      .select('views')
      .eq('slug', slug)
      .single();
      
    if (thought) {
      await supabase
        .from('thoughts')
        .update({ views: (thought.views || 0) + 1 })
        .eq('slug', slug);
    }
  }
}

export async function getAdminStats() {
  if (!supabase) return null;
  
  const isAuth = await checkAuth();
  if (!isAuth) return null;

  const { data: thoughts, error } = await supabase
    .from("thoughts")
    .select("id, title, slug, views, published, created_at")
    .order("views", { ascending: false });

  if (error) {
    console.error("Error fetching stats:", error);
    return null;
  }

  const totalViews = thoughts.reduce((acc, t) => acc + (t.views || 0), 0);
  const totalThoughts = thoughts.length;
  const publishedCount = thoughts.filter(t => t.published).length;
  const draftCount = totalThoughts - publishedCount;
  const topThoughts = thoughts.slice(0, 5);

  return {
    totalViews,
    totalThoughts,
    publishedCount,
    draftCount,
    topThoughts
  };
}
