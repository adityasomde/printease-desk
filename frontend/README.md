# PrintEase MVP

A multi-file React + Vite frontend MVP for a QR/code based printing platform.

## Features

- User login/register mock
- Print hub login/register mock
- Home page with direct upload
- Centre listing with pricing
- Centre code selection
- Upload document flow
- Secure payment demo screen
- Order tracking
- User dashboard
- Print hub dashboard
- Hub pricing and UPI setup

## Run locally

```bash
npm install
npm run dev
```

## Project structure

```text
src/
  components/     reusable UI components
  data/           demo data and status constants
  pages/          page-level components
  utils/          helper functions for price and order creation
  App.jsx         state coordination and page routing
  main.jsx        React entry point
```

## Important MVP note

This is frontend-only demo code. For production, connect it with:

- Render backend
- Supabase PostgreSQL
- Supabase Storage or Cloudinary
- Razorpay payment verification with backend webhooks
- OTP-based authentication
```
