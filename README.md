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

## Incident sync and Android push notifications

The app stores incidents in Supabase and refreshes both employee and technician views in real time. Android push notifications are sent to all technicians when a new incident is submitted and to the reporting employee when its status changes (including **En cours** and **Résolu**).

To enable this on your Supabase and Firebase projects:

1. In the Supabase SQL Editor, run `supabase/migrations/002_shared_tickets_push_tokens.sql` after the schema and auth migration.
2. In Firebase Console, create a project, add an Android app with package ID `com.setcar.tech`, and download `google-services.json` into `android/app/`.
3. In Firebase **Project settings → Service accounts**, create a service account key for a service account with the **Firebase Cloud Messaging API Admin** role. Keep this JSON private; never put it in the app or commit it to Git.
4. Deploy `supabase/functions/ticket-push` to your linked Supabase project with `supabase functions deploy ticket-push`.
5. In Supabase **Edge Functions → Secrets**, set `FCM_SERVICE_ACCOUNT_JSON` to the full service account JSON and set `PUSH_WEBHOOK_SECRET` to a long random value.
6. In Supabase **Database → Webhooks**, create a webhook on `public.tickets` for **INSERT** and **UPDATE**, pointing to `https://YOUR_PROJECT_REF.supabase.co/functions/v1/ticket-push`. Add a custom `x-webhook-secret` header with the same value as `PUSH_WEBHOOK_SECRET`.
7. Build and install a fresh Android app with `npm run android:build`. Sign in as an employee and technician and allow notifications when Android asks.

The older sample tickets stored in browser local storage are not imported into Supabase. New incidents created after the migration will be shared and can trigger notifications. Push delivery requires Firebase and the Supabase webhook setup above; until then, incident sync works but push messages cannot be sent.

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
