# Testing the Roster Manager

## 1. Run the app locally

```bash
cd roster-manager
npm install
npm run dev
```

Open http://localhost:3000 (or the port shown in the terminal).

---

## 2. Seed test data (roster ↔ messages)

Run `supabase/seed-test-data.sql` in your **Supabase SQL Editor** (Dashboard → SQL Editor → New query). This adds:

- **Ava** (A-Tier) with 3 messages
- **Cora** (C-Tier) with 2 messages + a scheduled draft

---

## 3. Verify contact–message connection

1. Go to **Roster**.
2. You should see Ava and Cora in their tiers (if not, add them manually or re-run the seed).
3. Click **Ava** → Conversation Simulator opens on the right.
4. Check **Message History** → should show her 3 messages (inbound/outbound).
5. Click **Cora** → should show her 2 messages.
6. Each prospect’s messages are tied to that contact via `prospect_id`.

---

## 4. Test version / staging

- **Local**: `npm run dev` (development)
- **Production build**: `npm run build` && `npm run start`
- **Vercel/Netlify**: Connect repo and deploy (uses same env vars)
- **iOS TestFlight**: Wrap with Expo/Capacitor, then use EAS Build + Submit

---

## 5. What you still need for full testing

| Item | Status |
|------|--------|
| Supabase tables | Run `home-data.sql` + `abc-migration.sql` |
| Test prospects + messages | Run `seed-test-data.sql` |
| Twilio/SMS integration | Not yet – "Text" opens native Messages app |
| App Store / TestFlight | Needs Expo or similar wrapper |
