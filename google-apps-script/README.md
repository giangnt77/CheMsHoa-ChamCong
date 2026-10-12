# Optional Google Sheets connector

This connector is kept separate from the application's default Supabase client. Nothing in the application uses it unless code explicitly imports `googleSheets` from `lib/google-sheets.js`; the existing `lib/supabase.js` remains the primary data store.

## Configure the connector

1. Create a Google Sheet and copy its spreadsheet ID.
2. Create an Apps Script project and copy `Code.gs` into it.
3. In Apps Script **Project Settings → Script Properties**, set `SPREADSHEET_ID` and a random `API_TOKEN` (at least 32 characters).
4. Run `setupSpreadsheet()` once and grant the requested Sheets permissions.
5. Deploy as a Web app, execute as the owner, allow access to Anyone, and copy the `/exec` URL.
6. Configure these server-only environment variables and restart Next.js:

   ```dotenv
   GOOGLE_SHEETS_API_ENABLED=false
   GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/DEPLOYMENT_ID/exec
   GOOGLE_APPS_SCRIPT_API_TOKEN=the_same_secret_as_the_script_property
   ```

The API route is disabled unless `GOOGLE_SHEETS_API_ENABLED=true`. Keep it disabled until application-level authorization is added before connecting it to user-facing screens: the script token protects the Apps Script deployment, but does not authenticate callers of the Next.js API route.

After changing `Code.gs`, save it and deploy a new version via **Deploy → Manage deployments**. Keep the deployment URL ending in `/exec`.

This connector does not mirror or migrate Supabase data automatically. Add explicit, reviewed dual-write or migration logic before using Google Sheets as a secondary store.
