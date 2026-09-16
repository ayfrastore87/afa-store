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
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Browser key for the checkout location picker (Google Maps JavaScript API + Places API "New"). The key is read by `src/lib/google-maps-loader.ts`, is never logged, and never appears in markup. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client. |
| `DATABASE_URL`, `DIRECT_URL` | Prisma database connections (server-only). |
| `MIDTRANS_SERVER_KEY`, `MIDTRANS_MERCHANT_ID`, `MIDTRANS_IS_PRODUCTION`, `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` | Midtrans payments. |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Support / order follow-up contact. |

### Google Maps key requirements

The checkout location picker needs a **browser** key that is restricted:

- Application restriction: **Websites** — add the production domain and
  `http://localhost:3000/*` for local development.
- API restriction: **Maps JavaScript API** and **Places API (New)** only. The reverse
  geocoding done by the picker runs through the same Maps JavaScript API `Geocoder`.

Without the variable the picker degrades safely: the map shows "Peta belum dikonfigurasi"
and customers can still type the address manually and pick the kecamatan/kelurahan, so
checkout never breaks and no address is ever invented.
