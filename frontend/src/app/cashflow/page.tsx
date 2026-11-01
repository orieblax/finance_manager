'use client';

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Plus,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  Repeat,
  X,
  CreditCard,
  Building,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import {
  db,
  AccountRecord,
  ReceivableRecord,
  RecurringExpenseRecord,
  MonthlyExtraRecord,
} from '@/lib/db/dexie';
import { formatCurrency } from '@/lib/i18n';

export default function CashflowPage() {
  const { t, currentMonth, setCurrentMonth, refreshTrigger, triggerRefresh, showMessage } = useApp();

  const [activeTab, setActiveTab] = useState<'receivables' | 'expenses' | 'extras'>('receivables');
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [receivables, setReceivables] = useState<ReceivableRecord[]>([]);
  const [expenses, setExpenses] = useState<RecurringExpenseRecord[]>([]);
  const [extras, setExtras] = useState<MonthlyExtraRecord[]>([]);

  // Collect Modal
  const [collectingRec, setCollectingRec] = useState<ReceivableRecord | null>(null);
  const [collectWalletId, setCollectWalletId] = useState('');

  // Pay Modal
  const [payingExp, setPayingExp] = useState<RecurringExpenseRecord | null>(null);
  const [payWalletId, setPayWalletId] = useState('');

  // New Item Modals
  const [isAddRecOpen, setIsAddRecOpen] = useState(false);
  const [isAddExpOpen, setIsAddExpOpen] = useState(false);
  const [isAddExtraOpen, setIsAddExtraOpen] = useState(false);

  // Forms
  const [recTenant, setRecTenant] = useState('');
  const [recAmount, setRecAmount] = useState('');
  const [recDeductions, setRecDeductions] = useState('');
  const [recDueDay, setRecDueDay] = useState('1');

  const [expName, setExpName] = useState('');
  const [expCategory, setExpCategory] = useState('Servicios');
  const [expBudgeted, setExpBudgeted] = useState('');
  const [expDueDay, setExpDueDay] = useState('15');

  const [extraName, setExtraName] = useState('');
  const [extraType, setExtraType] = useState<'income' | 'expense'>('income');
  const [extraAmount, setExtraAmount] = useState('');
  const [extraMultiplier, setExtraMultiplier] = useState('1.0');

  useEffect(() => {
    async function loadData() {
      const [accs, recs, exps, exts] = await Promise.all([
        db.accounts.where('type').equals('wallet').toArray(),
        db.receivables.where('monthKey').equals(currentMonth).toArray(),
        db.recurringExpenses.where('monthKey').equals(currentMonth).toArray(),
        db.monthlyExtras.where('monthKey').equals(currentMonth).toArray(),
      ]);

      setAccounts(accs);
      setReceivables(recs.sort((a, b) => a.dueDay - b.dueDay));
      setExpenses(exps.sort((a, b) => a.dueDay - b.dueDay));
      setExtras(exts);

      if (accs.length > 0) {
        setCollectWalletId(accs[0].id);
        setPayWalletId(accs[0].id);
      }
    }
    loadData();
  }, [currentMonth, refreshTrigger]);

  // Action: 1-Tap Collect Receivable
  const handleConfirmCollect = async () => {
    if (!collectingRec || !collectWalletId) return;

    const acc = await db.accounts.get(collectWalletId);
    if (!acc) return;

    const nowIso = new Date().toISOString();
    const collectedAmount = collectingRec.netAmount;

    await db.transaction('rw', [db.accounts, db.receivables, db.transactions], async () => {
      // 1. Update wallet balance
      await db.accounts.update(collectWalletId, {
        balance: acc.balance + collectedAmount,
        updatedAt: nowIso,
      });

      // 2. Mark receivable collected
      await db.receivables.update(collectingRec.id, {
        isCollected: true,
        collectedIntoAccountId: collectWalletId,
        collectedAt: nowIso,
        updatedAt: nowIso,
      });

      // 3. Add transaction ledger
      await db.transactions.add({
        id: `tx_col_${Date.now()}`,
        accountId: collectWalletId,
        type: 'income',
        amount: collectedAmount,
        category: 'Cobro Arriendo',
        description: `Cobro recibido: ${collectingRec.tenantName}`,
        date: nowIso.slice(0, 10),
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    });

    setCollectingRec(null);
    triggerRefresh();
    showMessage(t.common.success, 'success');
  };

  // Action: 1-Tap Pay Recurring Bill
  const handleConfirmPay = async () => {
    if (!payingExp || !payWalletId) return;

    const acc = await db.accounts.get(payWalletId);
    if (!acc) return;

    const nowIso = new Date().toISOString();
    const amountToPay = payingExp.remainingAmount > 0 ? payingExp.remainingAmount : payingExp.budgetedAmount;

    await db.transaction('rw', [db.accounts, db.recurringExpenses, db.transactions], async () => {
      // 1. Deduct from wallet balance
      await db.accounts.update(payWalletId, {
        balance: acc.balance - amountToPay,
        updatedAt: nowIso,
      });

      // 2. Mark expense as paid
      await db.recurringExpenses.update(payingExp.id, {
        isPaid: true,
        remainingAmount: 0,
        updatedAt: nowIso,
      });

      // 3. Add transaction ledger
      await db.transactions.add({
        id: `tx_pay_${Date.now()}`,
        accountId: payWalletId,
        type: 'expense',
        amount: amountToPay,
        category: payingExp.category,
        description: `Pago de factura: ${payingExp.name}`,
        date: nowIso.slice(0, 10),
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    });

    setPayingExp(null);
    triggerRefresh();
    showMessage(t.common.success, 'success');
  };

  // Month Rollover ("Iniciar Nuevo Mes")
  const handleRolloverMonth = async () => {
    const parts = currentMonth.split('-');
    let year = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10) + 1;
    if (month > 12) {
      year += 1;
      month = 1;
    }
    const nextMonth = `${year}-${String(month).padStart(2, '0')}`;

    if (!confirm(`¿Deseas iniciar el mes ${nextMonth} clonando tus cobros y egresos recurrentes?`)) {
      return;
    }

    const nowIso = new Date().toISOString();

    // Clone receivables
    const nextRecs = receivables.map((r) => ({
      ...r,
      id: `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      monthKey: nextMonth,
      isCollected: false,
      collectedIntoAccountId: undefined,
      collectedAt: undefined,
      updatedAt: nowIso,
    }));

    // Clone expenses reset to budgeted amount
    const nextExps = expenses.map((e) => ({
      ...e,
      id: `exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      monthKey: nextMonth,
      remainingAmount: e.budgetedAmount,
      isPaid: false,
      updatedAt: nowIso,
    }));

    await db.transaction('rw', [db.receivables, db.recurringExpenses], async () => {
      if (nextRecs.length > 0) await db.receivables.bulkAdd(nextRecs);
      if (nextExps.length > 0) await db.recurringExpenses.bulkAdd(nextExps);
    });

    setCurrentMonth(nextMonth);
    showMessage(`Mes ${nextMonth} iniciado con éxito`, 'success');
  };

  // Add new receivable
  const handleAddRec = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(recAmount) || 0;
    const ded = parseFloat(recDeductions) || 0;
    const net = amt - ded;

    await db.receivables.add({
      id: `rec_${Date.now()}`,
      monthKey: currentMonth,
      tenantName: recTenant,
      amount: amt,
      deductions: ded,
      netAmount: net,
      dueDay: parseInt(recDueDay, 10) || 1,
      isCollected: false,
      updatedAt: new Date().toISOString(),
    });

    setRecTenant('');
    setRecAmount('');
    setRecDeductions('');
    setIsAddRecOpen(false);
    triggerRefresh();
    showMessage(t.common.success, 'success');
  };

  // Add new expense
  const handleAddExp = async (e: React.FormEvent) => {
    e.preventDefault();
    const budgeted = parseFloat(expBudgeted) || 0;

    await db.recurringExpenses.add({
      id: `exp_${Date.now()}`,
      monthKey: currentMonth,
      name: expName,
      category: expCategory,
      budgetedAmount: budgeted,
      remainingAmount: budgeted,
      dueDay: parseInt(expDueDay, 10) || 15,
      frequency: 'monthly',
      isPaid: false,
      updatedAt: new Date().toISOString(),
    });

    setExpName('');
    setExpBudgeted('');
    setIsAddExpOpen(false);
    triggerRefresh();
    showMessage(t.common.success, 'success');
  };

  // Add new extra
  const handleAddExtra = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = parseFloat(extraAmount) || 0;
    const mult = parseFloat(extraMultiplier) || 1.0;
    const net = raw * mult;

    await db.monthlyExtras.add({
      id: `ext_${Date.now()}`,
      monthKey: currentMonth,
      type: extraType,
      name: extraName,
      rawAmount: raw,
      netMultiplier: mult,
      netAmount: net,
      isSettled: false,
      updatedAt: new Date().toISOString(),
    });

    setExtraName('');
    setExtraAmount('');
    setIsAddExtraOpen(false);
    triggerRefresh();
    showMessage(t.common.success, 'success');
  };

  const totalReceivablesNet = receivables.reduce((sum, r) => sum + r.netAmount, 0);
  const totalReceivablesPending = receivables.filter((r) => !r.isCollected).reduce((sum, r) => sum + r.netAmount, 0);

  const totalExpensesBudgeted = expenses.reduce((sum, e) => sum + e.budgetedAmount, 0);
  const totalExpensesPending = expenses.filter((e) => !e.isPaid).reduce((sum, e) => sum + e.remainingAmount, 0);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">{t.cashflow.title}</h1>
          <p className="text-sm text-gray-400">Control detallado de cobros, facturas pendientes y extras mensuales</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Month Input Selector */}
          <input
            type="month"
            value={currentMonth}
            onChange={(e) => setCurrentMonth(e.target.value)}
            className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs font-semibold text-gray-200 focus:outline-none focus:border-indigo-500"
          />

          <button
            onClick={handleRolloverMonth}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-md transition-colors"
          >
            <Repeat className="w-3.5 h-3.5" />
            <span>{t.cashflow.newMonthRollover}</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800 space-x-2">
        <button
          onClick={() => setActiveTab('receivables')}
          className={`pb-3 px-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'receivables'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>{t.cashflow.receivablesTab}</span>
          <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full">
            {formatCurrency(totalReceivablesPending)}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('expenses')}
          className={`pb-3 px-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'expenses'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <TrendingDown className="w-4 h-4" />
          <span>{t.cashflow.expensesTab}</span>
          <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full">
            {formatCurrency(totalExpensesPending)}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('extras')}
          className={`pb-3 px-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'extras'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>{t.cashflow.extrasTab}</span>
        </button>
      </div>

      {/* TAB 1: Cobros Pendientes (Receivables) */}
      {activeTab === 'receivables' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-400">
              Total proyectado: <strong className="text-gray-200">{formatCurrency(totalReceivablesNet)}</strong> • Por cobrar: <strong className="text-emerald-400">{formatCurrency(totalReceivablesPending)}</strong>
            </p>
            <button
              onClick={() => setIsAddRecOpen(true)}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Nuevo Cobro
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {receivables.map((rec) => (
              <div
                key={rec.id}
                className={`bg-gray-900 border rounded-2xl p-5 shadow-sm transition-all flex flex-col justify-between ${
                  rec.isCollected ? 'border-gray-800/60 opacity-65' : 'border-gray-800 hover:border-gray-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-100 text-base">{rec.tenantName}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-800 text-gray-300 border border-gray-700">
                      Día {rec.dueDay}
                    </span>
                  </div>

                  <div className="text-2xl font-black text-emerald-400 mt-2 font-mono">
                    {formatCurrency(rec.netAmount)}
                  </div>

                  {rec.deductions > 0 && (
                    <p className="text-xs text-rose-400 mt-1">
                      Monto base: {formatCurrency(rec.amount)} (Deducciones: -{formatCurrency(rec.deductions)})
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-gray-800 flex items-center justify-between">
                  {rec.isCollected ? (
                    <span className="text-xs text-emerald-400 flex items-center gap-1 font-semibold">
                      <CheckCircle2 className="w-4 h-4" /> {t.cashflow.collected}
                    </span>
                  ) : (
                    <button
                      onClick={() => setCollectingRec(rec)}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-xl text-xs font-semibold shadow-md transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      <span>{t.cashflow.collectAction}</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: Egresos Recurrentes (Recurring Expenses) */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-400">
              Presupuestado: <strong className="text-gray-200">{formatCurrency(totalExpensesBudgeted)}</strong> • Por pagar: <strong className="text-rose-400">{formatCurrency(totalExpensesPending)}</strong>
            </p>
            <button
              onClick={() => setIsAddExpOpen(true)}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Nuevo Egreso
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {expenses.map((exp) => (
              <div
                key={exp.id}
                className={`bg-gray-900 border rounded-2xl p-5 shadow-sm transition-all flex flex-col justify-between ${
                  exp.isPaid ? 'border-gray-800/60 opacity-65' : 'border-gray-800 hover:border-gray-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-100 text-base">{exp.name}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-800 text-gray-300 border border-gray-700">
                      Día {exp.dueDay}
                    </span>
                  </div>

                  <div className="text-2xl font-black text-rose-400 mt-2 font-mono">
                    {formatCurrency(exp.budgetedAmount)}
                  </div>

                  <div className="flex justify-between text-xs text-gray-400 mt-2">
                    <span>Categoría: <strong className="text-gray-300">{exp.category}</strong></span>
                    <span>Pendiente: <strong className="text-rose-300">{formatCurrency(exp.remainingAmount)}</strong></span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-800 flex items-center justify-between">
                  {exp.isPaid ? (
                    <span className="text-xs text-emerald-400 flex items-center gap-1 font-semibold">
                      <CheckCircle2 className="w-4 h-4" /> {t.cashflow.paid}
                    </span>
                  ) : (
                    <button
                      onClick={() => setPayingExp(exp)}
                      className="w-full bg-rose-600 hover:bg-rose-500 text-white py-2 rounded-xl text-xs font-semibold shadow-md transition-colors flex items-center justify-center gap-1.5"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>{t.cashflow.payAction}</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: Extras del Mes */}
      {activeTab === 'extras' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-400">Ingresos y egresos variables del mes (con factor neto)</p>
            <button
              onClick={() => setIsAddExtraOpen(true)}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar Extra
            </button>
          </div>

          <div className="divide-y divide-gray-800 bg-gray-900 border border-gray-800 rounded-2xl p-4">
            {extras.length === 0 ? (
              <p className="text-xs text-gray-500 py-6 text-center">No hay extras registrados para este mes.</p>
            ) : (
              extras.map((extra) => (
                <div key={extra.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-100">{extra.name}</p>
                    <span className={`text-[10px] font-bold uppercase ${extra.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {extra.type === 'income' ? 'Ingreso Extra' : 'Gasto Extra'}
                    </span>
                    {extra.netMultiplier < 1 && (
                      <span className="text-xs text-gray-500 ml-2">Factor: {extra.netMultiplier}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className={`font-mono font-bold text-sm ${extra.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {extra.type === 'income' ? '+' : '-'}{formatCurrency(extra.netAmount)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Modal: 1-Tap Collect */}
      {collectingRec && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Cobrar en Billetera</h3>
              <button onClick={() => setCollectingRec(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-300">
              Selecciona en qué billetera o cuenta ingresa el pago de <strong>{collectingRec.tenantName}</strong> por un valor de <strong className="text-emerald-400 font-mono">{formatCurrency(collectingRec.netAmount)}</strong>:
            </p>
            <div>
              <label className="text-xs font-semibold text-gray-300">Billetera de Destino</label>
              <select
                value={collectWalletId}
                onChange={(e) => setCollectWalletId(e.target.value)}
                className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({formatCurrency(a.balance)})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCollectingRec(null)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-xl text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmCollect}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl text-sm font-semibold shadow-lg"
              >
                Confirmar Cobro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: 1-Tap Pay */}
      {payingExp && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Pagar Factura</h3>
              <button onClick={() => setPayingExp(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-300">
              Selecciona de qué billetera se descontará el pago de <strong>{payingExp.name}</strong> por un valor de <strong className="text-rose-400 font-mono">{formatCurrency(payingExp.remainingAmount > 0 ? payingExp.remainingAmount : payingExp.budgetedAmount)}</strong>:
            </p>
            <div>
              <label className="text-xs font-semibold text-gray-300">Billetera de Origen</label>
              <select
                value={payWalletId}
                onChange={(e) => setPayWalletId(e.target.value)}
                className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({formatCurrency(a.balance)})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayingExp(null)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-xl text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmPay}
                className="flex-1 bg-rose-600 hover:bg-rose-500 text-white py-2.5 rounded-xl text-sm font-semibold shadow-lg"
              >
                Confirmar Pago
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: New Receivable */}
      {isAddRecOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">Nuevo Cobro / Arriendo</h3>
              <button onClick={() => setIsAddRecOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddRec} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-300">Inquilino / Concepto</label>
                <input
                  type="text"
                  placeholder="ej. Camila 20, Apto 01"
                  value={recTenant}
                  onChange={(e) => setRecTenant(e.target.value)}
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-gray-300">Monto Base (COP)</label>
                  <input
                    type="number"
                    placeholder="ej. 500000"
                    value={recAmount}
                    onChange={(e) => setRecAmount(e.target.value)}
                    className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-300">Deducciones (COP)</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={recDeductions}
                    onChange={(e) => setRecDeductions(e.target.value)}
                    className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-300">Día de Pago (1 a 31)</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={recDueDay}
                  onChange={(e) => setRecDueDay(e.target.value)}
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddRecOpen(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-xl text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-semibold shadow-lg"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Expense */}
      {isAddExpOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">Nuevo Egreso Recurrente</h3>
              <button onClick={() => setIsAddExpOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddExp} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-300">Nombre del Gasto</label>
                <input
                  type="text"
                  placeholder="ej. Movistar 1-26, Gas 15"
                  value={expName}
                  onChange={(e) => setExpName(e.target.value)}
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-300">Categoría</label>
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value)}
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Servicios">Servicios (Agua, Energía, Gas, Celular, Internet)</option>
                  <option value="Hogar">Hogar (Mercado, Aseo)</option>
                  <option value="Familia">Familia (Mamá, Papá)</option>
                  <option value="Obligaciones">Obligaciones (Planilla, Bancos)</option>
                  <option value="Transporte">Transporte (Moto, Gasolina)</option>
                  <option value="Otros">Otros</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-gray-300">Presupuesto Mensual</label>
                  <input
                    type="number"
                    placeholder="ej. 60000"
                    value={expBudgeted}
                    onChange={(e) => setExpBudgeted(e.target.value)}
                    className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-300">Día Límite (1 a 31)</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={expDueDay}
                    onChange={(e) => setExpDueDay(e.target.value)}
                    className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddExpOpen(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-xl text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-semibold shadow-lg"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Extra */}
      {isAddExtraOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">Nuevo Extra del Mes</h3>
              <button onClick={() => setIsAddExtraOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddExtra} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-300">Concepto</label>
                <input
                  type="text"
                  placeholder="ej. Freelance, Reparación medidor"
                  value={extraName}
                  onChange={(e) => setExtraName(e.target.value)}
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-300">Tipo de Movimiento</label>
                <select
                  value={extraType}
                  onChange={(e) => setExtraType(e.target.value as any)}
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="income">Ingreso Extra (+)</option>
                  <option value="expense">Gasto Extra (-)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-gray-300">Monto (COP)</label>
                  <input
                    type="number"
                    placeholder="ej. 1100000"
                    value={extraAmount}
                    onChange={(e) => setExtraAmount(e.target.value)}
                    className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-300">Multiplicador Neto (ej. 0.89)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={extraMultiplier}
                    onChange={(e) => setExtraMultiplier(e.target.value)}
                    className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddExtraOpen(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-xl text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-semibold shadow-lg"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
