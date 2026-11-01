import {
  AccountRecord,
  ReceivableRecord,
  RecurringExpenseRecord,
  MonthlyExtraRecord,
} from '../db/dexie';

export interface FinancialStateInput {
  accounts: AccountRecord[];
  receivables: ReceivableRecord[];
  recurringExpenses: RecurringExpenseRecord[];
  monthlyExtras: MonthlyExtraRecord[];
  referenceDate?: Date;
}

export interface FinancialReport {
  totalLiquidCash: number;
  totalInvestmentCapital: number;
  netWorth: number;
  totalBudgetedExpenses: number;
  totalPendingExpenses: number;
  immediateRestante: number;
  totalReceivablesBudget: number;
  pendingReceivables: number;
  pendingNetExtras: number;
  endOfWeekAvailable: number;
  endOfMonthAvailable: number;
  nextCycleBuffer: number; // Matches Excel row 22: "Incl Pend"
  monthlyNetSavings: number;
  endOfYearAvailable: number;
  categoryExpenses: Record<string, number>;
}

export function calculateProjections(state: FinancialStateInput): FinancialReport {
  const refDate = state.referenceDate || new Date();
  const currentDay = refDate.getDate();

  let totalLiquidCash = 0;
  let totalInvestmentCapital = 0;

  // 1. Wallets vs Investments
  for (const acc of state.accounts) {
    if (acc.isArchived) continue;
    if (acc.type === 'investment') {
      let val = acc.balance;
      if (acc.investmentMeta && acc.investmentMeta.units && acc.investmentMeta.fxRate) {
        val = acc.investmentMeta.units * acc.investmentMeta.fxRate;
      }
      totalInvestmentCapital += val;
    } else {
      totalLiquidCash += acc.balance;
    }
  }

  const netWorth = totalLiquidCash + totalInvestmentCapital;

  // 2. Expenses & Category breakdown
  let totalBudgetedExpenses = 0;
  let totalPendingExpenses = 0;
  const categoryExpenses: Record<string, number> = {};

  for (const exp of state.recurringExpenses) {
    totalBudgetedExpenses += exp.budgetedAmount;
    const cat = exp.category || 'Otros';
    categoryExpenses[cat] = (categoryExpenses[cat] || 0) + exp.budgetedAmount;
    if (!exp.isPaid && exp.remainingAmount > 0) {
      totalPendingExpenses += exp.remainingAmount;
    }
  }

  // 3. Receivables
  let totalReceivablesBudget = 0;
  let pendingReceivables = 0;

  for (const rec of state.receivables) {
    totalReceivablesBudget += rec.netAmount;
    if (!rec.isCollected) {
      pendingReceivables += rec.netAmount;
    }
  }

  // 4. Extras
  let pendingNetExtras = 0;
  for (const ext of state.monthlyExtras) {
    if (ext.type === 'expense') {
      categoryExpenses['Extras'] = (categoryExpenses['Extras'] || 0) + ext.netAmount;
    }
    if (!ext.isSettled) {
      if (ext.type === 'income') {
        pendingNetExtras += ext.netAmount;
      } else {
        pendingNetExtras -= ext.netAmount;
      }
    }
  }

  // 5. Restante (Immediate spendable balance after remaining bills)
  const immediateRestante = totalLiquidCash - totalPendingExpenses;

  // 6. Projections
  // End of Week
  const dayOfWeek = refDate.getDay(); // 0 is Sunday
  const daysUntilSunday = (7 - dayOfWeek) % 7;
  const endOfWeekDay = currentDay + daysUntilSunday;

  let weekPendingExpenses = 0;
  for (const exp of state.recurringExpenses) {
    if (!exp.isPaid && exp.remainingAmount > 0 && exp.dueDay >= currentDay && exp.dueDay <= endOfWeekDay) {
      weekPendingExpenses += exp.remainingAmount;
    }
  }

  let weekPendingReceivables = 0;
  for (const rec of state.receivables) {
    if (!rec.isCollected && rec.dueDay >= currentDay && rec.dueDay <= endOfWeekDay) {
      weekPendingReceivables += rec.netAmount;
    }
  }

  const endOfWeekAvailable = totalLiquidCash - weekPendingExpenses + weekPendingReceivables;

  // End of Month: TotalLiquidCash - PendingExpenses + PendingReceivables + PendingNetExtras
  const endOfMonthAvailable = totalLiquidCash - totalPendingExpenses + pendingReceivables + pendingNetExtras;

  // Next Cycle Buffer (Excel Row 22: Incl Pend = B20 + SUM(B8:B14) - F18 = EndOfMonth - TotalBudgetedExpenses)
  const nextCycleBuffer = endOfMonthAvailable - totalBudgetedExpenses;

  // End of Year: EndOfMonth + (remainingMonths * monthlyNetSavings)
  const monthlyNetSavings = totalReceivablesBudget - totalBudgetedExpenses;
  const currentMonthIdx = refDate.getMonth(); // 0-11
  const remainingMonths = Math.max(0, 11 - currentMonthIdx);
  const endOfYearAvailable = endOfMonthAvailable + (remainingMonths * monthlyNetSavings);

  return {
    totalLiquidCash,
    totalInvestmentCapital,
    netWorth,
    totalBudgetedExpenses,
    totalPendingExpenses,
    immediateRestante,
    totalReceivablesBudget,
    pendingReceivables,
    pendingNetExtras,
    endOfWeekAvailable,
    endOfMonthAvailable,
    nextCycleBuffer,
    monthlyNetSavings,
    endOfYearAvailable,
    categoryExpenses,
  };
}
