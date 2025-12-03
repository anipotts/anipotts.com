# Ani Potts 

## Quick Start

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Run development server:**
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000) to view it.

## Environment Variables

Create a `.env.local` file in the root directory with the following keys:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
ADMIN_PASSWORD=your_secure_password
```

Optional but recommended for admin actions if RLS is strict:
```bash
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Project Structure

-   `src/app`: App Router pages and layouts.
    -   `page.tsx`: Home page.
    -   `work/`: Work portfolio.
    -   `thoughts/`: Blog/Notes system.
    -   `connect/`: Contact page.
-   `src/components`: Reusable UI components (Navbar, Footer, SignalsBar, etc.).
-   `src/data`: Static data (projects).
-   `src/lib`: Utilities (Supabase client).

## Thoughts System (Supabase)

The "Thoughts" section is powered by a Supabase `thoughts` table.

**Schema:**
-   `id` (uuid, primary key)
-   `slug` (text, unique)
-   `title` (text)
-   `summary` (text)
-   `content` (text)
-   `tags` (text[] or text)
-   `created_at` (timestamptz)
-   `updated_at` (timestamptz)
-   `published` (boolean)

**Admin Interface:**
Visit `/thoughts/admin` to manage thoughts. You will be prompted for the `ADMIN_PASSWORD`.
This interface allows you to Create, Read, Update, and Delete thoughts.
