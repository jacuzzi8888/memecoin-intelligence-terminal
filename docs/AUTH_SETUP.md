# Personal Access Setup

This is a single-user personal app. GitHub OAuth and account sign-in are not required.

## Local Development

Development can run without a write key. If `API_WRITE_TOKEN` is present, the same protection used in production is enabled locally.

```env
NODE_ENV=development
PERSONAL_APP_MODE=true
NEXTAUTH_SECRET=<random-value-at-least-32-characters>
API_WRITE_TOKEN=<optional-local-write-key-at-least-32-characters>
```

## Production

Production personal mode requires a write key and fails to start without one.

```env
NODE_ENV=production
PERSONAL_APP_MODE=true
ENABLE_DEV_INGESTION=false
ENABLE_LIVE_TRADING=false
NEXTAUTH_SECRET=<unique-random-value-at-least-32-characters>
API_WRITE_TOKEN=<unique-random-value-at-least-32-characters>
```

Generate a key in PowerShell:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Set the same `API_WRITE_TOKEN` only on the API/indexer deployment environment. Do not add it to Vercel or any `NEXT_PUBLIC_*` variable.

Open the deployed app, go to **Settings -> Personal Write Access**, enter the key, and select **Unlock changes**. The browser stores it locally and adds it to protected requests. Select **Lock changes** to remove it.

Public market reads continue to work without the key. Mutations and sensitive configuration reads do not.
