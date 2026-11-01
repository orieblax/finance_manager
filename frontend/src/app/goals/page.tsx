'use client';

import React, { useState, useEffect } from 'react';
import { Target, Plus, CheckCircle2, TrendingUp, DollarSign, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { db, GoalRecord, AccountRecord } from '@/lib/db/dexie';
import { formatCurrency } from '@/lib/i18n';
import { restoreFromCloud } from '@/lib/sync/cloudSync';

export default function GoalsPage() {
  const { t, refreshTrigger, triggerRefresh, showMessage, user, authLoading } = useApp();
  const [goals, setGoals] = useState<GoalRecord[]>([]);
  const [wallets, setWallets] = useState<AccountRecord[]>([]);

  // Add Goal Modal
  const [isAddGoalOpen, setIsAddGoalOpen] = useState(false);
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalCurrent, setGoalCurrent] = useState('');

  // Allocate Money Modal
  const [allocatingGoal, setAllocatingGoal] = useState<GoalRecord | null>(null);
  const [allocWalletId, setAllocWalletId] = useState('');
  const [allocAmount, setAllocAmount] = useState('');

  useEffect(() => {
    async function loadGoals() {
      let [gList, wList] = await Promise.all([
        db.goals.toArray(),
        db.accounts.where('type').equals('wallet').toArray(),
      ]);

      if (gList.length === 0 && user) {
        try {
          const res = await restoreFromCloud(undefined, user.id);
          if (res.success && res.found) {
            [gList, wList] = await Promise.all([
              db.goals.toArray(),
              db.accounts.where('type').equals('wallet').toArray(),
            ]);
          }
        } catch {}
      }

      setGoals(gList);
      setWallets(wList);
      if (wList.length > 0) setAllocWalletId(wList[0].id);
    }
    loadGoals();
  }, [refreshTrigger, user]);

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalName) return;

    const target = parseFloat(goalTarget) || 1000000;
    const current = parseFloat(goalCurrent) || 0;

    await db.goals.add({
      id: `goal_${Date.now()}`,
      name: goalName,
      targetAmount: target,
      currentAmount: current,
      updatedAt: new Date().toISOString(),
    });

    setGoalName('');
    setGoalTarget('');
    setGoalCurrent('');
    setIsAddGoalOpen(false);
    triggerRefresh();
    showMessage(t.common.success, 'success');
  };

  const handleAllocate = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(allocAmount);
    if (!amount || !allocatingGoal || !allocWalletId) return;

    const wallet = await db.accounts.get(allocWalletId);
    if (!wallet) return;

    const nowIso = new Date().toISOString();
    await db.transaction('rw', [db.accounts, db.goals, db.transactions], async () => {
      // 1. Deduct from wallet
      await db.accounts.update(allocWalletId, {
        balance: wallet.balance - amount,
        updatedAt: nowIso,
      });

      // 2. Increase goal
      await db.goals.update(allocatingGoal.id, {
        currentAmount: allocatingGoal.currentAmount + amount,
        updatedAt: nowIso,
      });

      // 3. Log transaction
      await db.transactions.add({
        id: `tx_goal_${Date.now()}`,
        accountId: allocWalletId,
        type: 'expense',
        amount,
        category: 'Ahorro / Metas',
        description: `Aporte a meta: ${allocatingGoal.name}`,
        date: nowIso.slice(0, 10),
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    });

    setAllocatingGoal(null);
    setAllocAmount('');
    triggerRefresh();
    showMessage(t.common.success, 'success');
  };

  const totalSaved = goals.reduce((sum, g) => sum + g.currentAmount, 0);
  const totalTarget = goals.reduce((sum, g) => sum + g.targetAmount, 0);
  const overallPct = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;

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
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">{t.goals.title}</h1>
          <p className="text-sm text-gray-400">Planifica y haz seguimiento a tus metas de ahorro a mediano y largo plazo</p>
        </div>

        <button
          onClick={() => setIsAddGoalOpen(true)}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-md transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t.goals.newGoal}</span>
        </button>
      </div>

      {/* Overview Card */}
      <div className="bg-gradient-to-r from-indigo-950/40 to-purple-950/30 border border-gray-800 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Ahorro Total en Metas</span>
            <div className="text-2xl md:text-3xl font-black text-white mt-1">
              {formatCurrency(totalSaved)} <span className="text-sm font-normal text-gray-400">/ {formatCurrency(totalTarget)}</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black text-indigo-300 font-mono">{overallPct.toFixed(1)}%</span>
            <p className="text-xs text-gray-400">Progreso general</p>
          </div>
        </div>

        <div className="w-full bg-gray-800 h-3 rounded-full overflow-hidden">
          <div
            className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(1, overallPct))}%` }}
          />
        </div>
      </div>

      {/* Goals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {goals.map((g) => {
          const pct = g.targetAmount > 0 ? (g.currentAmount / g.targetAmount) * 100 : 0;
          return (
            <div key={g.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-100 text-base">{g.name}</span>
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                    <Target className="w-4 h-4" />
                  </div>
                </div>

                <div className="text-xl font-black text-white mt-3 font-mono">
                  {formatCurrency(g.currentAmount)}
                  <span className="text-xs font-normal text-gray-400 block mt-0.5">
                    Meta: {formatCurrency(g.targetAmount)}
                  </span>
                </div>

                <div className="mt-3 space-y-1">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{t.goals.progress}</span>
                    <span className="font-mono text-indigo-300 font-bold">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(1, pct))}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-gray-800">
                <button
                  onClick={() => setAllocatingGoal(g)}
                  className="w-full bg-gray-800 hover:bg-gray-700 text-indigo-300 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <DollarSign className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Aportar a esta meta</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: New Goal */}
      {isAddGoalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">Nueva Meta de Ahorro</h3>
              <button onClick={() => setIsAddGoalOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateGoal} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-300">Nombre de la Meta</label>
                <input
                  type="text"
                  placeholder="ej. Maestría, Viaje, Casa brisas"
                  value={goalName}
                  onChange={(e) => setGoalName(e.target.value)}
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-300">Monto Objetivo (COP)</label>
                <input
                  type="number"
                  placeholder="ej. 10000000"
                  value={goalTarget}
                  onChange={(e) => setGoalTarget(e.target.value)}
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-300">Monto Ahorrado Actualmente (COP)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={goalCurrent}
                  onChange={(e) => setGoalCurrent(e.target.value)}
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddGoalOpen(false)}
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

      {/* Modal: Allocate Money */}
      {allocatingGoal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">Aportar a: {allocatingGoal.name}</h3>
              <button onClick={() => setAllocatingGoal(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAllocate} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-300">Billetera de Origen</label>
                <select
                  value={allocWalletId}
                  onChange={(e) => setAllocWalletId(e.target.value)}
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({formatCurrency(w.balance)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-300">Monto del Aporte (COP)</label>
                <input
                  type="number"
                  placeholder="ej. 200000"
                  value={allocAmount}
                  onChange={(e) => setAllocAmount(e.target.value)}
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAllocatingGoal(null)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-xl text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-semibold shadow-lg"
                >
                  Confirmar Aporte
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
