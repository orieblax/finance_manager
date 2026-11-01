-- ==============================================================================
-- Personal Finance Manager - Initial Schema Migration
-- Compatible with Supabase PostgreSQL & Row Level Security (RLS)
-- ==============================================================================

-- 1. Full State Snapshots (for offline-first device sync & atomic backups)
CREATE TABLE IF NOT EXISTS public.finance_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    month_key TEXT NOT NULL, -- e.g. '2026-10' or 'device_backup'
    payload JSONB NOT NULL,
    device_id TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_user_month UNIQUE (user_id, month_key)
);

-- 2. Accounts (Liquid Wallets & Long-term Capital/Patrimonio)
CREATE TABLE IF NOT EXISTS public.accounts (
    id TEXT PRIMARY KEY, -- Client-generated ID (ULID/UUID/Dexie id)
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('wallet', 'investment')),
    balance NUMERIC NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'COP',
    investment_meta JSONB, -- For annual yield % (Fiducia) or units & FX rate (Crypto)
    is_archived BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Transactions Ledger
CREATE TABLE IF NOT EXISTS public.transactions (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id TEXT REFERENCES public.accounts(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
    amount NUMERIC NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    to_account_id TEXT REFERENCES public.accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Recurring Incomes (Base templates)
CREATE TABLE IF NOT EXISTS public.recurring_incomes (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    day_of_month INT CHECK (day_of_month BETWEEN 1 AND 31),
    net_multiplier NUMERIC NOT NULL DEFAULT 1.0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. Monthly Receivables (e.g. Tenant Rents with deductions)
CREATE TABLE IF NOT EXISTS public.receivables (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    month_key TEXT NOT NULL, -- 'YYYY-MM'
    tenant_name TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    deductions NUMERIC NOT NULL DEFAULT 0,
    net_amount NUMERIC NOT NULL,
    due_day INT CHECK (due_day BETWEEN 1 AND 31),
    is_collected BOOLEAN NOT NULL DEFAULT false,
    collected_into_account_id TEXT REFERENCES public.accounts(id) ON DELETE SET NULL,
    collected_at TIMESTAMPTZ,
    notes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. Recurring Expenses (Budgeted vs. Remaining Unpaid)
CREATE TABLE IF NOT EXISTS public.recurring_expenses (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    month_key TEXT NOT NULL, -- 'YYYY-MM'
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    budgeted_amount NUMERIC NOT NULL,
    remaining_amount NUMERIC NOT NULL,
    due_day INT CHECK (due_day BETWEEN 1 AND 31),
    frequency TEXT NOT NULL DEFAULT 'monthly', -- 'daily', 'weekly', 'biweekly', 'monthly'
    is_paid BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. Monthly Extras (One-off variable items)
CREATE TABLE IF NOT EXISTS public.monthly_extras (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    month_key TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    name TEXT NOT NULL,
    raw_amount NUMERIC NOT NULL,
    net_multiplier NUMERIC NOT NULL DEFAULT 1.0,
    net_amount NUMERIC NOT NULL,
    is_settled BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. Goals (Metas)
CREATE TABLE IF NOT EXISTS public.goals (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    target_amount NUMERIC NOT NULL,
    current_amount NUMERIC NOT NULL DEFAULT 0,
    target_date DATE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.finance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_extras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies ensuring each user only accesses their own records
DO $$
BEGIN
    EXECUTE 'CREATE POLICY "Users can manage own snapshots" ON public.finance_snapshots FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can manage own accounts" ON public.accounts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can manage own transactions" ON public.transactions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can manage own recurring_incomes" ON public.recurring_incomes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can manage own receivables" ON public.receivables FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can manage own recurring_expenses" ON public.recurring_expenses FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can manage own monthly_extras" ON public.monthly_extras FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can manage own goals" ON public.goals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
