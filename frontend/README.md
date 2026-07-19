# Udyam Sahayak Frontend

This is the frontend component of **Udyam Sahayak** (formerly Kisan Credit Copilot), an offline-first Progressive Web App (PWA) designed for field officers to assess rural SHGs/FPOs/micro-enterprises.

## Tech Stack
- **Framework:** React 19 + TypeScript + Vite
- **Offline Storage:** IndexedDB (`idb`) and Service Workers (`vite-plugin-pwa`)
- **Styling:** CSS Variables and modular architecture
- **Inference:** On-device risk forecasting via transpiled JavaScript models (`m2cgen`)

## Getting Started

### Prerequisites
- Node.js (v20+ recommended)
- npm or yarn

### Installation
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running Locally
To start the Vite development server:
```bash
npm run dev
```

### Building for Production
To build the application and type-check:
```bash
npm run build
```
This generates optimized static files in the `dist` directory, fully prepared for deployment as an offline-capable PWA.

## Features
- **Offline-First Capabilities:** Complete assessments without connectivity. Automatic sync logic caches drafts and resolves them idempotently once the network is restored.
- **On-Device Inference:** Deterministic, low-latency execution (< 50ms) using cluster-calibrated tree models transposed into pure JS.
- **Vernacular Design:** Built for vernacular audiences, including deterministic audio and explanation text rendering for specific local clusters.

## Linting
This project uses `oxlint` for high-performance linting:
```bash
npm run lint
```
