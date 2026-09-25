# Setcar Tech

A French-language IT support portal for reporting and tracking equipment incidents. The app is built with React and Vite, uses Supabase Auth for sign-in, and includes a Capacitor Android project.

## Requirements

- Node.js and npm
- A Supabase project for authentication
- Android Studio and the Android SDK to build the Android app

## Run locally

1. Install dependencies:

   ```sh
   npm install
   ```

2. Create a `.env` file in the project root with your Supabase project URL and publishable key:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
   ```

   The `.env` file is ignored by Git. Do not put a Supabase service role key in client-side environment variables.

3. Start the development server:

   ```sh
   npm run dev
   ```

## Supabase setup

1. In the Supabase dashboard, open **SQL Editor** and run `supabase/schema.sql` to create the tables, row-level security policies, and sample assets.
2. Run `supabase/migrations/001_auth_profiles.sql` to create employee profiles automatically when users register.
3. Add the project URL and publishable key to `.env`, then start the app and create an account.
4. To grant technician access, find the user's ID in Supabase Auth and run the promotion query shown in `supabase/migrations/001_auth_profiles.sql`.

## Available commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Build the web app into `dist/` |
| `npm run android:sync` | Build the web app and sync it to the Android project |
| `npm run android:open` | Open the Android project in Android Studio |
| `npm run android:build` | Sync and build the Android debug app |

## Current app behavior

Supabase handles authentication and profile roles. The incident examples and newly reported tickets are currently stored in the browser's local storage, so ticket data is local to each browser and is not yet synchronized through the Supabase `tickets` table.
