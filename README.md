This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Environment variables

Local values live in `.env.local` (ignored by git). Production values are set in the
Vercel project settings. Never commit a real key — `.env*` is git-ignored, so this file
is the only place where the required variable names are documented.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | **Required for checkout location picker**. Browser key for Google Maps JavaScript API + Places API "New" + Geocoding API. The key is read by `src/lib/google-maps-loader.ts`, is never logged, and never appears in markup. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client. |
| `DATABASE_URL`, `DIRECT_URL` | Prisma database connections (server-only). |
| `MIDTRANS_SERVER_KEY`, `MIDTRANS_MERCHANT_ID`, `MIDTRANS_IS_PRODUCTION`, `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` | Midtrans payments. |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Support / order follow-up contact. |

### 🗺️ Google Maps API Setup (Quick Start)

**The location map WILL NOT work without this key configured!**

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project or select existing one
3. Enable these APIs:
   - **Maps JavaScript API**
   - **Places API**
   - **Geocoding API**
4. Create credentials → **API key**
5. Restrict the API key:
   - **Application restriction**: Add your domains (e.g., `https://yourstore.vercel.app`) and `http://localhost:3000/*` for local dev
   - **API restriction**: Select only Maps JavaScript API, Places API, and Geocoding API
6. Copy the API key and add it to your `.env` or `.env.local`:

```bash
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSyD...your-actual-api-key-here
```

7. Restart your development server if it's running

**Without the key**, the picker shows "Peta belum dikonfigurasi. Hubungi admin AFA STORE." but customers can still manually type their address.
