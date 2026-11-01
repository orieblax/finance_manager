import { describe, it, expect } from 'vitest';
import { calculateProjections } from './projections';

describe('Financial Projections & Excel Parity', () => {
  it('matches Gastos Albeiro.xlsx formulas and totals precisely', () => {
    const report = calculateProjections({
      referenceDate: new Date('2026-10-15T12:00:00Z'),
      accounts: [
        { id: '1', name: 'Daviplata', type: 'wallet', balance: 2893, currency: 'COP', updatedAt: '' },
        { id: '2', name: 'Caja social', type: 'wallet', balance: 43637, currency: 'COP', updatedAt: '' },
        { id: '3', name: 'Bolsillo', type: 'wallet', balance: 200000, currency: 'COP', updatedAt: '' },
        { id: '4', name: 'Colchon', type: 'wallet', balance: 0, currency: 'COP', updatedAt: '' },
        { id: '5', name: 'Nequi', type: 'wallet', balance: 724549, currency: 'COP', updatedAt: '' },
        { id: '6', name: 'Fiducia', type: 'investment', balance: 30000000, currency: 'COP', updatedAt: '' },
        { id: '7', name: 'Crypto', type: 'investment', balance: 0, currency: 'COP', investmentMeta: { units: 200, fxRate: 3400 }, updatedAt: '' },
      ],
      recurringExpenses: [
        { id: 'e1', monthKey: '2026-10', name: 'Merc Aseo', category: 'Hogar', budgetedAmount: 925000, remainingAmount: 120000, dueDay: 1, frequency: 'monthly', isPaid: false, updatedAt: '' },
        { id: 'e2', monthKey: '2026-10', name: 'Movistar', category: 'Servicios', budgetedAmount: 60000, remainingAmount: 25000, dueDay: 26, frequency: 'monthly', isPaid: false, updatedAt: '' },
        { id: 'e3', monthKey: '2026-10', name: 'Internet', category: 'Servicios', budgetedAmount: 15000, remainingAmount: 0, dueDay: 25, frequency: 'monthly', isPaid: true, updatedAt: '' },
        { id: 'e4', monthKey: '2026-10', name: 'Gas', category: 'Servicios', budgetedAmount: 10000, remainingAmount: 10000, dueDay: 15, frequency: 'monthly', isPaid: false, updatedAt: '' },
        { id: 'e5', monthKey: '2026-10', name: 'Energía', category: 'Servicios', budgetedAmount: 180000, remainingAmount: 180000, dueDay: 20, frequency: 'monthly', isPaid: false, updatedAt: '' },
        { id: 'e6', monthKey: '2026-10', name: 'Agua', category: 'Servicios', budgetedAmount: 35000, remainingAmount: 0, dueDay: 25, frequency: 'monthly', isPaid: true, updatedAt: '' },
        { id: 'e7', monthKey: '2026-10', name: 'Mamá', category: 'Familia', budgetedAmount: 750000, remainingAmount: 0, dueDay: 1, frequency: 'monthly', isPaid: true, updatedAt: '' },
        { id: 'e8', monthKey: '2026-10', name: 'Papá', category: 'Familia', budgetedAmount: 260000, remainingAmount: 130000, dueDay: 15, frequency: 'monthly', isPaid: false, updatedAt: '' },
        { id: 'e9', monthKey: '2026-10', name: 'Planilla', category: 'Obligaciones', budgetedAmount: 508000, remainingAmount: 508000, dueDay: 1, frequency: 'monthly', isPaid: false, updatedAt: '' },
        { id: 'e10', monthKey: '2026-10', name: 'Moto', category: 'Transporte', budgetedAmount: 40000, remainingAmount: 40000, dueDay: 7, frequency: 'weekly', isPaid: false, updatedAt: '' },
      ],
      receivables: [
        { id: 'r1', monthKey: '2026-10', tenantName: 'Fiducia Yield', amount: 175000, deductions: 0, netAmount: 175000, dueDay: 1, isCollected: false, updatedAt: '' },
        { id: 'r2', monthKey: '2026-10', tenantName: 'Ana 26', amount: 700000, deductions: 0, netAmount: 700000, dueDay: 26, isCollected: false, updatedAt: '' },
        { id: 'r3', monthKey: '2026-10', tenantName: 'Marisol 23', amount: 950000, deductions: 45700, netAmount: 904300, dueDay: 23, isCollected: false, updatedAt: '' },
        { id: 'r4', monthKey: '2026-10', tenantName: 'Camila 20', amount: 500000, deductions: -27984, netAmount: 527984, dueDay: 20, isCollected: false, updatedAt: '' },
        { id: 'r5', monthKey: '2026-10', tenantName: 'Angelica 1', amount: 500000, deductions: 0, netAmount: 500000, dueDay: 1, isCollected: false, updatedAt: '' },
        { id: 'r6', monthKey: '2026-10', tenantName: 'Odeth 28', amount: 340000, deductions: 0, netAmount: 340000, dueDay: 28, isCollected: false, updatedAt: '' },
      ],
      monthlyExtras: [
        { id: 'x1', monthKey: '2026-10', name: 'Freelance', type: 'income', rawAmount: 1100000, netMultiplier: 0.89, netAmount: 979000, isSettled: false, updatedAt: '' },
        { id: 'x2', monthKey: '2026-10', name: 'Med agua', type: 'expense', rawAmount: 160000, netMultiplier: 1.0, netAmount: 160000, isSettled: false, updatedAt: '' },
      ],
    });

    // 1. Total liquid cash = 971,079
    expect(report.totalLiquidCash).toBe(971079);

    // 2. Pending expenses = 1,013,000
    expect(report.totalPendingExpenses).toBe(1013000);

    // 3. Restante = 971079 - 1013000 = -41,921
    expect(report.immediateRestante).toBe(-41921);

    // 4. Total Budgeted expenses = 2,783,000
    expect(report.totalBudgetedExpenses).toBe(2783000);

    // 5. Total pending receivables (3,147,284) + pending net extras (819,000) = 3,966,284 (Excel Row 21 "Pend")
    const pendingIncoming = report.pendingReceivables + report.pendingNetExtras;
    expect(pendingIncoming).toBe(3966284);

    // 6. Excel Row 22 "Incl Pend": Restante + PendingIncoming - BudgetedExpenses = 1,141,363
    expect(report.nextCycleBuffer).toBe(1141363);

    // 7. Investments: 30,000,000 + 680,000 = 30,680,000
    expect(report.totalInvestmentCapital).toBe(30680000);
  });
});
