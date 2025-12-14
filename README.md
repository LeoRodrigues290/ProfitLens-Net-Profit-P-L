# CFO de Bolso - Pocket CFO for Shopify

Calculate your **real net profit** automatically by integrating sales, COGS, ad spend, and gateway fees.

## 🚀 Features

- **Automatic Profit Calculation**: Real-time profit/loss tracking
- **COGS Management**: Manual input or CSV import of product costs
- **Ad Platform Integration**: Facebook, Google, and TikTok Ads sync
- **Gateway Fee Calculation**: Stripe, PayPal, Shopify Payments support
- **Fixed Costs Tracking**: Monthly expenses included in calculations
- **Beautiful Dashboard**: Shopify Polaris-based UI

## 🛠 Tech Stack

- **Backend**: Firebase Cloud Functions (Node.js)
- **Database**: Firestore (NoSQL)
- **Frontend**: React + Shopify Polaris
- **Hosting**: Firebase Hosting
- **Auth**: Shopify OAuth

## 📦 Project Structure

```
├── functions/          # Firebase Cloud Functions (Backend)
│   └── src/
│       ├── shopify/    # Shopify OAuth & API
│       ├── ads/        # Ad platform integrations
│       ├── profit/     # Profit calculation engine
│       ├── cogs/       # COGS management
│       └── billing/    # Subscription handling
├── frontend/           # React App (Shopify Polaris)
│   └── src/
│       ├── components/ # UI Components
│       └── hooks/      # Custom React Hooks
├── firestore.rules     # Database security rules
└── firebase.json       # Firebase configuration
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Firebase CLI (`npm install -g firebase-tools`)
- Shopify Partner Account

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-repo/cfo-de-bolso.git
   cd cfo-de-bolso
   ```

2. **Install dependencies**
   ```bash
   # Backend
   cd functions && npm install
   
   # Frontend
   cd ../frontend && npm install
   ```

3. **Configure Firebase**
   ```bash
   firebase login
   firebase use --add
   ```

4. **Set environment variables**
   ```bash
   firebase functions:config:set \
     shopify.api_key="YOUR_API_KEY" \
     shopify.api_secret="YOUR_API_SECRET" \
     app.url="https://your-app.web.app"
   ```

5. **Run locally**
   ```bash
   firebase emulators:start
   ```

## 📊 Cost Estimation

| Stage              | Monthly Cost |
|--------------------|--------------|
| Up to 50 shops     | **$0**       |
| 100-500 shops      | ~$5-9        |
| 1000+ shops        | ~$30-45      |

## 📝 License

MIT