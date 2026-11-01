'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Wallet,
  TrendingUp,
  Calendar,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  ChevronRight,
  DollarSign,
  PieChart as PieChartIcon,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { db, AccountRecord, RecurringExpenseRecord, ReceivableRecord, MonthlyExtraRecord } from '@/lib/db/dexie';
import { calculateProjections, FinancialReport } from '@/lib/finance/projections';
import { formatCurrency } from '@/lib/i18n';
import { restoreFromCloud } from '@/lib/sync/cloudSync';

export default function DashboardPage() {
  const { t, currentMonth, refreshTrigger, user, authLoading } = useApp();
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [upcomingItems, setUpcomingItems] = useState<Array<{ name: string; amount: number; dueDay: number; type: 'bill' | 'income' }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!user) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      let [accs, exps, recs, exts] = await Promise.all([
        db.accounts.toArray(),
        db.recurringExpenses.where('monthKey').equals(currentMonth).toArray(),
        db.receivables.where('monthKey').equals(currentMonth).toArray(),
        db.monthlyExtras.where('monthKey').equals(currentMonth).toArray(),
      ]);

      // If local IndexedDB is empty on this device, automatically restore from Supabase
      if (accs.length === 0) {
        try {
          const res = await restoreFromCloud(currentMonth, user.id);
          if (res.success && res.found) {
            [accs, exps, recs, exts] = await Promise.all([
              db.accounts.toArray(),
              db.recurringExpenses.where('monthKey').equals(currentMonth).toArray(),
              db.receivables.where('monthKey').equals(currentMonth).toArray(),
              db.monthlyExtras.where('monthKey').equals(currentMonth).toArray(),
            ]);
          }
        } catch {
          // Ignore
        }
      }

      setAccounts(accs);

      const calculated = calculateProjections({
        accounts: accs,
        recurringExpenses: exps,
        receivables: recs,
        monthlyExtras: exts,
      });
      setReport(calculated);

      // Compute upcoming 7 days items
      const today = new Date().getDate();
      const in7Days = today + 7;
      const upcoming: Array<{ name: string; amount: number; dueDay: number; type: 'bill' | 'income' }> = [];

      exps.forEach((e) => {
        if (!e.isPaid && e.remainingAmount > 0 && e.dueDay >= today && e.dueDay <= in7Days) {
          upcoming.push({ name: e.name, amount: e.remainingAmount, dueDay: e.dueDay, type: 'bill' });
        }
      });
      recs.forEach((r) => {
        if (!r.isCollected && r.netAmount > 0 && r.dueDay >= today && r.dueDay <= in7Days) {
          upcoming.push({ name: r.tenantName, amount: r.netAmount, dueDay: r.dueDay, type: 'income' });
        }
      });

      upcoming.sort((a, b) => a.dueDay - b.dueDay);
      setUpcomingItems(upcoming);
      setIsLoading(false);
    }

    loadData();
  }, [currentMonth, refreshTrigger, user]);

  if (authLoading || isLoading || !report) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  // Check if DB is empty
  const isEmpty = accounts.length === 0;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            {t.appTitle}
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Offline-First
            </span>
          </h1>
          <p className="text-sm text-gray-400 mt-1">{t.tagline}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl px-3 py-1.5 text-xs font-medium text-gray-300">
            <Calendar className="w-4 h-4 text-indigo-400" />
            <span>{currentMonth}</span>
          </div>
          <Link
            href="/settings"
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-3 py-1.5 text-xs font-semibold shadow-md transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Importar Excel</span>
          </Link>
        </div>
      </div>

      {isEmpty && (
        <div className="bg-gradient-to-r from-indigo-950/60 to-purple-950/40 border border-indigo-500/30 rounded-2xl p-6 text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-indigo-400 mx-auto" />
          <h3 className="text-lg font-bold text-white">Comienza cargando tus finanzas</h3>
          <p className="text-sm text-gray-300 max-w-md mx-auto">
            Puedes importar tu hoja de cálculo <strong>Gastos Albeiro.xlsx</strong> con un solo clic. Los datos se guardarán exclusivamente en tu dispositivo.
          </p>
          <div className="pt-2">
            <Link
              href="/settings"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-5 py-2.5 rounded-xl shadow-lg transition-colors text-sm"
            >
              Ir a Ajustes y Cargar Excel
            </Link>
          </div>
        </div>
      )}

      {/* Main KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Liquid Cash */}
        <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-5 shadow-sm hover:border-gray-700 transition-all">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">{t.dashboard.liquidCash}</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-white">{formatCurrency(report.totalLiquidCash)}</div>
          <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
            <span className="text-emerald-400 font-medium">Billeteras activas</span> (Daviplata, Nequi, etc.)
          </p>
        </div>

        {/* Immediate Restante */}
        <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-5 shadow-sm hover:border-gray-700 transition-all">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">{t.dashboard.immediateRemaining}</span>
            <div className={`p-2 rounded-xl ${report.immediateRestante >= 0 ? 'bg-indigo-500/10 text-indigo-400' : 'bg-rose-500/10 text-rose-400'}`}>
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className={`text-2xl font-black ${report.immediateRestante >= 0 ? 'text-indigo-300' : 'text-rose-400'}`}>
            {formatCurrency(report.immediateRestante)}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Tras pagar <strong className="text-gray-300">{formatCurrency(report.totalPendingExpenses)}</strong> de facturas pendientes
          </p>
        </div>

        {/* Incl. Pendientes (Próximo Ciclo) */}
        <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-5 shadow-sm hover:border-gray-700 transition-all">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">{t.dashboard.nextCycleBuffer}</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-purple-300">{formatCurrency(report.nextCycleBuffer)}</div>
          <p className="text-xs text-gray-400 mt-2">
            Colchón tras cobrar arriendos y reservar ciclo sig.
          </p>
        </div>

        {/* Patrimonio Total */}
        <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-5 shadow-sm hover:border-gray-700 transition-all">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">{t.accounts.netWorth}</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-300">{formatCurrency(report.netWorth)}</div>
          <p className="text-xs text-gray-400 mt-2">
            Incluye Fiducia (<strong className="text-gray-300">{formatCurrency(report.totalInvestmentCapital)}</strong>) + Crypto
          </p>
        </div>
      </div>

      {/* Cash Availability Forecast Strip (Week, Month, Year) */}
      <div className="bg-gradient-to-b from-gray-900 to-gray-950 border border-gray-800 rounded-2xl p-6 shadow-md space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">{t.dashboard.forecastTitle}</h2>
              <p className="text-xs text-gray-400">¿Cuánto dinero tendré disponible al finalizar cada período?</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* End of Week */}
          <div className="bg-gray-800/50 border border-gray-700/60 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                {t.dashboard.endOfWeek}
              </span>
              <p className="text-xs text-gray-400 mt-1">Saldo estimado al domingo tras cobros y pagos inmediatos</p>
            </div>
            <div className="text-xl md:text-2xl font-extrabold text-white mt-4">
              {formatCurrency(report.endOfWeekAvailable)}
            </div>
          </div>

          {/* End of Month */}
          <div className="bg-gray-800/50 border border-gray-700/60 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                {t.dashboard.endOfMonth}
              </span>
              <p className="text-xs text-gray-400 mt-1">Cierre proyectado tras cobrar todos los arriendos y saldar gastos</p>
            </div>
            <div className="text-xl md:text-2xl font-extrabold text-white mt-4">
              {formatCurrency(report.endOfMonthAvailable)}
            </div>
          </div>

          {/* End of Year */}
          <div className="bg-gray-800/50 border border-gray-700/60 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                {t.dashboard.endOfYear}
              </span>
              <p className="text-xs text-gray-400 mt-1">Acumulado proyectado a fin de año manteniendo tu tasa de ahorro</p>
            </div>
            <div className="text-xl md:text-2xl font-extrabold text-white mt-4">
              {formatCurrency(report.endOfYearAvailable)}
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Where is my money going? & Upcoming Items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Where is my money going? */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base text-white flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-indigo-400" />
              {t.dashboard.whereMoneyGoes}
            </h3>
            <span className="text-xs text-gray-400">Total: {formatCurrency(report.totalBudgetedExpenses)}</span>
          </div>

          <div className="space-y-3 pt-2">
            {Object.entries(report.categoryExpenses).length === 0 ? (
              <p className="text-xs text-gray-500 py-4 text-center">No hay gastos presupuestados para este mes.</p>
            ) : (
              Object.entries(report.categoryExpenses)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, amount]) => {
                  const pct = report.totalBudgetedExpenses > 0 ? (amount / report.totalBudgetedExpenses) * 100 : 0;
                  return (
                    <div key={cat} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-gray-300">{cat}</span>
                        <span className="text-gray-400 font-mono">
                          {formatCurrency(amount)} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(3, pct))}%` }}
                        />
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>

        {/* Upcoming 7 days */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" />
              {t.dashboard.upcomingTitle}
            </h3>
            <Link href="/cashflow" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium">
              Ver todo <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-gray-800/80 pt-1">
            {upcomingItems.length === 0 ? (
              <p className="text-xs text-gray-500 py-6 text-center">{t.dashboard.noUpcoming}</p>
            ) : (
              upcomingItems.map((item, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-800 flex flex-col items-center justify-center font-mono text-[10px] text-gray-300 font-bold border border-gray-700">
                      <span>Día</span>
                      <span className="text-indigo-400">{item.dueDay}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-200">{item.name}</p>
                      <span className={`text-[10px] font-semibold uppercase ${item.type === 'bill' ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {item.type === 'bill' ? 'Factura por pagar' : 'Cobro por recibir'}
                      </span>
                    </div>
                  </div>
                  <div className={`font-mono text-sm font-bold ${item.type === 'bill' ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {item.type === 'bill' ? '-' : '+'}{formatCurrency(item.amount)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
