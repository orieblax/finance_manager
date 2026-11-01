'use client';

import React, { useState, useEffect } from 'react';
import {
  Wallet,
  Plus,
  ArrowRightLeft,
  DollarSign,
  TrendingUp,
  Coins,
  Building,
  CheckCircle2,
  X,
  CreditCard,
  Edit2,
  Trash2,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { db, AccountRecord, TransactionRecord } from '@/lib/db/dexie';
import { formatCurrency } from '@/lib/i18n';

export default function AccountsPage() {
  const { t, refreshTrigger, triggerRefresh, showMessage, user, authLoading } = useApp();
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);

  // Modals state
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);

  // New account form
  const [newAccName, setNewAccName] = useState('');
  const [newAccType, setNewAccType] = useState<'wallet' | 'investment'>('wallet');
  const [newAccBalance, setNewAccBalance] = useState('');
  const [newAccAnnualRate, setNewAccAnnualRate] = useState('');

  // Transaction form (+ Ingreso / - Gasto)
  const [selectedAccId, setSelectedAccId] = useState('');
  const [txType, setTxType] = useState<'income' | 'expense'>('income');
  const [txAmount, setTxAmount] = useState('');
  const [txCategory, setTxCategory] = useState('General');
  const [txDesc, setTxDesc] = useState('');

  // Transfer form
  const [fromAccId, setFromAccId] = useState('');
  const [toAccId, setToAccId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');

  useEffect(() => {
    async function loadAccounts() {
      const accs = await db.accounts.toArray();
      const txs = await db.transactions.orderBy('createdAt').reverse().limit(20).toArray();
      setAccounts(accs);
      setTransactions(txs);
      if (accs.length > 0 && !selectedAccId) {
        setSelectedAccId(accs[0].id);
        setFromAccId(accs[0].id);
        if (accs.length > 1) setToAccId(accs[1].id);
      }
    }
    loadAccounts();
  }, [refreshTrigger]);

  const wallets = accounts.filter((a) => a.type === 'wallet');
  const investments = accounts.filter((a) => a.type === 'investment');

  const totalLiquid = wallets.reduce((sum, a) => sum + a.balance, 0);
  const totalInvestment = investments.reduce((sum, a) => {
    let bal = a.balance;
    if (a.investmentMeta?.units && a.investmentMeta?.fxRate) {
      bal = a.investmentMeta.units * a.investmentMeta.fxRate;
    }
    return sum + bal;
  }, 0);

  // Add Account
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName) return;

    const bal = parseFloat(newAccBalance) || 0;
    const rate = parseFloat(newAccAnnualRate) || 0;

    const newAcc: AccountRecord = {
      id: `acc_${Date.now()}`,
      name: newAccName,
      type: newAccType,
      balance: bal,
      currency: 'COP',
      investmentMeta: rate > 0 ? { annualRatePercent: rate } : undefined,
      updatedAt: new Date().toISOString(),
    };

    await db.accounts.add(newAcc);
    setNewAccName('');
    setNewAccBalance('');
    setNewAccAnnualRate('');
    setIsAddAccountOpen(false);
    triggerRefresh();
    showMessage(t.common.success, 'success');
  };

  // Add Income / Expense
  const handleCreateTx = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(txAmount);
    if (!amount || !selectedAccId) return;

    const acc = await db.accounts.get(selectedAccId);
    if (!acc) return;

    const newBalance = txType === 'income' ? acc.balance + amount : acc.balance - amount;
    const nowIso = new Date().toISOString();

    await db.transaction('rw', [db.accounts, db.transactions], async () => {
      await db.accounts.update(selectedAccId, { balance: newBalance, updatedAt: nowIso });
      await db.transactions.add({
        id: `tx_${Date.now()}`,
        accountId: selectedAccId,
        type: txType,
        amount,
        category: txCategory,
        description: txDesc || (txType === 'income' ? 'Ingreso' : 'Gasto'),
        date: nowIso.slice(0, 10),
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    });

    setTxAmount('');
    setTxDesc('');
    setIsTxModalOpen(false);
    triggerRefresh();
    showMessage(t.common.success, 'success');
  };

  // Transfer
  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(transferAmount);
    if (!amount || !fromAccId || !toAccId || fromAccId === toAccId) return;

    const fromAcc = await db.accounts.get(fromAccId);
    const toAcc = await db.accounts.get(toAccId);
    if (!fromAcc || !toAcc) return;

    const nowIso = new Date().toISOString();
    await db.transaction('rw', [db.accounts, db.transactions], async () => {
      await db.accounts.update(fromAccId, { balance: fromAcc.balance - amount, updatedAt: nowIso });
      await db.accounts.update(toAccId, { balance: toAcc.balance + amount, updatedAt: nowIso });
      await db.transactions.add({
        id: `tx_tr_${Date.now()}`,
        accountId: fromAccId,
        toAccountId: toAccId,
        type: 'transfer',
        amount,
        category: 'Transferencia',
        description: `Transferencia a ${toAcc.name}`,
        date: nowIso.slice(0, 10),
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    });

    setTransferAmount('');
    setIsTransferModalOpen(false);
    triggerRefresh();
    showMessage(t.common.success, 'success');
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">{t.accounts.title}</h1>
          <p className="text-sm text-gray-400">Administra tus billeteras físicas, virtuales e inversiones de capital</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsTransferModalOpen(true)}
            className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 px-3.5 py-2 rounded-xl text-xs font-semibold border border-gray-700 transition-colors shadow-sm"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-400" />
            <span>{t.accounts.transfer}</span>
          </button>
          <button
            onClick={() => {
              setTxType('income');
              setIsTxModalOpen(true);
            }}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shadow-md"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.accounts.addIncome}</span>
          </button>
          <button
            onClick={() => {
              setTxType('expense');
              setIsTxModalOpen(true);
            }}
            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shadow-md"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.accounts.addExpense}</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{t.accounts.wallets}</span>
          <div className="text-xl font-bold text-white mt-1">{formatCurrency(totalLiquid)}</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{t.accounts.investments}</span>
          <div className="text-xl font-bold text-indigo-300 mt-1">{formatCurrency(totalInvestment)}</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{t.accounts.netWorth}</span>
          <div className="text-xl font-bold text-amber-300 mt-1">{formatCurrency(totalLiquid + totalInvestment)}</div>
        </div>
      </div>

      {/* Section 1: Liquid Wallets */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Wallet className="w-5 h-5 text-indigo-400" />
            {t.accounts.wallets}
          </h2>
          <button
            onClick={() => {
              setNewAccType('wallet');
              setIsAddAccountOpen(true);
            }}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Nueva Billetera
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {wallets.map((acc) => (
            <div key={acc.id} className="bg-gray-900/90 border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-all shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-100 text-base">{acc.name}</span>
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <Wallet className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-white mt-3 font-mono">
                  {formatCurrency(acc.balance)}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-800/80 flex items-center justify-between text-xs text-gray-400">
                <span>Líquido para pagos</span>
                <button
                  onClick={() => {
                    setSelectedAccId(acc.id);
                    setTxType('expense');
                    setIsTxModalOpen(true);
                  }}
                  className="text-indigo-400 hover:text-indigo-300 font-medium"
                >
                  Mover Dinero
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Capital & Investments */}
      <div className="space-y-3 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Building className="w-5 h-5 text-purple-400" />
            {t.accounts.investments}
          </h2>
          <button
            onClick={() => {
              setNewAccType('investment');
              setIsAddAccountOpen(true);
            }}
            className="text-xs text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Nueva Inversión
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {investments.map((acc) => {
            let displayVal = acc.balance;
            if (acc.investmentMeta?.units && acc.investmentMeta?.fxRate) {
              displayVal = acc.investmentMeta.units * acc.investmentMeta.fxRate;
            }
            return (
              <div key={acc.id} className="bg-gray-900/90 border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-all shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-100 text-base">{acc.name}</span>
                    <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-indigo-200 mt-3 font-mono">
                    {formatCurrency(displayVal)}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-800/80 text-xs text-gray-400 space-y-1">
                  {acc.investmentMeta?.annualRatePercent && (
                    <div className="flex justify-between">
                      <span>Rendimiento Estimado:</span>
                      <span className="font-semibold text-emerald-400">{acc.investmentMeta.annualRatePercent}% EA</span>
                    </div>
                  )}
                  {acc.investmentMeta?.units && (
                    <div className="flex justify-between">
                      <span>Posición:</span>
                      <span className="font-mono text-gray-300">{acc.investmentMeta.units} @ {formatCurrency(acc.investmentMeta.fxRate || 1)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Transaction History */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <h3 className="font-bold text-base text-white">Historial de Movimientos Recientes</h3>
        <div className="divide-y divide-gray-800">
          {transactions.length === 0 ? (
            <p className="text-xs text-gray-500 py-6 text-center">No hay transacciones registradas aún.</p>
          ) : (
            transactions.map((tx) => (
              <div key={tx.id} className="py-3 flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-gray-200">{tx.description}</p>
                  <p className="text-xs text-gray-500">{tx.date} • {tx.category}</p>
                </div>
                <div className={`font-mono text-sm font-bold ${tx.type === 'income' ? 'text-emerald-400' : tx.type === 'expense' ? 'text-rose-400' : 'text-indigo-400'}`}>
                  {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : '⇄'}{formatCurrency(tx.amount)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal: New Account */}
      {isAddAccountOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">Nueva Cuenta</h3>
              <button onClick={() => setIsAddAccountOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-300">Nombre de la Cuenta</label>
                <input
                  type="text"
                  placeholder="ej. Daviplata, Nequi, Fiducia"
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-300">Tipo</label>
                <select
                  value={newAccType}
                  onChange={(e) => setNewAccType(e.target.value as any)}
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="wallet">Billetera Líquida (Disponible)</option>
                  <option value="investment">Patrimonio / Inversión (Largo plazo)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-300">Saldo Inicial (COP)</label>
                <input
                  type="number"
                  placeholder="ej. 500000"
                  value={newAccBalance}
                  onChange={(e) => setNewAccBalance(e.target.value)}
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              {newAccType === 'investment' && (
                <div>
                  <label className="text-xs font-semibold text-gray-300">Tasa Anual Estimada (% EA)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="ej. 7.0"
                    value={newAccAnnualRate}
                    onChange={(e) => setNewAccAnnualRate(e.target.value)}
                    className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddAccountOpen(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-xl text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-semibold shadow-lg"
                >
                  Crear Cuenta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Income / Expense */}
      {isTxModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">
                {txType === 'income' ? 'Registrar Ingreso' : 'Registrar Gasto'}
              </h3>
              <button onClick={() => setIsTxModalOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateTx} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-300">Billetera / Cuenta</label>
                <select
                  value={selectedAccId}
                  onChange={(e) => setSelectedAccId(e.target.value)}
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatCurrency(a.balance)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-300">Monto (COP)</label>
                <input
                  type="number"
                  placeholder="ej. 50000"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-300">Categoría</label>
                <input
                  type="text"
                  placeholder="ej. Mercado, Transporte, Almuerzo"
                  value={txCategory}
                  onChange={(e) => setTxCategory(e.target.value)}
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-300">Descripción / Nota</label>
                <input
                  type="text"
                  placeholder="Nota opcional"
                  value={txDesc}
                  onChange={(e) => setTxDesc(e.target.value)}
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTxModalOpen(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-xl text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold shadow-lg text-white ${
                    txType === 'income' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
                  }`}
                >
                  Registrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Transfer Between Accounts */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">Transferir Dinero</h3>
              <button onClick={() => setIsTransferModalOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleTransfer} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-300">Desde (Origen)</label>
                <select
                  value={fromAccId}
                  onChange={(e) => setFromAccId(e.target.value)}
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatCurrency(a.balance)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-300">Hacia (Destino)</label>
                <select
                  value={toAccId}
                  onChange={(e) => setToAccId(e.target.value)}
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatCurrency(a.balance)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-300">Monto a Transferir (COP)</label>
                <input
                  type="number"
                  placeholder="ej. 200000"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-xl text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-semibold shadow-lg"
                >
                  Transferir
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
