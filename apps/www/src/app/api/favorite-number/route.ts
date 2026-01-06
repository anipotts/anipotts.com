import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

// Initialize Supabase Admin client to bypass RLS if needed, or just standard client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Ensure we have a client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { number } = body;

    // 1. Validate input
    if (typeof number !== "number" || isNaN(number)) {
      return NextResponse.json(
        { error: "Invalid number" },
        { status: 400 }
      );
    }
    
    const cleanNumber = Math.round(number);
    if (cleanNumber < -1000000000 || cleanNumber > 1000000000) {
       return NextResponse.json({ error: "Number out of bounds" }, { status: 400 });
    }

    // 2. Handle Client ID via Cookie
    const cookieStore = await cookies();
    const cookieName = "favorite-number-client-id";
    let clientId = cookieStore.get(cookieName)?.value;
    let isNewClient = false;

    if (!clientId) {
      clientId = crypto.randomUUID();
      isNewClient = true;
    }

    // 3. Insert into Supabase
    const userAgent = req.headers.get("user-agent") || null;

    // Insert
    const { error: insertError } = await supabase
      .from("favorite_numbers")
      .insert({
        number: cleanNumber,
        client_id: clientId,
        user_agent: userAgent,
      });

    if (insertError) {
      console.error("Supabase insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to save number" },
        { status: 500 }
      );
    }

    // 4. Fetch Stats
    // "top 5 numbers"
    const { data: topNumbers, error: statsError } = await supabase
       .from("favorite_number_stats")
       .select("*")
       .limit(5);

    if (statsError) {
       console.error("Supabase stats error:", statsError);
    }
    
    // "total answers"
    const { count: totalResponses, error: countError } = await supabase
      .from("favorite_numbers")
      .select("*", { count: "exact", head: true });

    // Construct response
    const responseData = {
      yourNumber: cleanNumber,
      totalResponses: totalResponses || 0,
      topNumbers: topNumbers || [],
    };

    const response = NextResponse.json(responseData);

    // Set cookie if new
    if (isNewClient && clientId) {
      response.cookies.set(cookieName, clientId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 60 * 60 * 24 * 365, // 1 year
        path: "/",
      });
    }

    return response;

  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
