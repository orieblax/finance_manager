package finance

import (
	"time"
)

type AccountType string

const (
	AccountWallet     AccountType = "wallet"
	AccountInvestment AccountType = "investment"
)

type Account struct {
	ID             string      `json:"id"`
	Name           string      `json:"name"`
	Type           AccountType `json:"type"`
	Balance        float64     `json:"balance"`
	Currency       string      `json:"currency"`
	InvestmentMeta *InvestMeta `json:"investment_meta,omitempty"`
}

type InvestMeta struct {
	AnnualRatePercent float64 `json:"annual_rate_percent,omitempty"` // For Fiducia e.g. 7.0 (7% EA)
	Units             float64 `json:"units,omitempty"`               // For Crypto
	FxRate            float64 `json:"fx_rate,omitempty"`             // Exchange rate
}

type Receivable struct {
	ID          string  `json:"id"`
	TenantName  string  `json:"tenant_name"`
	Amount      float64 `json:"amount"`
	Deductions  float64 `json:"deductions"`
	NetAmount   float64 `json:"net_amount"`
	DueDay      int     `json:"due_day"`
	IsCollected bool    `json:"is_collected"`
}

type RecurringExpense struct {
	ID              string  `json:"id"`
	Name            string  `json:"name"`
	Category        string  `json:"category"`
	BudgetedAmount  float64 `json:"budgeted_amount"`
	RemainingAmount float64 `json:"remaining_amount"`
	DueDay          int     `json:"due_day"`
	Frequency       string  `json:"frequency"` // "daily", "weekly", "biweekly", "monthly"
	IsPaid          bool    `json:"is_paid"`
}

type MonthlyExtra struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Type          string  `json:"type"` // "income" or "expense"
	RawAmount     float64 `json:"raw_amount"`
	NetMultiplier float64 `json:"net_multiplier"`
	NetAmount     float64 `json:"net_amount"`
	IsSettled     bool    `json:"is_settled"`
}

type FinancialState struct {
	Accounts          []Account          `json:"accounts"`
	Receivables       []Receivable       `json:"receivables"`
	RecurringExpenses []RecurringExpense `json:"recurring_expenses"`
	MonthlyExtras     []MonthlyExtra     `json:"monthly_extras"`
	ReferenceDate     *time.Time         `json:"reference_date,omitempty"`
}

type ProjectionReport struct {
	TotalLiquidCash         float64            `json:"total_liquid_cash"`
	TotalInvestmentCapital  float64            `json:"total_investment_capital"`
	NetWorth                float64            `json:"net_worth"`
	TotalBudgetedExpenses   float64            `json:"total_budgeted_expenses"`
	TotalPendingExpenses    float64            `json:"total_pending_expenses"`
	ImmediateRestante       float64            `json:"immediate_restante"`
	TotalReceivablesBudget  float64            `json:"total_receivables_budget"`
	PendingReceivables      float64            `json:"pending_receivables"`
	PendingNetExtras        float64            `json:"pending_net_extras"`
	EndOfWeekAvailable      float64            `json:"end_of_week_available"`
	EndOfMonthAvailable     float64            `json:"end_of_month_available"`
	NextCycleBuffer         float64            `json:"next_cycle_buffer"` // Excel: "Incl Pend"
	MonthlyNetSavings       float64            `json:"monthly_net_savings"`
	EndOfYearAvailable      float64            `json:"end_of_year_available"`
	CategoryExpensesBreakdown map[string]float64 `json:"category_expenses_breakdown"`
}

// CalculateFinancialMetrics computes all KPIs and cash availability projections.
func CalculateFinancialMetrics(state FinancialState) ProjectionReport {
	var refDate time.Time
	if state.ReferenceDate != nil {
		refDate = *state.ReferenceDate
	} else {
		refDate = time.Now()
	}

	report := ProjectionReport{
		CategoryExpensesBreakdown: make(map[string]float64),
	}

	// 1. Wallets vs Investments
	for _, acc := range state.Accounts {
		if acc.Type == AccountInvestment {
			bal := acc.Balance
			if acc.InvestmentMeta != nil && acc.InvestmentMeta.Units > 0 && acc.InvestmentMeta.FxRate > 0 {
				bal = acc.InvestmentMeta.Units * acc.InvestmentMeta.FxRate
			}
			report.TotalInvestmentCapital += bal
		} else {
			report.TotalLiquidCash += acc.Balance
		}
	}
	report.NetWorth = report.TotalLiquidCash + report.TotalInvestmentCapital

	// 2. Recurring expenses & categories
	for _, exp := range state.RecurringExpenses {
		report.TotalBudgetedExpenses += exp.BudgetedAmount
		report.CategoryExpensesBreakdown[exp.Category] += exp.BudgetedAmount
		if !exp.IsPaid && exp.RemainingAmount > 0 {
			report.TotalPendingExpenses += exp.RemainingAmount
		}
	}

	// 3. Receivables
	for _, rec := range state.Receivables {
		report.TotalReceivablesBudget += rec.NetAmount
		if !rec.IsCollected {
			report.PendingReceivables += rec.NetAmount
		}
	}

	// 4. Extras
	for _, ext := range state.MonthlyExtras {
		if ext.Type == "expense" {
			report.CategoryExpensesBreakdown["Extras"] += ext.NetAmount
		}
		if !ext.IsSettled {
			if ext.Type == "income" {
				report.PendingNetExtras += ext.NetAmount
			} else {
				report.PendingNetExtras -= ext.NetAmount
			}
		}
	}

	// 5. Restante (Immediate spendable balance after pending monthly bills)
	report.ImmediateRestante = report.TotalLiquidCash - report.TotalPendingExpenses

	// 6. Projections: End of Week, End of Month, End of Year
	currentDay := refDate.Day()
	daysUntilSunday := (7 - int(refDate.Weekday())) % 7
	endOfWeekDay := currentDay + daysUntilSunday

	// Week available
	weekPendingExpenses := 0.0
	for _, exp := range state.RecurringExpenses {
		if !exp.IsPaid && exp.RemainingAmount > 0 && exp.DueDay >= currentDay && exp.DueDay <= endOfWeekDay {
			weekPendingExpenses += exp.RemainingAmount
		}
	}
	weekPendingReceivables := 0.0
	for _, rec := range state.Receivables {
		if !rec.IsCollected && rec.DueDay >= currentDay && rec.DueDay <= endOfWeekDay {
			weekPendingReceivables += rec.NetAmount
		}
	}
	report.EndOfWeekAvailable = report.TotalLiquidCash - weekPendingExpenses + weekPendingReceivables

	// Month available: TotalLiquidCash - PendingExpenses + PendingReceivables + PendingNetExtras
	report.EndOfMonthAvailable = report.TotalLiquidCash - report.TotalPendingExpenses + report.PendingReceivables + report.PendingNetExtras

	// Next cycle buffer (Excel row 22: Incl Pend = Restante + PendingReceivables + NetExtras - TotalBudgetedExpenses)
	report.NextCycleBuffer = report.EndOfMonthAvailable - report.TotalBudgetedExpenses

	// Year available: EndOfMonth + (remainingMonths * monthlyNetSavings)
	totalMonthlyIncomeEstimate := report.TotalReceivablesBudget
	report.MonthlyNetSavings = totalMonthlyIncomeEstimate - report.TotalBudgetedExpenses
	remainingMonths := 12 - int(refDate.Month())
	if remainingMonths < 0 {
		remainingMonths = 0
	}
	report.EndOfYearAvailable = report.EndOfMonthAvailable + (float64(remainingMonths) * report.MonthlyNetSavings)

	return report
}
