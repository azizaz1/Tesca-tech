# Tesca Tech

[Open the live app](https://tesca-tech.vercel.app)

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
3. Run migrations `002` through `016` in numeric order. `008_ticket_chat_messages.sql` enables private, realtime incident conversations, `009_ticket_chat_read_status.sql` stores per-user read cursors for unread counts across sign-outs and devices, `010_ticket_resolution_time.sql` records each ticket's latest resolution time for analytics, `011_sample_assets.sql` adds sample equipment across departments, `012_employee_ticket_cancellation.sql` lets employees cancel their own open, unassigned incidents while preserving their history, `014_it_manager_role.sql` adds the IT manager role, `015_it_manager_ticket_policies.sql` grants that role access to incidents, and `016_admin_role_management.sql` adds guarded admin role management. Promote accounts only from a trusted SQL session, for example `update public.profiles set role = 'it_manager' where id = '<USER_UUID>';` or `update public.profiles set role = 'admin' where id = '<USER_UUID>';`.
4. Add the project URL and publishable key to `.env`, then start the app and create an account.
5. To grant technician access, find the user's ID in Supabase Auth and run the promotion query shown in `supabase/migrations/001_auth_profiles.sql`.

## Manager-assigned technician tasks

IT managers and admins can create operational tasks separately from incident tickets, assign them to a technician, add equipment or a work area, instructions, and a due date. Technicians see their assigned tasks, can mark work in progress or complete, and add a completion note. Assignments appear in the technician's in-app notification menu in real time and remain available across sign-ins.

To enable this feature on an existing database, run `supabase/migrations/019_technician_tasks.sql` in the Supabase SQL Editor after migration `018_ticket_sla_tracking.sql`. The migration creates the task and notification tables, role-based policies, and the realtime assignment notification trigger.

## Technician consumable inventory

Technicians, IT managers, and admins can maintain consumables, record arrivals and usage, review stock balances and history, and generate a print-ready stock report that can be saved as a PDF. Apply `supabase/migrations/025_technician_inventory.sql` after migration 024. The migration creates the inventory catalog and movement ledger, role-based access policies, and a stock-safe movement RPC.

## Resolution knowledge base

Technicians, IT managers, and admins can publish a reusable solution from a resolved incident. Solutions include a title, the reported problem, equipment, and the technician's resolution steps. The support team can search saved solutions by title, equipment, problem, or fix. Run `supabase/migrations/023_resolution_knowledge_base.sql` after migration 022 to enable the shared table and role-based access policies.

## Shared facility map

IT managers and admins can upload a facility floor plan from desktop or mobile, then drag the numbered equipment markers into position. The uploaded map and marker positions are shared with authenticated users across devices. Apply `supabase/migrations/020_shared_facility_map.sql` after migration 019 to create the private map storage bucket and shared map settings.

IT managers and admins can remove an unused asset from its selected item card on the map. Apply `supabase/migrations/024_manager_delete_assets.sql` to enable this; assets already referenced by incidents cannot be deleted.

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

## Technician email notifications

New incidents can be emailed to every Supabase Auth user whose profile role is `technician` or `admin`. The Edge Function reads recipients server-side and sends through a Google Apps Script relay authorized by the Gmail account owner. This avoids the verified-domain requirement of Resend's test sender.

To enable email notifications:

1. In Google Apps Script, create a project and paste `supabase/functions/ticket-email/GmailRelay.gs` into its editor.
2. In **Project Settings → Script Properties**, add `RELAY_SECRET` with a long random value.
3. Deploy the script as a **Web app**, executing as your Google account and allowing access to anyone. Complete Google's authorization prompt to grant Gmail sending permission. Copy the deployed `/exec` URL.
4. In Supabase **Edge Functions → Secrets**, set `GMAIL_RELAY_URL` to that `/exec` URL, `GMAIL_RELAY_SECRET` to the exact same value as the script's `RELAY_SECRET`, and `TICKET_EMAIL_WEBHOOK_SECRET` to another long random value. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the Supabase Edge Functions runtime.
5. Deploy with `supabase functions deploy ticket-email`.
6. In Supabase **Integrations → Database Webhooks**, create a webhook on `public.tickets` for **INSERT**, pointing to `https://YOUR_PROJECT_REF.supabase.co/functions/v1/ticket-email`. Add a custom `x-webhook-secret` header with the same value as `TICKET_EMAIL_WEBHOOK_SECRET`.
7. Create a test incident and confirm that the technician and admin accounts receive the email from the Google account that authorized the script.

The database webhook runs asynchronously, so a temporary email delivery failure will not prevent an employee from submitting an incident. Check the Edge Function logs for delivery errors. Keep relay URLs and secrets server-side; never put them in the client app or Git. Gmail sending is subject to Google's account limits and policies.

## Technician AI diagnostic assistant

Technicians can request AI-generated troubleshooting steps and possible causes from a ticket's equipment ID and issue description. The technician reviews suggestions and chooses whether to add them to the diagnostic notes. The function only permits `technician`, `it_manager`, and `admin` profiles. Ticket descriptions are sent to Groq when a technician requests suggestions; do not include passwords or other secrets in ticket descriptions.

To enable it on your Supabase project:

1. In Supabase **Edge Functions → Secrets**, add `GROQ_API_KEY` with your Groq API key. Optionally add `GROQ_MODEL` to choose another model available to your Groq account; the default is `openai/gpt-oss-20b`.
2. Deploy the function: `supabase functions deploy technician-ai-assist`.
3. Rebuild/redeploy the app. Until the function and secret are configured, the rest of the technician workflow continues to work and the AI panel reports that it is unavailable.

The Groq key stays in Supabase and is never included in the web or Android app.

## Available commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Build the web app into `dist/` |
| `npm run android:sync` | Build the web app and sync it to the Android project |
| `npm run android:open` | Open the Android project in Android Studio |
| `npm run android:build` | Sync and build the Android debug app |

## Current app behavior

Supabase stores authentication, profile roles, incidents, and ticket conversations. In-app notification history is stored in browser local storage.
