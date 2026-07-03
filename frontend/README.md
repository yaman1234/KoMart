# KoMart Frontend

Modern React frontend for the KoMart retail management system — Korean and Asian snacks and food store.

## Tech Stack

- React 19 + TypeScript + Vite
- Material UI (MUI) with light/dark mode
- React Router v7
- TanStack Query (React Query)
- Zustand state management
- Recharts
- Axios
- React Hook Form + Zod

## Getting Started

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### Demo Login

- **Email:** `admin@komart.com`
- **Password:** `password`

## Environment

Copy `.env.example` to `.env` and adjust as needed:

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `/api/v1` | FastAPI backend base URL |
| `VITE_USE_MOCK` | `false` | Use mock API layer when `true` (offline dev only) |

Set `VITE_USE_MOCK=true` for UI-only development. For a real backend, use `VITE_USE_MOCK=false` and run FastAPI on port 8000. Vite proxies `/api` to `http://localhost:8000`.

## Project Structure

```
src/
├── assets/
├── components/
│   ├── common/       # StatCard, SearchBar, ConfirmDialog, etc.
│   ├── charts/       # ChartCard, chart wrappers
│   ├── dashboard/    # Dashboard-specific widgets
│   ├── forms/        # Form field components
│   ├── tables/       # DataTable
│   └── pos/          # POS components
├── pages/            # Route pages
├── layouts/          # MainLayout, AuthLayout, Sidebar, TopBar
├── routes/           # Router config and guards
├── hooks/            # Custom hooks + QueryClient
├── services/         # API client + mock layer
├── store/            # Zustand stores
├── types/            # TypeScript interfaces
├── utils/            # Helpers
├── constants/        # App constants
└── theme/            # MUI theme
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
